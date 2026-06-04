import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import { UserRole } from "../users/schemas/user.schema";
import { UsersService } from "../users/users.service";
import { CreateCatalogSuggestionDto } from "./dto/create-catalog-suggestion.dto";
import {
  CatalogSuggestion,
  CatalogSuggestionDoc,
  CatalogSuggestionStatus,
} from "./schemas/catalog-suggestion.schema";

interface ListOpts {
  status?: CatalogSuggestionStatus;
  page?: number;
  limit?: number;
}

@Injectable()
export class CatalogSuggestionsService {
  private readonly logger = new Logger(CatalogSuggestionsService.name);

  constructor(
    @InjectModel(CatalogSuggestion.name)
    private readonly suggestionModel: Model<CatalogSuggestion>,
    private readonly usersService: UsersService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Whitelist of origins we accept for a photoUrl on incoming suggestions.
   * Without this, a pro could submit any URL - someone else's CDN, a
   * tracking pixel, even a malicious site - and admin would see it in
   * the queue without warning.
   *
   * Sources allowed:
   *   - Cloudinary's standard res.cloudinary.com domain
   *   - Optional CLOUDINARY_CNAME (if set, custom CNAME for branded URLs)
   *   - Our own backend (for local-stored uploads in dev)
   */
  private buildPhotoUrlAllowList(): string[] {
    const list = ['https://res.cloudinary.com/'];
    const cname = this.configService.get<string>('CLOUDINARY_CNAME');
    if (cname) {
      list.push(cname.startsWith('http') ? cname : `https://${cname}/`);
    }
    const backend = this.configService.get<string>('PUBLIC_BACKEND_URL');
    if (backend) list.push(backend.replace(/\/$/, '') + '/');
    return list;
  }

  private validatePhotoUrl(url: string): void {
    const allow = this.buildPhotoUrlAllowList();
    if (!allow.some((prefix) => url.startsWith(prefix))) {
      throw new BadRequestException(
        'photoUrl must point at our upload domain. Use the /upload endpoint to host the image first.',
      );
    }
  }

  /**
   * Create a new catalog suggestion. Identity is auto-attached from the
   * authenticated pro - the caller passes only the user's id from JWT, never
   * lets the client send name/phone (they would be untrustworthy).
   */
  async create(
    userId: string,
    dto: CreateCatalogSuggestionDto,
  ): Promise<CatalogSuggestion> {
    // findById returns the User document; we read identity fields off it.
    // The schema typings already include _id (HydratedDocument), uid, name,
    // phone, email and role - no inline assertions needed.
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new UnauthorizedException("User not found");
    }
    if (user.role !== UserRole.PRO) {
      throw new UnauthorizedException(
        "Only professionals can suggest catalog additions",
      );
    }
    if (!user.phone) {
      throw new UnauthorizedException(
        "Phone number required on profile to submit suggestions",
      );
    }

    // Reject arbitrary photo URLs - frontend uploads via /upload first,
    // gets back a Cloudinary URL, then passes that here. This prevents
    // pros from injecting third-party / malicious URLs into the admin
    // queue.
    if (dto.photoUrl) {
      this.validatePhotoUrl(dto.photoUrl);
    }

    const doc = new this.suggestionModel({
      serviceName: dto.serviceName.trim(),
      description: dto.description.trim(),
      suggestedCategoryKey: dto.suggestedCategoryKey?.trim() || undefined,
      suggestedPrice: dto.suggestedPrice,
      suggestedUnit: dto.suggestedUnit,
      photoUrl: dto.photoUrl,
      locale: dto.locale,
      requestedByUserId: user._id,
      requestedByUid: user.uid,
      requestedByName: user.name || "Professional",
      requestedByPhone: user.phone,
      requestedByEmail: user.email,
      status: "pending",
    });

    const saved = await doc.save();
    this.logger.log(
      `New catalog suggestion #${saved._id} from uid=${user.uid} (${user.phone}): "${dto.serviceName}"`,
    );
    return saved;
  }

  async findAll(opts: ListOpts = {}): Promise<{
    data: CatalogSuggestionDoc[];
    total: number;
    pendingCount: number;
    page: number;
    limit: number;
  }> {
    const page = Math.max(1, opts.page ?? 1);
    const limit = Math.min(100, Math.max(1, opts.limit ?? 50));
    const skip = (page - 1) * limit;

    const filter: { status?: CatalogSuggestionStatus } = {};
    if (opts.status) filter.status = opts.status;

    const [data, total, pendingCount] = await Promise.all([
      this.suggestionModel
        .find(filter)
        .sort({ status: 1, createdAt: -1 }) // pending first, then newest
        .skip(skip)
        .limit(limit)
        .lean<CatalogSuggestionDoc[]>()
        .exec(),
      this.suggestionModel.countDocuments(filter).exec(),
      this.suggestionModel.countDocuments({ status: "pending" }).exec(),
    ]);

    return { data, total, pendingCount, page, limit };
  }

  /**
   * Lightweight count for admin badges (e.g. nav pill showing pending review
   * volume). Cheap query, hit it often.
   */
  async getPendingCount(): Promise<number> {
    return this.suggestionModel.countDocuments({ status: "pending" }).exec();
  }

  async updateStatus(
    suggestionId: string,
    reviewerUserId: string,
    status: CatalogSuggestionStatus,
    reviewerNote?: string,
  ): Promise<CatalogSuggestion> {
    if (!Types.ObjectId.isValid(suggestionId)) {
      throw new NotFoundException("Suggestion not found");
    }
    const updated = await this.suggestionModel
      .findByIdAndUpdate(
        suggestionId,
        {
          status,
          reviewerNote: reviewerNote?.trim() || undefined,
          reviewedByUserId: new Types.ObjectId(reviewerUserId),
          reviewedAt: new Date(),
        },
        { new: true },
      )
      .exec();
    if (!updated) throw new NotFoundException("Suggestion not found");
    this.logger.log(
      `Suggestion #${suggestionId} marked ${status} by reviewer ${reviewerUserId}`,
    );
    return updated;
  }
}
