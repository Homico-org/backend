import {
  BadRequestException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { randomBytes } from 'crypto';
import { Model, Types } from 'mongoose';
import { AuthService } from '../auth/auth.service';
import { JobsService } from '../jobs/jobs.service';
import { UsersService } from '../users/users.service';
import { UserRole } from '../users/schemas/user.schema';
import { SmsService } from '../verification/services/sms.service';
import { EmailService } from '../verification/services/email.service';
import {
  AssistedJob,
  AssistedJobStatus,
} from './schemas/assisted-job.schema';
import { CreateAssistedJobDto } from './dto/create-assisted-job.dto';
import { ApproveAssistedJobDto } from './dto/approve-assisted-job.dto';

const LINK_TTL_DAYS = 7;

type RequestMeta = {
  ip?: string;
  userAgent?: string;
  // Set when the viewer is authenticated (OptionalJwtAuthGuard on approve).
  authUserId?: string;
};

function toNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

@Injectable()
export class AssistedJobService {
  constructor(
    @InjectModel(AssistedJob.name)
    private readonly model: Model<AssistedJob>,
    private readonly jobsService: JobsService,
    private readonly usersService: UsersService,
    private readonly authService: AuthService,
    private readonly smsService: SmsService,
    private readonly emailService: EmailService,
  ) {}

  private clientUrl(token: string): string {
    const base = process.env.FRONTEND_URL || 'http://localhost:3000';
    return `${base}/assisted-job/${token}`;
  }

  // ── Admin: create a draft + share link ──
  async create(adminId: string, dto: CreateAssistedJobDto) {
    const token = randomBytes(16).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + LINK_TTL_DAYS);

    const doc = await this.model.create({
      token,
      status: AssistedJobStatus.PENDING,
      createdByAdmin: new Types.ObjectId(adminId),
      clientName: dto.client.name,
      clientPhone: dto.client.phone,
      clientEmail: dto.client.email,
      category: dto.category,
      subcategory: dto.subcategory,
      services: dto.services ?? [],
      propertyType: dto.propertyType,
      description: dto.description,
      areaSize: dto.areaSize,
      timing: dto.timing,
      budgetType: dto.budgetType,
      budgetMin: dto.budgetMin,
      budgetMax: dto.budgetMax,
      location: dto.location,
      coordinates: dto.coordinates,
      images: dto.images ?? [],
      videos: dto.videos ?? [],
      invitedPros: dto.invitedPros ?? [],
      expiresAt,
    });

    return {
      id: doc._id.toString(),
      token,
      // Bare (country-agnostic) path — the client link isn't market-specific.
      clientPath: `/assisted-job/${token}`,
      expiresAt,
    };
  }

  // ── Admin: list recent drafts (dashboard) ──
  async list() {
    const rows = await this.model
      .find()
      .sort({ createdAt: -1 })
      .limit(100)
      .lean()
      .exec();
    return rows.map((r) => ({
      id: r._id.toString(),
      status: r.status,
      clientName: r.clientName,
      clientPhone: r.clientPhone,
      clientEmail: r.clientEmail,
      category: r.category,
      // Let the admin re-copy the client link from the list.
      clientPath: `/assisted-job/${r.token}`,
      createdAt: (r as { createdAt?: Date }).createdAt,
      expiresAt: r.expiresAt,
      approvedAt: r.approvedAt,
      createdJobId: r.createdJobId?.toString(),
    }));
  }

  // ── Admin: cancel a pending draft (kills the link) ──
  async cancel(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Request not found.');
    }
    const draft = await this.model.findById(id).exec();
    if (!draft) throw new NotFoundException('Request not found.');
    if (draft.status === AssistedJobStatus.APPROVED) {
      throw new BadRequestException('This request was already approved.');
    }
    if (draft.status !== AssistedJobStatus.CANCELLED) {
      draft.status = AssistedJobStatus.CANCELLED;
      await draft.save();
    }
    return { id: draft._id.toString(), status: draft.status };
  }

  // ── Admin: send the link to the client (SMS or email) ──
  async sendLink(id: string, channel: 'sms' | 'email') {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Request not found.');
    }
    const draft = await this.model.findById(id).exec();
    if (!draft) throw new NotFoundException('Request not found.');
    if (draft.status !== AssistedJobStatus.PENDING) {
      throw new BadRequestException('This link is no longer active.');
    }

    const url = this.clientUrl(draft.token);

    if (channel === 'sms') {
      const res = await this.smsService.sendNotificationSms(
        draft.clientPhone,
        `Homico: your service request is ready. Review & confirm: ${url}`,
      );
      if (!res.success) {
        throw new BadRequestException(res.error || 'Could not send the SMS.');
      }
      return { success: true, channel };
    }

    // email
    if (!draft.clientEmail) {
      throw new BadRequestException('No email address on file for this client.');
    }
    const ok = await this.emailService.sendAssistedJobLink(
      draft.clientEmail,
      draft.clientName,
      url,
    );
    if (!ok) throw new BadRequestException('Could not send the email.');
    return { success: true, channel };
  }

  // ── Public: fetch a draft by token (client preview) ──
  // authUserId is set when the viewer is signed in (OptionalJwtAuthGuard).
  async getByToken(token: string, authUserId?: string) {
    const draft = await this.loadOpenDraft(token);
    const existing = await this.usersService.findByEmailOrPhone(
      draft.clientPhone,
    );
    return {
      clientName: draft.clientName,
      clientPhone: draft.clientPhone,
      clientEmail: draft.clientEmail,
      category: draft.category,
      subcategory: draft.subcategory,
      services: draft.services,
      propertyType: draft.propertyType,
      description: draft.description,
      areaSize: draft.areaSize,
      timing: draft.timing,
      budgetType: draft.budgetType,
      budgetMin: draft.budgetMin,
      budgetMax: draft.budgetMax,
      location: draft.location,
      coordinates: draft.coordinates,
      images: draft.images,
      videos: draft.videos,
      expiresAt: draft.expiresAt,
      // The client-facing page adapts its auth step:
      //  - viewer already signed in AS this client -> nothing to enter
      //  - no account           -> "create a password"
      //  - account w/ password   -> "enter your password"
      //  - account w/o password  -> nothing to enter (phone-OTP / Google signup);
      //    the link authorizes and optionally lets them set a password.
      existingUser: !!existing,
      hasPassword: !!(existing && (existing as { password?: string }).password),
      // Computed by id (robust), matching approve()'s own skip-password check.
      viewerIsClient:
        !!existing &&
        !!authUserId &&
        String((existing as { _id: unknown })._id) === authUserId,
    };
  }

  // ── Public: client approves → real Job is created, owned by the client ──
  async approve(token: string, dto: ApproveAssistedJobDto, meta: RequestMeta) {
    if (!dto.consent) {
      throw new BadRequestException('Consent is required to create the job.');
    }

    // Claim the draft atomically so two concurrent submits can't each create a
    // job/account: only the request that flips PENDING -> APPROVED proceeds.
    const now = new Date();
    const draft = await this.model.findOneAndUpdate(
      { token, status: AssistedJobStatus.PENDING, expiresAt: { $gt: now } },
      { $set: { status: AssistedJobStatus.APPROVED, approvedAt: now } },
      { new: true },
    );
    if (!draft) {
      // Surface the precise reason (not found / used / cancelled / expired).
      await this.loadOpenDraft(token);
      throw new GoneException('This link has already been used.');
    }

    try {
      const existing = await this.usersService.findByEmailOrPhone(
        draft.clientPhone,
      );

      let session: { access_token: string; refresh_token: string; user: { id: unknown } };
      const viewerIsClient =
        !!existing &&
        !!meta.authUserId &&
        String((existing as { _id: unknown })._id) === meta.authUserId;

      if (viewerIsClient) {
        // Already signed in as this exact client → no password needed.
        session = this.authService.issueSessionForUser(existing);
      } else if (!existing) {
        // Brand-new client → create the account with the chosen password.
        if (!dto.password) {
          throw new BadRequestException('A password is required.');
        }
        session = await this.authService.register(
          {
            name: draft.clientName,
            phone: draft.clientPhone,
            email: draft.clientEmail,
            password: dto.password,
            role: UserRole.CLIENT,
          } as never,
          meta,
        );
      } else if ((existing as { password?: string }).password) {
        // Existing account WITH a password → verify it (normal login).
        if (!dto.password) {
          throw new BadRequestException('A password is required.');
        }
        try {
          session = await this.authService.login(
            { identifier: draft.clientPhone, password: dto.password },
            meta,
          );
        } catch {
          // login throws 401; on this PUBLIC endpoint a 401 would trip the web
          // client's global "session expired" handler and log the viewer out.
          // Surface a wrong-password as a plain 400 instead.
          throw new BadRequestException(
            'Incorrect password. Please try again.',
          );
        }
      } else {
        // Existing account with NO password (phone-OTP / Google signup): the
        // single-use link is the proof of identity, so sign them in. We do NOT
        // set a password here — a link holder must not be able to plant a
        // persistent credential on the account; the client can add one later
        // from their account settings.
        session = this.authService.issueSessionForUser(existing);
      }

      const clientId = String(session.user.id);
      const jobData = this.buildJobData(draft, dto);
      const job = await this.jobsService.createJob(clientId, jobData as never);

      // Invite the admin-chosen pros AFTER creation so invitePros sees them as
      // new (the job was created with an empty invitedPros list) and actually
      // sends the invitation notification + SMS. Best-effort: a failure here
      // must not undo the approval / job creation.
      if (draft.invitedPros?.length) {
        try {
          await this.jobsService.invitePros(
            job._id.toString(),
            clientId,
            draft.invitedPros,
          );
        } catch {
          // swallow — job is created; the pros just miss the direct invite.
        }
      }

      draft.createdJobId = job._id as Types.ObjectId;
      draft.clientUserId = new Types.ObjectId(clientId);
      await draft.save();

      return {
        ...session,
        jobId: job._id.toString(),
        redirectPath: `/ge/jobs/${job._id.toString()}`,
      };
    } catch (err) {
      // Release the claim so the client can retry (e.g. wrong password).
      draft.status = AssistedJobStatus.PENDING;
      draft.approvedAt = undefined;
      await draft.save();
      throw err;
    }
  }

  // ── Helpers ──

  private async loadOpenDraft(token: string): Promise<AssistedJob> {
    const draft = await this.model.findOne({ token }).exec();
    if (!draft) throw new NotFoundException('Link not found.');
    if (draft.status === AssistedJobStatus.APPROVED) {
      throw new GoneException('This link has already been used.');
    }
    if (draft.status === AssistedJobStatus.CANCELLED) {
      throw new GoneException('This link was cancelled.');
    }
    if (draft.expiresAt.getTime() < Date.now()) {
      if (draft.status !== AssistedJobStatus.EXPIRED) {
        draft.status = AssistedJobStatus.EXPIRED;
        await draft.save();
      }
      throw new GoneException('This link has expired.');
    }
    return draft;
  }

  private buildJobData(draft: AssistedJob, dto: ApproveAssistedJobDto) {
    const location = (dto.location ?? draft.location ?? '').trim();
    const coords = dto.coordinates ?? draft.coordinates;
    const services = (draft.services ?? []).map((raw) => {
      const s = raw as Record<string, unknown>;
      return {
        key: (s.serviceKey as string) ?? (s.key as string),
        unitKey: s.unitKey as string | undefined,
        quantity: toNumber(s.quantity) ?? 1,
        unitPrice: toNumber(s.budget) ?? toNumber(s.unitPrice) ?? 0,
        unit: s.unit as string | undefined,
        budgetMin: toNumber(s.budgetMin),
        budgetMax: toNumber(s.budgetMax),
        notes: s.notes as string | undefined,
      };
    });

    const first = (draft.services?.[0] as Record<string, unknown>) || {};
    const title =
      (first.name as string) || draft.subcategory || draft.category;

    const jobData: Record<string, unknown> = {
      title,
      category: draft.category,
      subcategory: draft.subcategory,
      description: (dto.description ?? draft.description ?? '').trim(),
      location,
      address: {
        formattedAddress: location,
        ...(coords ? { lat: coords.lat, lng: coords.lng } : {}),
      },
      areaSize: toNumber(dto.areaSize ?? draft.areaSize),
      budgetType: draft.budgetType || 'negotiable',
      budgetMin: toNumber(dto.budgetMin ?? draft.budgetMin),
      budgetMax: toNumber(dto.budgetMax ?? draft.budgetMax),
      images: dto.images ?? draft.images ?? [],
      media: (draft.videos ?? []).map((url) => ({ type: 'video', url })),
      services,
      // Mirror the normal post-job flow so pro browse/matching (which filters on
      // skills OR category) reaches this job under every selected trade, not just
      // the primary category.
      skills: services.map((s) => s.key).filter(Boolean),
      jobType: 'marketplace',
    };
    // Only attach propertyType when present (it's an enum-validated field).
    if (draft.propertyType) jobData.propertyType = draft.propertyType;
    // NB: invitedPros are intentionally NOT set here. If passed, createJob would
    // pre-write them onto the job and then call invitePros, which dedupes against
    // that same list and sends NO notification. We invite them via a separate
    // invitePros call AFTER creation instead (see approve()), so they get notified.

    return jobData;
  }
}
