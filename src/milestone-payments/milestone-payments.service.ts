import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/schemas/notification.schema';
import { PaymentsService } from '../payments/payments.service';
import { Dispute } from '../payments/schemas/dispute.schema';
import { ProjectRequest } from '../project-request/schemas/project-request.schema';
import {
  ProposeMilestoneItemDto,
  RaiseMilestoneDisputeDto,
} from './dto/milestone-payment.dto';
import {
  MilestonePayment,
  MilestonePaymentStatus,
} from './schemas/milestone-payment.schema';

/** Days the client has to review after a pro marks work done before auto-release. */
const AUTO_CONFIRM_DAYS = 7;

@Injectable()
export class MilestonePaymentsService {
  private readonly logger = new Logger(MilestonePaymentsService.name);

  constructor(
    @InjectModel(MilestonePayment.name)
    private readonly mpModel: Model<MilestonePayment>,
    @InjectModel(ProjectRequest.name)
    private readonly projectModel: Model<ProjectRequest>,
    @InjectModel(Dispute.name)
    private readonly disputeModel: Model<Dispute>,
    private readonly payments: PaymentsService,
    private readonly config: ConfigService,
    private readonly notifications: NotificationsService,
  ) {}

  // --- notifications (best-effort; never break the payment flow) ----------

  private gel(minor: number): string {
    return `${Math.round(minor / 100)
      .toLocaleString('en-US')
      .replace(/,/g, ' ')} ₾`;
  }

  private notify(
    userId: Types.ObjectId | string,
    type: NotificationType,
    title: string,
    message: string,
    link: string,
    mpId: string,
    params?: Record<string, string | number>,
  ): void {
    this.notifications
      .notify(userId.toString(), type, title, message, {
        link,
        referenceId: mpId,
        referenceModel: 'MilestonePayment',
        i18n: {
          titleKey: `notifications.types.${type}.title`,
          messageKey: `notifications.types.${type}.message`,
          params,
        },
      })
      .catch((e) =>
        this.logger.warn(`notify ${type} failed: ${(e as Error).message}`),
      );
  }

  private clientLink(projectId: Types.ObjectId | string): string {
    return `/projects/${projectId.toString()}?tab=team`;
  }
  private readonly proLink = '/my-space';

  // ---- helpers -----------------------------------------------------------

  private async loadById(id: string): Promise<MilestonePayment> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Milestone payment not found');
    }
    const mp = await this.mpModel.findById(id).exec();
    if (!mp) throw new NotFoundException('Milestone payment not found');
    return mp;
  }

  private assertClient(mp: MilestonePayment, userId: string): void {
    if (mp.clientId.toString() !== userId) {
      throw new ForbiddenException('Only the project owner can do this');
    }
  }

  private assertPro(mp: MilestonePayment, userId: string): void {
    if (mp.proId.toString() !== userId) {
      throw new ForbiddenException('Only the assigned pro can do this');
    }
  }

  private assertParty(mp: MilestonePayment, userId: string): void {
    if (mp.clientId.toString() !== userId && mp.proId.toString() !== userId) {
      throw new ForbiddenException('Not your milestone payment');
    }
  }

  // ---- schedule authoring (pro proposes, client approves) ----------------

  /**
   * Pro drafts a payment schedule for an engagement they're assigned to.
   * Each item becomes a PROPOSED installment awaiting the client's approval.
   */
  async proposeSchedule(
    proUserId: string,
    projectId: string,
    engagementId: string,
    items: ProposeMilestoneItemDto[],
  ): Promise<MilestonePayment[]> {
    if (!Types.ObjectId.isValid(projectId)) {
      throw new NotFoundException('Project not found');
    }
    const project = await this.projectModel.findById(projectId).exec();
    if (!project) throw new NotFoundException('Project not found');
    const engagement = (project.engagements ?? []).find(
      (e) => e.id === engagementId,
    );
    if (!engagement) throw new NotFoundException('Engagement not found');
    if (engagement.assignedProId?.toString() !== proUserId) {
      throw new ForbiddenException('You are not assigned to this engagement');
    }

    const existing = await this.mpModel
      .countDocuments({ projectId, engagementId })
      .exec();

    // `clientId` is stored as a string on legacy projects; force both party
    // ids to ObjectId so the MP collection is internally consistent and
    // queryable by ObjectId.
    const clientObjId = new Types.ObjectId(String(project.clientId));
    const proObjId = new Types.ObjectId(String(engagement.assignedProId));

    const docs = await Promise.all(
      items.map((it, i) =>
        this.mpModel.create({
          projectId: project._id,
          engagementId,
          clientId: clientObjId,
          proId: proObjId,
          roleLabel: engagement.roleLabel,
          label: it.label.trim(),
          amountMinor: Math.round(it.amount * 100),
          currency: 'GEL',
          sortOrder: existing + i,
          status: MilestonePaymentStatus.PROPOSED,
        }),
      ),
    );
    // One ping to the client (not one per installment).
    this.notify(
      project.clientId,
      NotificationType.MILESTONE_PROPOSED,
      'Payment schedule proposed',
      `${engagement.roleLabel} proposed a payment schedule`,
      this.clientLink(project._id),
      String(docs[0]?._id ?? ''),
      { role: engagement.roleLabel },
    );
    return docs;
  }

  /**
   * Suggest a schedule total for an engagement, pulled from its scope items
   * (bill of works) - each carries quantity x unit price - falling back to the
   * engagement budget. The frontend turns this into a deposit/progress/final
   * split with localized labels. Pro-only.
   */
  async suggestSchedule(
    proUserId: string,
    projectId: string,
    engagementId: string,
  ): Promise<{ total: number; source: 'scope' | 'budget' | 'none'; scopeCount: number }> {
    if (!Types.ObjectId.isValid(projectId)) {
      throw new NotFoundException('Project not found');
    }
    const project = await this.projectModel.findById(projectId).lean().exec();
    if (!project) throw new NotFoundException('Project not found');
    const engagement = (project.engagements ?? []).find(
      (e: any) => e.id === engagementId,
    );
    if (!engagement) throw new NotFoundException('Engagement not found');
    if (engagement.assignedProId?.toString() !== proUserId) {
      throw new ForbiddenException('You are not assigned to this engagement');
    }

    const scopeItems = (project.scopeItems ?? []).filter(
      (s: any) => s.engagementId === engagementId,
    );
    const scopeTotal = scopeItems.reduce(
      (sum: number, s: any) => sum + (s.quantity || 0) * (s.unitPrice || 0),
      0,
    );
    if (scopeTotal > 0) {
      return { total: Math.round(scopeTotal), source: 'scope', scopeCount: scopeItems.length };
    }
    if (engagement.budget && engagement.budget > 0) {
      return { total: Math.round(engagement.budget), source: 'budget', scopeCount: 0 };
    }
    return { total: 0, source: 'none', scopeCount: 0 };
  }

  /** Client approves every PROPOSED installment for an engagement. */
  async approveSchedule(
    clientId: string,
    projectId: string,
    engagementId: string,
  ): Promise<{ approved: number }> {
    const project = await this.projectModel.findById(projectId).exec();
    if (!project) throw new NotFoundException('Project not found');
    if (project.clientId.toString() !== clientId) {
      throw new ForbiddenException('Only the project owner can approve');
    }
    const res = await this.mpModel
      .updateMany(
        {
          projectId: new Types.ObjectId(projectId),
          engagementId,
          status: MilestonePaymentStatus.PROPOSED,
        },
        { $set: { status: MilestonePaymentStatus.APPROVED, approvedAt: new Date() } },
      )
      .exec();
    const approved = res.modifiedCount ?? 0;
    const engagement = (project.engagements ?? []).find(
      (e) => e.id === engagementId,
    );
    if (approved > 0 && engagement?.assignedProId) {
      this.notify(
        engagement.assignedProId,
        NotificationType.MILESTONE_APPROVED,
        'Schedule approved',
        'Your payment schedule was approved',
        this.proLink,
        '',
      );
    }
    return { approved };
  }

  /** Client rejects a single proposed installment. */
  async decline(clientId: string, id: string): Promise<MilestonePayment> {
    const mp = await this.loadById(id);
    this.assertClient(mp, clientId);
    if (mp.status !== MilestonePaymentStatus.PROPOSED) {
      throw new BadRequestException('Only a proposed installment can be declined');
    }
    mp.status = MilestonePaymentStatus.DECLINED;
    return mp.save();
  }

  /** Remove a proposed (pro) or declined (client) installment before any money moves. */
  async remove(userId: string, id: string): Promise<{ deleted: true }> {
    const mp = await this.loadById(id);
    this.assertParty(mp, userId);
    const removable: MilestonePaymentStatus[] = [
      MilestonePaymentStatus.PROPOSED,
      MilestonePaymentStatus.DECLINED,
      MilestonePaymentStatus.APPROVED,
    ];
    if (!removable.includes(mp.status)) {
      throw new BadRequestException('Cannot remove a funded installment');
    }
    await this.mpModel.deleteOne({ _id: mp._id }).exec();
    return { deleted: true };
  }

  // ---- funding (client) --------------------------------------------------

  /** Client funds an approved installment - returns the Flitt redirect URL. */
  async fund(
    clientId: string,
    id: string,
  ): Promise<{ redirectUrl: string }> {
    const mp = await this.loadById(id);
    this.assertClient(mp, clientId);
    if (
      mp.status !== MilestonePaymentStatus.APPROVED &&
      mp.status !== MilestonePaymentStatus.FUNDED
    ) {
      throw new BadRequestException(
        `Cannot fund an installment in status ${mp.status}`,
      );
    }
    if (mp.status === MilestonePaymentStatus.FUNDED) {
      throw new BadRequestException('This installment is already funded');
    }

    const appUrl =
      this.config.get<string>('FRONTEND_URL') || 'http://localhost:3000';
    const mpId = mp._id.toString();
    const projectId = mp.projectId.toString();

    const result = await this.payments.createIntentForEntity({
      entityType: 'project_milestone',
      entityId: mpId,
      amountMinor: mp.amountMinor,
      currency: 'GEL',
      description: `Homico milestone: ${mp.label}`.slice(0, 100),
      payerUserId: clientId,
      payeeUserId: mp.proId.toString(),
      returnUrl: `${appUrl}/projects/${projectId}/pay/return?mp=${mpId}`,
      cancelUrl: `${appUrl}/projects/${projectId}/pay/cancelled?mp=${mpId}`,
    });

    mp.paymentId = new Types.ObjectId(result.paymentId);
    mp.paymentStatus = 'pending';
    await mp.save();
    return { redirectUrl: result.redirectUrl };
  }

  /**
   * Pull the authoritative payment + escrow state and reflect it onto the
   * installment. Safe to call anytime (idempotent). Returns the fresh doc.
   */
  async syncStatus(mp: MilestonePayment): Promise<MilestonePayment> {
    const mpId = mp._id.toString();
    const summary = await this.payments.findPaymentSummaryForEntity(
      'project_milestone',
      mpId,
    );
    if (!summary) return mp;

    let mutated = false;
    if (mp.paymentStatus !== summary.status) {
      mp.paymentStatus = summary.status;
      mutated = true;
    }

    // Payment just succeeded -> escrow now holds the money.
    if (
      summary.status === 'succeeded' &&
      mp.status === MilestonePaymentStatus.APPROVED
    ) {
      mp.status = MilestonePaymentStatus.FUNDED;
      mp.fundedAt = new Date();
      mutated = true;
      this.notify(
        mp.proId,
        NotificationType.MILESTONE_FUNDED,
        'Milestone funded',
        `${mp.label} is funded and held safely`,
        this.proLink,
        mp._id.toString(),
        { label: mp.label },
      );
    }

    // Reflect the escrow's lifecycle once money is in play (released by admin
    // payout, refunded, or a dispute resolved). Booking does the same self-heal.
    if (
      mp.status === MilestonePaymentStatus.FUNDED ||
      mp.status === MilestonePaymentStatus.SUBMITTED ||
      mp.status === MilestonePaymentStatus.CONFIRMED ||
      mp.status === MilestonePaymentStatus.IN_DISPUTE
    ) {
      const escrow = await this.payments.findEscrowForEntity(
        'project_milestone',
        mpId,
      );
      if (escrow) {
        if (!mp.escrowId) {
          mp.escrowId = escrow._id as Types.ObjectId;
          mutated = true;
        }
        const total = escrow.amountHeldMinor;
        const refunded = escrow.refundedAmountMinor ?? 0;
        let next: MilestonePaymentStatus | null = null;
        if (escrow.status === 'released') {
          next = MilestonePaymentStatus.RELEASED;
        } else if (escrow.status === 'refunded' || refunded >= total) {
          next = MilestonePaymentStatus.REFUNDED;
        } else if (escrow.status === 'in_dispute') {
          next = MilestonePaymentStatus.IN_DISPUTE;
        } else if (
          escrow.status === 'pending_release' &&
          mp.status === MilestonePaymentStatus.IN_DISPUTE
        ) {
          // Dispute resolved in the pro's favour (or split) -> money owed.
          next = MilestonePaymentStatus.CONFIRMED;
          mp.clientConfirmedAt = mp.clientConfirmedAt ?? new Date();
        }
        if (next && next !== mp.status) {
          mp.status = next;
          mutated = true;
        }
      }
    }

    if (mutated) await mp.save();
    return mp;
  }

  /** Return-from-payment reconcile: poll the provider, then sync. */
  async reconcile(userId: string, id: string): Promise<MilestonePayment> {
    const mp = await this.loadById(id);
    this.assertParty(mp, userId);
    if (mp.paymentId) {
      try {
        await this.payments.reconcileFromReturnUrl(mp.paymentId.toString());
      } catch (err) {
        this.logger.warn(
          `reconcile failed for mp ${id}: ${(err as Error).message}`,
        );
      }
    }
    return this.syncStatus(mp);
  }

  // ---- work done -> release ---------------------------------------------

  /** Pro marks the funded milestone's work done; starts the auto-confirm timer. */
  async markDone(proUserId: string, id: string): Promise<MilestonePayment> {
    const mp = await this.loadById(id);
    this.assertPro(mp, proUserId);
    if (mp.status !== MilestonePaymentStatus.FUNDED) {
      throw new BadRequestException(
        'Only a funded installment can be marked done',
      );
    }
    mp.status = MilestonePaymentStatus.SUBMITTED;
    mp.proMarkedDoneAt = new Date();
    const saved = await mp.save();
    this.notify(
      mp.clientId,
      NotificationType.MILESTONE_SUBMITTED,
      'Work marked done',
      `Confirm "${mp.label}" to release the payment`,
      this.clientLink(mp.projectId),
      mp._id.toString(),
      { label: mp.label },
    );
    return saved;
  }

  /** Client confirms the work; escrow flips to pending_release for payout. */
  async clientConfirm(clientId: string, id: string): Promise<MilestonePayment> {
    const mp = await this.loadById(id);
    this.assertClient(mp, clientId);
    return this.doConfirm(mp);
  }

  private async doConfirm(mp: MilestonePayment): Promise<MilestonePayment> {
    if (mp.status !== MilestonePaymentStatus.SUBMITTED) {
      throw new BadRequestException(
        'Only a submitted installment can be confirmed',
      );
    }
    if (!mp.escrowId) {
      throw new BadRequestException('No escrow to release');
    }
    await this.payments.markEscrowPendingRelease(mp.escrowId.toString());
    mp.status = MilestonePaymentStatus.CONFIRMED;
    mp.clientConfirmedAt = new Date();
    const saved = await mp.save();
    this.notify(
      mp.proId,
      NotificationType.MILESTONE_RELEASED,
      'Payment on its way',
      `${mp.label} was confirmed - ${this.gel(mp.amountMinor)} will be paid out`,
      this.proLink,
      mp._id.toString(),
      { label: mp.label, amount: this.gel(mp.amountMinor) },
    );
    return saved;
  }

  /** Cron: auto-confirm submitted installments past the review window. */
  async autoConfirmDue(): Promise<number> {
    const cutoff = new Date(Date.now() - AUTO_CONFIRM_DAYS * 24 * 60 * 60 * 1000);
    const due = await this.mpModel
      .find({
        status: MilestonePaymentStatus.SUBMITTED,
        proMarkedDoneAt: { $lte: cutoff },
      })
      .exec();
    let done = 0;
    for (const mp of due) {
      try {
        await this.doConfirm(mp);
        done += 1;
      } catch (err) {
        this.logger.warn(
          `auto-confirm failed for mp ${mp._id}: ${(err as Error).message}`,
        );
      }
    }
    if (done) this.logger.log(`Auto-confirmed ${done} milestone payment(s)`);
    return done;
  }

  // ---- disputes ----------------------------------------------------------

  /** Either party disputes a funded/submitted installment; freezes the escrow. */
  async raiseDispute(
    userId: string,
    id: string,
    dto: RaiseMilestoneDisputeDto,
  ): Promise<MilestonePayment> {
    const mp = await this.loadById(id);
    this.assertParty(mp, userId);
    const description = (dto.description || '').trim();
    if (!description) {
      throw new BadRequestException('Dispute description is required');
    }
    const disputable: MilestonePaymentStatus[] = [
      MilestonePaymentStatus.FUNDED,
      MilestonePaymentStatus.SUBMITTED,
      MilestonePaymentStatus.CONFIRMED,
    ];
    if (!disputable.includes(mp.status)) {
      throw new BadRequestException(
        `Cannot dispute an installment in status ${mp.status}`,
      );
    }
    if (!mp.escrowId) {
      throw new BadRequestException('No escrow to dispute');
    }

    const raisedAgainst =
      userId === mp.clientId.toString()
        ? mp.proId.toString()
        : mp.clientId.toString();

    const dispute = await this.disputeModel.create({
      entityType: 'project_milestone',
      entityId: id,
      escrowId: mp.escrowId,
      raisedByUserId: new Types.ObjectId(userId),
      raisedAgainstUserId: new Types.ObjectId(raisedAgainst),
      type: dto.type,
      description,
      evidenceUrls: dto.evidenceUrls ?? [],
      status: 'open',
    });

    await this.payments.markEscrowInDispute(
      mp.escrowId.toString(),
      dispute._id.toString(),
    );

    mp.status = MilestonePaymentStatus.IN_DISPUTE;
    mp.disputeId = dispute._id as Types.ObjectId;
    const saved = await mp.save();
    const raisedAgainstIsClient = raisedAgainst === mp.clientId.toString();
    this.notify(
      raisedAgainst,
      NotificationType.MILESTONE_DISPUTED,
      'Issue reported',
      `An issue was reported on "${mp.label}"`,
      raisedAgainstIsClient ? this.clientLink(mp.projectId) : this.proLink,
      mp._id.toString(),
      { label: mp.label },
    );
    return saved;
  }

  // ---- reads -------------------------------------------------------------

  /**
   * The schedule for a project. The client (owner) sees every engagement's
   * installments; an assigned pro sees only their own. Refreshes the escrow
   * projection for money-bearing rows so RELEASED/REFUNDED show up promptly.
   */
  async listForProject(
    projectId: string,
    userId: string,
  ): Promise<MilestonePayment[]> {
    if (!Types.ObjectId.isValid(projectId)) return [];
    const project = await this.projectModel
      .findById(projectId)
      .select('clientId')
      .lean()
      .exec();
    if (!project) throw new NotFoundException('Project not found');

    const isClient = project.clientId.toString() === userId;
    const filter: Record<string, unknown> = {
      projectId: new Types.ObjectId(projectId),
    };
    if (!isClient) filter.proId = new Types.ObjectId(userId);

    const rows = await this.mpModel
      .find(filter)
      .sort({ engagementId: 1, sortOrder: 1 })
      .exec();

    await this.refreshAll(rows);
    return rows;
  }

  /**
   * The pro's payable engagements across all projects (hired/in-progress/done),
   * so /my-space can render a schedule panel per engagement. Returns light
   * context only - the panel fetches the installments itself.
   */
  async listMyEngagements(proUserId: string): Promise<
    {
      projectId: string;
      projectTitle: string;
      engagementId: string;
      roleLabel: string;
      status: string;
    }[]
  > {
    const projects = await this.projectModel
      .find({
        'engagements.assignedProId': new Types.ObjectId(proUserId),
        deletedAt: null,
      })
      .select('title engagements')
      .lean()
      .exec();
    const payable = ['hired', 'in_progress', 'completed'];
    const out: {
      projectId: string;
      projectTitle: string;
      engagementId: string;
      roleLabel: string;
      status: string;
    }[] = [];
    for (const p of projects as any[]) {
      for (const e of p.engagements ?? []) {
        if (
          e.assignedProId?.toString() === proUserId &&
          payable.includes(e.status)
        ) {
          out.push({
            projectId: String(p._id),
            projectTitle: p.title,
            engagementId: e.id,
            roleLabel: e.roleLabel,
            status: e.status,
          });
        }
      }
    }
    return out;
  }

  /** A pro's installments across all their projects (for /my-space). */
  async listMine(proUserId: string): Promise<MilestonePayment[]> {
    const rows = await this.mpModel
      .find({ proId: new Types.ObjectId(proUserId) })
      .sort({ updatedAt: -1 })
      .exec();
    await this.refreshAll(rows);
    return rows;
  }

  private async refreshAll(rows: MilestonePayment[]): Promise<void> {
    const moneyStates: MilestonePaymentStatus[] = [
      MilestonePaymentStatus.FUNDED,
      MilestonePaymentStatus.SUBMITTED,
      MilestonePaymentStatus.CONFIRMED,
      MilestonePaymentStatus.IN_DISPUTE,
    ];
    await Promise.all(
      rows
        .filter((r) => moneyStates.includes(r.status))
        .map((r) => this.syncStatus(r).catch(() => undefined)),
    );
  }
}
