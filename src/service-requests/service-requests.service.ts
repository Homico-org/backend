import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { CreateServiceRequestDto } from "./dto/create-service-request.dto";
import {
  ServiceRequest,
  type ServiceRequestStatus,
} from "./schemas/service-request.schema";

function normalizePhone(raw: string): string {
  const cleaned = raw.replace(/\s+/g, "");
  if (/^\d{9}$/.test(cleaned)) return `+995${cleaned}`;
  if (cleaned.startsWith("+")) return cleaned;
  if (/^\d+$/.test(cleaned)) return `+${cleaned}`;
  return cleaned;
}

@Injectable()
export class ServiceRequestsService {
  private readonly logger = new Logger(ServiceRequestsService.name);

  constructor(
    @InjectModel(ServiceRequest.name)
    private model: Model<ServiceRequest>,
  ) {}

  async create(
    dto: CreateServiceRequestDto,
    meta: { userAgent?: string },
  ): Promise<ServiceRequest> {
    const phone = normalizePhone(dto.phone);
    const doc = await this.model.create({
      category: dto.category,
      subcategory: dto.subcategory,
      description: dto.description,
      cityKey: dto.cityKey || "tbilisi",
      address: dto.address,
      timing: dto.timing ?? "flexible",
      name: dto.name,
      phone,
      email: dto.email,
      locale: dto.locale,
      userAgent: meta.userAgent,
      status: "new",
    });

    // Fire-and-forget notification. Wire Telegram here when creds are ready.
    this.notifyNewRequest(doc).catch((err) =>
      this.logger.error("notifyNewRequest failed", err),
    );

    this.logger.log(
      `ServiceRequest created: ${doc._id} · ${doc.category}/${doc.subcategory ?? "-"} · ${doc.phone}`,
    );
    return doc;
  }

  // Stub — replaced with real Telegram/Slack/email integration later.
  // Keeping it as an explicit method so the wiring path is obvious.
  private async notifyNewRequest(req: ServiceRequest): Promise<void> {
    this.logger.log(
      `[notifyNewRequest] ${req._id} from ${req.name} (${req.phone}) — ${req.category}`,
    );
    // TODO: POST to Telegram Bot API sendMessage once TELEGRAM_BOT_TOKEN +
    // TELEGRAM_ADMIN_CHAT_ID are configured. Save returned message_id to
    // req.telegramMessageId for later status edits.
  }

  async findAll(opts: {
    status?: string;
    limit?: number;
    page?: number;
  }): Promise<{
    items: ServiceRequest[];
    total: number;
    counts: Record<ServiceRequestStatus, number>;
  }> {
    const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
    const page = Math.max(opts.page ?? 1, 1);
    const skip = (page - 1) * limit;

    const filter = opts.status ? { status: opts.status } : {};
    const [items, total, byStatus] = await Promise.all([
      this.model.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).exec(),
      this.model.countDocuments(filter),
      this.model.aggregate<{ _id: ServiceRequestStatus; n: number }>([
        { $group: { _id: "$status", n: { $sum: 1 } } },
      ]),
    ]);

    const counts: Record<ServiceRequestStatus, number> = {
      new: 0,
      contacted: 0,
      quoted: 0,
      booked: 0,
      dropped: 0,
    };
    for (const row of byStatus) {
      if (row._id in counts) counts[row._id] = row.n;
    }

    return { items, total, counts };
  }

  async updateStatus(
    id: string,
    status: ServiceRequestStatus,
    notes?: string,
  ): Promise<ServiceRequest> {
    const update: Record<string, unknown> = { status };
    if (notes !== undefined) update.notes = notes;
    const doc = await this.model
      .findByIdAndUpdate(id, update, { new: true })
      .exec();
    if (!doc) throw new NotFoundException("Service request not found");
    return doc;
  }
}
