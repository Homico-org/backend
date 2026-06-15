import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import * as bcrypt from "bcrypt";
import { Model, PipelineStage } from "mongoose";
import { v4 as uuidv4 } from "uuid";
import { ActivityType, LoggerService } from "../common/logger";
import { ServiceCatalogService } from "../service-catalog/service-catalog.service";
import { Conversation } from "../conversation/schemas/conversation.schema";
import { Job } from "../jobs/schemas/job.schema";
import { Proposal } from "../jobs/schemas/proposal.schema";
import { SavedJob } from "../jobs/schemas/saved-job.schema";
import { Like } from "../likes/schemas/like.schema";
import { Message } from "../message/schemas/message.schema";
import { Notification } from "../notifications/schemas/notification.schema";
import { Offer } from "../offer/schemas/offer.schema";
import { PortfolioItem } from "../portfolio/schemas/portfolio-item.schema";
import { ProjectRequest } from "../project-request/schemas/project-request.schema";
import { Review } from "../review/schemas/review.schema";
import { SupportTicket } from "../support/schemas/support-ticket.schema";
import { CreateUserDto } from "./dto/create-user.dto";
import { PaymentMethod, ServiceAddress, User } from "./schemas/user.schema";
import {
  ProfileView,
  ProfileViewType,
} from "./schemas/profile-view.schema";

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(Job.name) private jobModel: Model<Job>,
    @InjectModel(Proposal.name) private proposalModel: Model<Proposal>,
    @InjectModel(SavedJob.name) private savedJobModel: Model<SavedJob>,
    @InjectModel(Conversation.name)
    private conversationModel: Model<Conversation>,
    @InjectModel(Message.name) private messageModel: Model<Message>,
    @InjectModel(Notification.name)
    private notificationModel: Model<Notification>,
    @InjectModel(Review.name) private reviewModel: Model<Review>,
    @InjectModel(Like.name) private likeModel: Model<Like>,
    @InjectModel(PortfolioItem.name)
    private portfolioItemModel: Model<PortfolioItem>,
    @InjectModel(ProjectRequest.name)
    private projectRequestModel: Model<ProjectRequest>,
    @InjectModel(Offer.name) private offerModel: Model<Offer>,
    @InjectModel(SupportTicket.name)
    private supportTicketModel: Model<SupportTicket>,
    @InjectModel(ProfileView.name)
    private profileViewModel: Model<ProfileView>,
    private readonly logger: LoggerService,
    // Used by findAllPros to expand the user's search term against the
    // service-catalog labels in all three locales, so "ავეჯი" matches pros
    // offering furniture services even when their own name doesn't.
    private readonly serviceCatalogService: ServiceCatalogService,
  ) {}

  // Cached flat index of catalog rows used by `findCatalogKeyMatches`.
  // Refreshed every 5 minutes - catalog edits are rare (admin-only) and
  // 5 min staleness is acceptable for the search expansion. Keeping the
  // catalog hot in memory avoids one Mongo round-trip per search request.
  private catalogSearchIndex: Array<{
    key: string;
    en: string;
    ka: string;
    ru: string;
  }> | null = null;
  private catalogSearchIndexBuiltAt = 0;
  private static readonly CATALOG_SEARCH_TTL_MS = 5 * 60 * 1000;

  /**
   * Build (or reuse) a flat list of every searchable catalog key (categories,
   * subcategories, and services) with their en/ka/ru labels. Cached for
   * `CATALOG_SEARCH_TTL_MS` so repeated searches don't re-query Mongo.
   */
  private async getCatalogSearchIndex(): Promise<
    Array<{ key: string; en: string; ka: string; ru: string }>
  > {
    const now = Date.now();
    if (
      this.catalogSearchIndex &&
      now - this.catalogSearchIndexBuiltAt < UsersService.CATALOG_SEARCH_TTL_MS
    ) {
      return this.catalogSearchIndex;
    }
    const catalogs = await this.serviceCatalogService.findAllAsCategories();
    const out: Array<{ key: string; en: string; ka: string; ru: string }> = [];
    for (const cat of catalogs) {
      out.push({
        key: cat.key,
        en: (cat.name ?? "").toLowerCase(),
        ka: (cat.nameKa ?? "").toLowerCase(),
        ru: (cat.nameRu ?? "").toLowerCase(),
      });
      for (const sub of cat.subcategories ?? []) {
        out.push({
          key: sub.key,
          en: (sub.name ?? "").toLowerCase(),
          ka: (sub.nameKa ?? "").toLowerCase(),
          ru: (sub.nameRu ?? "").toLowerCase(),
        });
        for (const svc of sub.services ?? []) {
          out.push({
            key: svc.key,
            en: (svc.name ?? "").toLowerCase(),
            ka: (svc.nameKa ?? "").toLowerCase(),
            ru: (svc.nameRu ?? "").toLowerCase(),
          });
        }
      }
    }
    this.catalogSearchIndex = out;
    this.catalogSearchIndexBuiltAt = now;
    return out;
  }

  /**
   * Return the set of catalog keys (category/subcategory/service) whose
   * label in any locale contains the search term. Empty set when nothing
   * matches.
   */
  private async findCatalogKeyMatches(
    searchTerm: string,
  ): Promise<Set<string>> {
    const term = searchTerm.trim().toLowerCase();
    if (term.length < 2) return new Set();
    const index = await this.getCatalogSearchIndex();
    const matched = new Set<string>();
    for (const row of index) {
      if (
        row.en.includes(term) ||
        row.ka.includes(term) ||
        row.ru.includes(term)
      ) {
        matched.add(row.key);
      }
    }
    return matched;
  }

  async create(createUserDto: CreateUserDto): Promise<User> {
    // Only check email uniqueness if email is provided
    if (createUserDto.email) {
      const existingUserByEmail = await this.userModel.findOne({
        email: createUserDto.email,
      });
      if (existingUserByEmail) {
        throw new ConflictException("User with this email already exists");
      }
    }

    // Check phone uniqueness (phone is now required)
    if (createUserDto.phone) {
      const existingUserByPhone = await this.userModel.findOne({
        phone: createUserDto.phone,
      });
      if (existingUserByPhone) {
        throw new ConflictException(
          "User with this phone number already exists",
        );
      }
    }

    // Generate unique UID (auto-incrementing number starting from 100001)
    const uid = await this.generateNextUid();

    const hashedPassword = await bcrypt.hash(createUserDto.password, 10);

    const user = new this.userModel({
      ...createUserDto,
      uid,
      password: hashedPassword,
    });

    const savedUser = await user.save();

    // Create portfolio items in the portfolio collection if provided
    if (
      createUserDto.portfolioProjects &&
      createUserDto.portfolioProjects.length > 0
    ) {
      const portfolioItems = createUserDto.portfolioProjects.map(
        (project, index) => ({
          proId: savedUser._id,
          title: project.title || `Project ${index + 1}`,
          description: project.description || "",
          imageUrl: project.images[0] || "",
          images: project.images || [],
          source: "external",
          status: "completed",
          projectType: "project",
          displayOrder: index,
        }),
      );

      await this.portfolioItemModel.insertMany(portfolioItems);
    }

    return savedUser;
  }

  private async generateNextUid(): Promise<number> {
    const lastUser = await this.userModel
      .findOne({ uid: { $exists: true } })
      .sort({ uid: -1 })
      .exec();
    const startingUid = 100001;
    return lastUser?.uid ? lastUser.uid + 1 : startingUid;
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.userModel.findOne({ email }).exec();
  }

  async findByPhone(phone: string): Promise<User | null> {
    return this.userModel.findOne({ phone }).exec();
  }

  async findByEmailOrPhone(identifier: string): Promise<User | null> {
    // Normalize identifier
    const normalizedIdentifier = identifier.replace(/[\s\-]/g, "");

    // First try exact match on email (case-insensitive) or phone
    const user = await this.userModel
      .findOne({
        $or: [
          { email: identifier.toLowerCase() },
          { phone: normalizedIdentifier },
        ],
      })
      .exec();

    if (user) return user;

    // If not found and looks like a phone number, try matching with/without country code
    if (/^\+?\d+$/.test(normalizedIdentifier)) {
      // Try finding by phone with flexible matching
      const allUsers = await this.userModel
        .find({
          phone: { $exists: true, $ne: null },
        })
        .select("_id phone")
        .exec();

      for (const u of allUsers) {
        if (!u.phone) continue;
        const storedNormalized = u.phone.replace(/[\s\-]/g, "");

        // Match if phones are equal, or if one ends with the other (handles country code differences)
        if (
          storedNormalized === normalizedIdentifier ||
          storedNormalized.endsWith(normalizedIdentifier) ||
          normalizedIdentifier.endsWith(storedNormalized)
        ) {
          return this.userModel.findById(u._id).exec();
        }
      }
    }

    return null;
  }

  async findById(id: string): Promise<User> {
    const user = await this.userModel.findById(id).exec();

    if (!user) {
      throw new NotFoundException("User not found");
    }

    return user;
  }

  /**
   * Update a pro's bank account. Setting fresh details clears any prior
   * verifiedAt - admin must re-verify after any change so we don't
   * silently keep "verified" status on freshly-edited details.
   */
  async updateBankAccount(
    userId: string,
    dto: { bankCode: string; accountNumber: string; holderName: string },
  ): Promise<User> {
    const user = await this.userModel.findById(userId).exec();
    if (!user) throw new NotFoundException("User not found");
    user.bankAccount = {
      bankCode: dto.bankCode.trim(),
      accountNumber: dto.accountNumber.trim().replace(/\s+/g, ""),
      holderName: dto.holderName.trim(),
      verifiedAt: undefined,
    };
    await user.save();
    return user;
  }

  /**
   * Increment dispute strikes on a pro. Currently called manually by admin
   * dispute resolution (Phase 1). Phase 3: auto-strike after confirmed
   * no-show resolutions, with a 3-strike suspension rule.
   */
  async incrementDisputeStrikes(userId: string): Promise<number> {
    const result = await this.userModel
      .findByIdAndUpdate(userId, { $inc: { disputeStrikes: 1 } }, { new: true })
      .exec();
    return result?.disputeStrikes ?? 0;
  }

  async savePushToken(userId: string, token: string, platform: string): Promise<void> {
    // Remove existing token if present (prevent duplicates), then add
    await this.userModel.updateOne(
      { _id: userId },
      {
        $pull: { pushTokens: { token } },
      },
    );
    await this.userModel.updateOne(
      { _id: userId },
      {
        $push: {
          pushTokens: { token, platform, updatedAt: new Date() },
        },
      },
    );
  }

  async findPublicProfile(id: string) {
    const user = await this.userModel.findById(id).lean().exec();

    if (!user) {
      throw new NotFoundException("User not found");
    }

    // Return only public fields
    return {
      _id: user._id,
      name: user.name,
      avatar: user.avatar,
      city: user.city,
      role: user.role,
      accountType: user.accountType,
      createdAt: (user as any).createdAt,
    };
  }

  async validatePassword(
    password: string,
    hashedPassword: string,
  ): Promise<boolean> {
    return bcrypt.compare(password, hashedPassword);
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<{ success: boolean }> {
    const user = await this.userModel
      .findById(userId)
      .select("+password")
      .exec();

    if (!user) {
      throw new NotFoundException("User not found");
    }

    // Check if user has a password (might be OAuth user)
    if (!user.password) {
      throw new BadRequestException(
        "Cannot change password for OAuth accounts",
      );
    }

    // Validate current password
    const isCurrentPasswordValid = await bcrypt.compare(
      currentPassword,
      user.password,
    );
    if (!isCurrentPasswordValid) {
      throw new ConflictException("Current password is incorrect");
    }

    // Hash new password and update
    const hashedNewPassword = await bcrypt.hash(newPassword, 10);
    await this.userModel.findByIdAndUpdate(userId, {
      password: hashedNewPassword,
    });

    return { success: true };
  }

  async updateLastLogin(userId: string): Promise<void> {
    await this.userModel.findByIdAndUpdate(userId, {
      lastLoginAt: new Date(),
    });
  }

  async update(userId: string, updateData: Partial<User>): Promise<User> {
    const user = await this.userModel
      .findByIdAndUpdate(userId, updateData, { new: true })
      .exec();

    if (!user) {
      throw new NotFoundException("User not found");
    }

    return user;
  }

  async getDemoAccounts(): Promise<
    { name: string; phone: string; email: string; role: string; avatar: string; title: string }[]
  > {
    const users = await this.userModel
      .find({
        email: { $regex: /@demo\.(com|ge)$/ },
      })
      .select("name phone email role avatar title")
      .sort({ role: 1, name: 1 })
      .lean()
      .exec();

    return users.map((u) => ({
      name: u.name || '',
      phone: u.phone || '',
      email: u.email || '',
      role: u.role || '',
      avatar: u.avatar || '',
      title: (u as Record<string, unknown>).title as string || '',
    }));
  }

  async checkExists(
    field: "email" | "phone",
    value: string,
  ): Promise<{ exists: boolean }> {
    let normalizedValue = value;
    if (field === "email") {
      normalizedValue = value.toLowerCase();
    } else if (field === "phone") {
      // Normalize phone: remove all spaces and dashes
      normalizedValue = value.replace(/[\s\-]/g, "");
    }

    // For phone, search with normalized value (no spaces)
    if (field === "phone") {
      // Find any user whose phone, when normalized, matches the input
      const users = await this.userModel.find({}).select("phone").exec();
      const exists = users.some((u) => {
        if (!u.phone) return false;
        const storedNormalized = u.phone.replace(/[\s\-]/g, "");
        return storedNormalized === normalizedValue;
      });
      return { exists };
    }

    const query = { [field]: normalizedValue };
    const user = await this.userModel.findOne(query).select("_id").exec();
    return { exists: !!user };
  }

  async upgradeToPro(
    userId: string,
    data: {
      selectedCategories: string[];
      selectedSubcategories?: string[];
      bio?: string;
      yearsExperience?: number;
      avatar?: string;
      whatsapp?: string;
      telegram?: string;
      instagram?: string;
      facebook?: string;
      linkedin?: string;
      website?: string;
      portfolioProjects?: Array<{
        id: string;
        title: string;
        description?: string;
        location?: string;
        images: string[];
        videos?: string[];
        beforeAfterPairs?: Array<{
          id: string;
          beforeImage: string;
          afterImage: string;
        }>;
        isVisible?: boolean;
        displayOrder?: number;
      }>;
    },
  ): Promise<User> {
    const user = await this.userModel.findById(userId).exec();

    if (!user) {
      throw new NotFoundException("User not found");
    }

    if (user.role === "pro") {
      throw new ConflictException("User is already a professional");
    }

    if (user.role !== "client") {
      throw new ConflictException(
        "Only clients can upgrade to professional status",
      );
    }

    // Build update object with only provided fields
    const updateData: Record<string, any> = {
      role: "pro",
      selectedCategories: data.selectedCategories,
    };

    if (data.selectedSubcategories?.length > 0) {
      updateData.selectedSubcategories = data.selectedSubcategories;
    }
    if (data.bio) {
      updateData.description = data.bio;
    }
    if (data.yearsExperience !== undefined) {
      updateData.yearsExperience = data.yearsExperience;
    }
    if (data.avatar) {
      updateData.avatar = data.avatar;
    }
    if (data.whatsapp) {
      updateData.whatsapp = data.whatsapp;
    }
    if (data.telegram) {
      updateData.telegram = data.telegram;
    }
    if (data.instagram) {
      updateData.instagramUrl = data.instagram;
    }
    if (data.facebook) {
      updateData.facebookUrl = data.facebook;
    }
    if (data.linkedin) {
      updateData.linkedinUrl = data.linkedin;
    }
    if (data.website) {
      updateData.websiteUrl = data.website;
    }
    if (data.portfolioProjects && data.portfolioProjects.length > 0) {
      updateData.portfolioProjects = data.portfolioProjects;
    }

    const updatedUser = await this.userModel
      .findByIdAndUpdate(userId, updateData, { new: true })
      .exec();

    // Log upgrade to pro
    this.logger.logActivity({
      type: ActivityType.USER_UPGRADE_TO_PRO,
      userId: updatedUser._id.toString(),
      userEmail: updatedUser.email,
      userName: updatedUser.name,
      details: {
        selectedCategories: data.selectedCategories,
        selectedSubcategories: data.selectedSubcategories,
      },
    });

    return updatedUser;
  }

  async setPendingEmail(
    userId: string,
    email: string,
  ): Promise<{ success: boolean; message: string }> {
    const normalizedEmail = email.toLowerCase().trim();

    const user = await this.userModel.findById(userId).exec();
    if (!user) {
      throw new NotFoundException("User not found");
    }

    // Check if this is the same as current email
    if (user.email === normalizedEmail) {
      throw new ConflictException("This is already your current email");
    }

    // Check if email is already used by another user
    const existingUser = await this.userModel
      .findOne({ email: normalizedEmail, _id: { $ne: userId } })
      .exec();
    if (existingUser) {
      throw new ConflictException("This email is already in use");
    }

    // Set as pending email
    await this.userModel
      .findByIdAndUpdate(userId, { pendingEmail: normalizedEmail })
      .exec();

    return {
      success: true,
      message: "Pending email set. Please verify with OTP.",
    };
  }

  async confirmEmailChange(userId: string): Promise<User> {
    const user = await this.userModel.findById(userId).exec();
    if (!user) {
      throw new NotFoundException("User not found");
    }

    if (!user.pendingEmail) {
      throw new ConflictException("No pending email to confirm");
    }

    const updatedUser = await this.userModel
      .findByIdAndUpdate(
        userId,
        {
          email: user.pendingEmail,
          pendingEmail: null,
          isEmailVerified: true,
          emailVerifiedAt: new Date(),
        },
        { new: true },
      )
      .exec();

    return updatedUser;
  }

  async findByUid(uid: number): Promise<User | null> {
    return this.userModel.findOne({ uid }).exec();
  }

  async assignUidsToExistingUsers(): Promise<{ updated: number }> {
    const usersWithoutUid = await this.userModel
      .find({ uid: { $exists: false } })
      .sort({ createdAt: 1 })
      .exec();

    if (usersWithoutUid.length === 0) {
      return { updated: 0 };
    }

    let nextUid = await this.generateNextUid();
    let updated = 0;

    for (const user of usersWithoutUid) {
      await this.userModel.findByIdAndUpdate(user._id, { uid: nextUid });
      nextUid++;
      updated++;
    }

    return { updated };
  }

  // ============== SERVICE ADDRESSES ==============

  async getServiceAddresses(userId: string): Promise<ServiceAddress[]> {
    const user = await this.userModel.findById(userId).exec();
    if (!user) {
      throw new NotFoundException("User not found");
    }
    return user.serviceAddresses || [];
  }

  async addServiceAddress(
    userId: string,
    dto: {
      label: "home" | "work" | "custom";
      customLabel?: string;
      formattedAddress: string;
      lat: number;
      lng: number;
      apartment?: string;
      floor?: string;
      entrance?: string;
      notes?: string;
      setAsDefault?: boolean;
    },
  ): Promise<ServiceAddress> {
    const user = await this.userModel.findById(userId).exec();
    if (!user) {
      throw new NotFoundException("User not found");
    }

    const newAddress: ServiceAddress = {
      id: uuidv4(),
      label: dto.label,
      customLabel: dto.customLabel,
      formattedAddress: dto.formattedAddress,
      lat: dto.lat,
      lng: dto.lng,
      apartment: dto.apartment,
      floor: dto.floor,
      entrance: dto.entrance,
      notes: dto.notes,
      isDefault: dto.setAsDefault || user.serviceAddresses?.length === 0,
      createdAt: new Date(),
    };

    // If setting as default, unset other defaults
    if (newAddress.isDefault && user.serviceAddresses?.length > 0) {
      user.serviceAddresses = user.serviceAddresses.map((addr) => ({
        ...addr,
        isDefault: false,
      }));
    }

    user.serviceAddresses = [...(user.serviceAddresses || []), newAddress];
    await user.save();

    return newAddress;
  }

  async updateServiceAddress(
    userId: string,
    addressId: string,
    dto: Partial<{
      label: "home" | "work" | "custom";
      customLabel: string;
      formattedAddress: string;
      lat: number;
      lng: number;
      apartment: string;
      floor: string;
      entrance: string;
      notes: string;
      setAsDefault: boolean;
    }>,
  ): Promise<ServiceAddress> {
    const user = await this.userModel.findById(userId).exec();
    if (!user) {
      throw new NotFoundException("User not found");
    }

    const addressIndex = user.serviceAddresses?.findIndex(
      (addr) => addr.id === addressId,
    );
    if (addressIndex === undefined || addressIndex === -1) {
      throw new NotFoundException("Address not found");
    }

    const existing = user.serviceAddresses[addressIndex];
    const updated: ServiceAddress = {
      ...existing,
      ...(dto.label !== undefined && { label: dto.label }),
      ...(dto.customLabel !== undefined && { customLabel: dto.customLabel }),
      ...(dto.formattedAddress !== undefined && {
        formattedAddress: dto.formattedAddress,
      }),
      ...(dto.lat !== undefined && { lat: dto.lat }),
      ...(dto.lng !== undefined && { lng: dto.lng }),
      ...(dto.apartment !== undefined && { apartment: dto.apartment }),
      ...(dto.floor !== undefined && { floor: dto.floor }),
      ...(dto.entrance !== undefined && { entrance: dto.entrance }),
      ...(dto.notes !== undefined && { notes: dto.notes }),
    };

    if (dto.setAsDefault) {
      user.serviceAddresses = user.serviceAddresses.map((addr) => ({
        ...addr,
        isDefault: false,
      }));
      updated.isDefault = true;
    }

    user.serviceAddresses[addressIndex] = updated;
    await user.save();

    return updated;
  }

  async deleteServiceAddress(userId: string, addressId: string): Promise<void> {
    const user = await this.userModel.findById(userId).exec();
    if (!user) {
      throw new NotFoundException("User not found");
    }

    const addressIndex = user.serviceAddresses?.findIndex(
      (addr) => addr.id === addressId,
    );
    if (addressIndex === undefined || addressIndex === -1) {
      throw new NotFoundException("Address not found");
    }

    const wasDefault = user.serviceAddresses[addressIndex].isDefault;
    user.serviceAddresses.splice(addressIndex, 1);

    // If deleted address was default and there are other addresses, set first one as default
    if (wasDefault && user.serviceAddresses.length > 0) {
      user.serviceAddresses[0].isDefault = true;
    }

    await user.save();
  }

  async setDefaultServiceAddress(
    userId: string,
    addressId: string,
  ): Promise<ServiceAddress> {
    const user = await this.userModel.findById(userId).exec();
    if (!user) {
      throw new NotFoundException("User not found");
    }

    const addressIndex = user.serviceAddresses?.findIndex(
      (addr) => addr.id === addressId,
    );
    if (addressIndex === undefined || addressIndex === -1) {
      throw new NotFoundException("Address not found");
    }

    // Unset all defaults and set the new one
    user.serviceAddresses = user.serviceAddresses.map((addr) => ({
      ...addr,
      isDefault: addr.id === addressId,
    }));

    await user.save();
    return user.serviceAddresses[addressIndex];
  }

  // Payment Methods
  async getPaymentMethods(userId: string): Promise<PaymentMethod[]> {
    const user = await this.userModel.findById(userId).exec();
    if (!user) {
      throw new NotFoundException("User not found");
    }
    return user.paymentMethods || [];
  }

  async addCardPaymentMethod(
    userId: string,
    cardNumber: string,
    cardExpiry: string,
    cardholderName: string,
    setAsDefault: boolean = false,
  ): Promise<PaymentMethod> {
    const user = await this.userModel.findById(userId).exec();
    if (!user) {
      throw new NotFoundException("User not found");
    }

    // Detect card brand from number
    const cardBrand = this.detectCardBrand(cardNumber);
    const cardLast4 = cardNumber.slice(-4);

    const newPaymentMethod: PaymentMethod = {
      id: uuidv4(),
      type: "card",
      cardLast4,
      cardBrand,
      cardExpiry,
      cardholderName,
      isDefault: setAsDefault || user.paymentMethods?.length === 0,
      createdAt: new Date(),
    };

    // If setting as default, unset other defaults
    if (newPaymentMethod.isDefault && user.paymentMethods?.length > 0) {
      user.paymentMethods = user.paymentMethods.map((pm) => ({
        ...pm,
        isDefault: false,
      }));
    }

    user.paymentMethods = [...(user.paymentMethods || []), newPaymentMethod];
    await user.save();

    return newPaymentMethod;
  }

  async addBankPaymentMethod(
    userId: string,
    bankName: string,
    iban: string,
    setAsDefault: boolean = false,
  ): Promise<PaymentMethod> {
    const user = await this.userModel.findById(userId).exec();
    if (!user) {
      throw new NotFoundException("User not found");
    }

    // Mask IBAN (show first 4 and last 4)
    const maskedIban =
      iban.length > 8 ? `${iban.slice(0, 4)}****${iban.slice(-4)}` : iban;

    const newPaymentMethod: PaymentMethod = {
      id: uuidv4(),
      type: "bank",
      bankName,
      maskedIban,
      isDefault: setAsDefault || user.paymentMethods?.length === 0,
      createdAt: new Date(),
    };

    // If setting as default, unset other defaults
    if (newPaymentMethod.isDefault && user.paymentMethods?.length > 0) {
      user.paymentMethods = user.paymentMethods.map((pm) => ({
        ...pm,
        isDefault: false,
      }));
    }

    user.paymentMethods = [...(user.paymentMethods || []), newPaymentMethod];
    await user.save();

    return newPaymentMethod;
  }

  async deletePaymentMethod(
    userId: string,
    paymentMethodId: string,
  ): Promise<void> {
    const user = await this.userModel.findById(userId).exec();
    if (!user) {
      throw new NotFoundException("User not found");
    }

    const methodIndex = user.paymentMethods?.findIndex(
      (pm) => pm.id === paymentMethodId,
    );
    if (methodIndex === undefined || methodIndex === -1) {
      throw new NotFoundException("Payment method not found");
    }

    const wasDefault = user.paymentMethods[methodIndex].isDefault;
    user.paymentMethods.splice(methodIndex, 1);

    // If deleted method was default and there are other methods, set first one as default
    if (wasDefault && user.paymentMethods.length > 0) {
      user.paymentMethods[0].isDefault = true;
    }

    await user.save();
  }

  async setDefaultPaymentMethod(
    userId: string,
    paymentMethodId: string,
  ): Promise<PaymentMethod> {
    const user = await this.userModel.findById(userId).exec();
    if (!user) {
      throw new NotFoundException("User not found");
    }

    const methodIndex = user.paymentMethods?.findIndex(
      (pm) => pm.id === paymentMethodId,
    );
    if (methodIndex === undefined || methodIndex === -1) {
      throw new NotFoundException("Payment method not found");
    }

    // Unset all defaults and set the new one
    user.paymentMethods = user.paymentMethods.map((pm) => ({
      ...pm,
      isDefault: pm.id === paymentMethodId,
    }));

    await user.save();
    return user.paymentMethods[methodIndex];
  }

  private detectCardBrand(cardNumber: string): string {
    const cleanNumber = cardNumber.replace(/\s/g, "");

    if (/^4/.test(cleanNumber)) return "Visa";
    if (/^5[1-5]/.test(cleanNumber) || /^2[2-7]/.test(cleanNumber))
      return "Mastercard";
    if (/^3[47]/.test(cleanNumber)) return "Amex";
    if (/^6(?:011|5)/.test(cleanNumber)) return "Discover";
    if (/^(?:2131|1800|35)/.test(cleanNumber)) return "JCB";

    return "Card";
  }

  // ============== PRO-RELATED METHODS ==============

  // Location data with localized translations. Keyed by either country
  // NAME ("Georgia") or ISO 3166-1 alpha-2 code ("GE"); `getLocations`
  // normalises the lookup so callers can pass whichever they have.
  //
  // Per-country regions are curated lists of the highest-demand metros
  // in each marketplace; the goal is to cover the cities where Homico
  // currently has supply, not to be encyclopedic. Add more regions
  // when supply grows in a market.
  private readonly LOCATIONS_DATA = {
    Georgia: {
      nationwide: { en: "Countrywide", ka: "მთელი ქვეყანა" },
      country: { en: "Georgia", ka: "საქართველო" },
      regions: {
        თბილისი: {
          en: "Tbilisi",
          cities: ["თბილისი", "რუსთავი", "მცხეთა"],
          citiesEn: ["Tbilisi", "Rustavi", "Mtskheta"],
        },
        აჭარა: {
          en: "Adjara",
          cities: ["ბათუმი", "ქობულეთი", "ხელვაჩაური", "შუახევი"],
          citiesEn: ["Batumi", "Kobuleti", "Khelvachauri", "Shuakhevi"],
        },
        იმერეთი: {
          en: "Imereti",
          cities: ["ქუთაისი", "ზესტაფონი", "ჭიათურა", "ხონი", "სამტრედია"],
          citiesEn: ["Kutaisi", "Zestaponi", "Chiatura", "Khoni", "Samtredia"],
        },
        "ქვემო ქართლი": {
          en: "Kvemo Kartli",
          cities: ["რუსთავი", "ბოლნისი", "გარდაბანი", "მარნეული", "თეთრიწყარო"],
          citiesEn: [
            "Rustavi",
            "Bolnisi",
            "Gardabani",
            "Marneuli",
            "Tetritskaro",
          ],
        },
        კახეთი: {
          en: "Kakheti",
          cities: [
            "თელავი",
            "გურჯაანი",
            "სიღნაღი",
            "საგარეჯო",
            "დედოფლისწყარო",
          ],
          citiesEn: [
            "Telavi",
            "Gurjaani",
            "Sighnaghi",
            "Sagarejo",
            "Dedoplistskaro",
          ],
        },
        "სამეგრელო-ზემო სვანეთი": {
          en: "Samegrelo-Zemo Svaneti",
          cities: ["ზუგდიდი", "ფოთი", "მესტია", "სენაკი"],
          citiesEn: ["Zugdidi", "Poti", "Mestia", "Senaki"],
        },
        "შიდა ქართლი": {
          en: "Shida Kartli",
          cities: ["გორი", "კასპი", "ქარელი", "ხაშური"],
          citiesEn: ["Gori", "Kaspi", "Kareli", "Khashuri"],
        },
        "სამცხე-ჯავახეთი": {
          en: "Samtskhe-Javakheti",
          cities: ["ახალციხე", "ბორჯომი", "ახალქალაქი", "ნინოწმინდა"],
          citiesEn: ["Akhaltsikhe", "Borjomi", "Akhalkalaki", "Ninotsminda"],
        },
        "მცხეთა-მთიანეთი": {
          en: "Mtskheta-Mtianeti",
          cities: ["მცხეთა", "დუშეთი", "თიანეთი", "ყაზბეგი"],
          citiesEn: ["Mtskheta", "Dusheti", "Tianeti", "Kazbegi"],
        },
        "რაჭა-ლეჩხუმი": {
          en: "Racha-Lechkhumi",
          cities: ["ამბროლაური", "ონი", "ცაგერი", "ლენტეხი"],
          citiesEn: ["Ambrolauri", "Oni", "Tsageri", "Lentekhi"],
        },
        გურია: {
          en: "Guria",
          cities: ["ოზურგეთი", "ლანჩხუთი", "ჩოხატაური"],
          citiesEn: ["Ozurgeti", "Lanchkhuti", "Chokhatauri"],
        },
      },
      emoji: "🇬🇪",
    },
    Israel: {
      nationwide: { en: "Nationwide", ka: "მთელი ქვეყანა" },
      country: { en: "Israel", ka: "ისრაელი" },
      regions: {
        "ცენტრალური / Tel Aviv": {
          en: "Tel Aviv & Center",
          cities: ["თელ-ავივი", "რამატ განი", "გივატაიმი", "ჰერცლია", "ბათ იამი"],
          citiesEn: ["Tel Aviv", "Ramat Gan", "Givatayim", "Herzliya", "Bat Yam"],
        },
        იერუსალიმი: {
          en: "Jerusalem",
          cities: ["იერუსალიმი", "ბეთ შემეში"],
          citiesEn: ["Jerusalem", "Beit Shemesh"],
        },
        ჩრდილოეთი: {
          en: "Northern District",
          cities: ["ჰაიფა", "ნაცარეთი", "ტიბერია", "აქრე"],
          citiesEn: ["Haifa", "Nazareth", "Tiberias", "Acre"],
        },
        სამხრეთი: {
          en: "Southern District",
          cities: ["ბერშება", "აშდოდი", "ეილათი"],
          citiesEn: ["Beersheba", "Ashdod", "Eilat"],
        },
      },
      emoji: "🇮🇱",
    },
    France: {
      nationwide: { en: "Nationwide", ka: "მთელი ქვეყანა" },
      country: { en: "France", ka: "საფრანგეთი" },
      regions: {
        "ილ-დე-ფრანსი": {
          en: "Île-de-France",
          cities: ["პარიზი", "ვერსალი", "ბულონ-ბიანკური", "სენ-დენი"],
          citiesEn: ["Paris", "Versailles", "Boulogne-Billancourt", "Saint-Denis"],
        },
        "ოვერნ-რონ-ალპები": {
          en: "Auvergne-Rhône-Alpes",
          cities: ["ლიონი", "გრენობლი", "სენტ-ეტიენი"],
          citiesEn: ["Lyon", "Grenoble", "Saint-Etienne"],
        },
        "პროვანსი-ალპები-კოტ-დაზური": {
          en: "Provence-Alpes-Côte d'Azur",
          cities: ["მარსელი", "ნიცა", "ტულონი", "კანი"],
          citiesEn: ["Marseille", "Nice", "Toulon", "Cannes"],
        },
        ოკიტანია: {
          en: "Occitanie",
          cities: ["ტულუზა", "მონპელიე", "ნიმი"],
          citiesEn: ["Toulouse", "Montpellier", "Nimes"],
        },
        "ნოვა აქვიტანია": {
          en: "Nouvelle-Aquitaine",
          cities: ["ბორდო", "ლიმოჟი"],
          citiesEn: ["Bordeaux", "Limoges"],
        },
      },
      emoji: "🇫🇷",
    },
    "United States": {
      nationwide: { en: "Nationwide", ka: "მთელი ქვეყანა" },
      country: { en: "United States", ka: "ამერიკის შეერთებული შტატები" },
      regions: {
        "ნიუ-იორკი": {
          en: "New York",
          cities: ["ნიუ-იორკი", "ბრუკლინი", "კუინსი", "ბრონქსი", "სტატენ-აილენდი"],
          citiesEn: ["New York", "Brooklyn", "Queens", "Bronx", "Staten Island"],
        },
        კალიფორნია: {
          en: "California",
          cities: ["ლოს-ანჯელესი", "სან-დიეგო", "სან-ფრანცისკო", "სან-ხოსე"],
          citiesEn: ["Los Angeles", "San Diego", "San Francisco", "San Jose"],
        },
        ტეხასი: {
          en: "Texas",
          cities: ["ჰიუსტონი", "ოსტინი", "დალასი", "სან-ანტონიო"],
          citiesEn: ["Houston", "Austin", "Dallas", "San Antonio"],
        },
        ფლორიდა: {
          en: "Florida",
          cities: ["მაიამი", "ორლანდო", "ტამპა", "ჯეკსონვილი"],
          citiesEn: ["Miami", "Orlando", "Tampa", "Jacksonville"],
        },
        ილინოისი: {
          en: "Illinois",
          cities: ["ჩიკაგო", "სპრინგფილდი"],
          citiesEn: ["Chicago", "Springfield"],
        },
      },
      emoji: "🇺🇸",
    },
    Germany: {
      nationwide: { en: "Nationwide", ka: "მთელი ქვეყანა" },
      country: { en: "Germany", ka: "გერმანია" },
      regions: {
        ბერლინი: {
          en: "Berlin",
          cities: ["ბერლინი"],
          citiesEn: ["Berlin"],
        },
        ბავარია: {
          en: "Bavaria",
          cities: ["მიუნხენი", "ნიურნბერგი", "აუგსბურგი"],
          citiesEn: ["Munich", "Nuremberg", "Augsburg"],
        },
        "ჩრდილოეთ რაინ-ვესტფალია": {
          en: "North Rhine-Westphalia",
          cities: ["კიოლნი", "დიუსელდორფი", "დორტმუნდი", "ესენი", "ბონი"],
          citiesEn: ["Cologne", "Düsseldorf", "Dortmund", "Essen", "Bonn"],
        },
        "ჰამბურგი": {
          en: "Hamburg",
          cities: ["ჰამბურგი"],
          citiesEn: ["Hamburg"],
        },
        "ბადენ-ვიურტემბერგი": {
          en: "Baden-Württemberg",
          cities: ["შტუტგარტი", "კარლსრუე", "მანჰაიმი"],
          citiesEn: ["Stuttgart", "Karlsruhe", "Mannheim"],
        },
      },
      emoji: "🇩🇪",
    },
    "United Kingdom": {
      nationwide: { en: "Nationwide", ka: "მთელი ქვეყანა" },
      country: { en: "United Kingdom", ka: "გაერთიანებული სამეფო" },
      regions: {
        ლონდონი: {
          en: "Greater London",
          cities: ["ლონდონი", "კროიდონი", "ვუდიჩი"],
          citiesEn: ["London", "Croydon", "Woolwich"],
        },
        "ინგლისის ჩრდილო-დასავლეთი": {
          en: "North West England",
          cities: ["მანჩესტერი", "ლივერპული", "ბოლტონი"],
          citiesEn: ["Manchester", "Liverpool", "Bolton"],
        },
        "ვესტ-მიდლენდსი": {
          en: "West Midlands",
          cities: ["ბირმინგემი", "კოვენტრი", "ვულვერჰემპტონი"],
          citiesEn: ["Birmingham", "Coventry", "Wolverhampton"],
        },
        შოტლანდია: {
          en: "Scotland",
          cities: ["გლაზგო", "ედინბურგი", "აბერდინი"],
          citiesEn: ["Glasgow", "Edinburgh", "Aberdeen"],
        },
        უელსი: {
          en: "Wales",
          cities: ["კარდიფი", "სუონსი", "ნიუპორტი"],
          citiesEn: ["Cardiff", "Swansea", "Newport"],
        },
      },
      emoji: "🇬🇧",
    },
  };

  // ISO 3166-1 alpha-2 codes that the frontend sends (e.g. "GE", "IL")
  // mapped to the LOCATIONS_DATA keys we use internally. Anything not
  // in this table falls back to Georgia in `getLocations`.
  private readonly COUNTRY_CODE_TO_NAME: Record<string, string> = {
    GE: "Georgia",
    IL: "Israel",
    FR: "France",
    US: "United States",
    DE: "Germany",
    UK: "United Kingdom",
    GB: "United Kingdom",
  };

  getLocations(country?: string, locale?: string) {
    // Resolve the lookup key. Frontends post-2026-05 send ISO codes
    // ("GE", "IL", "FR"...); pre-migration callers and admin tools
    // sometimes pass the country name directly. Either works.
    const raw = (country || "GE").toString();
    const upper = raw.toUpperCase();
    const targetCountry =
      this.COUNTRY_CODE_TO_NAME[upper] ||
      (this.LOCATIONS_DATA[raw as keyof typeof this.LOCATIONS_DATA]
        ? raw
        : "Georgia");
    const isGeorgian = locale === "ka";

    type RegionData = { en: string; cities: string[]; citiesEn: string[] };

    const buildCityMapping = (
      regions: Record<string, RegionData>,
    ): Record<string, string> => {
      // Build a mapping from any city name (ka or en) to the current locale's display name
      const mapping: Record<string, string> = {};
      for (const regionData of Object.values(regions)) {
        for (let i = 0; i < regionData.cities.length; i++) {
          const cityKa = regionData.cities[i];
          const cityEn = regionData.citiesEn[i];
          const displayCity = isGeorgian ? cityKa : cityEn;
          // Map both ka and en names to the display name
          mapping[cityKa] = displayCity;
          mapping[cityEn] = displayCity;
        }
      }
      return mapping;
    };

    if (this.LOCATIONS_DATA[targetCountry]) {
      const data = this.LOCATIONS_DATA[targetCountry];

      // Transform regions to the expected format based on locale
      const regions: Record<string, string[]> = {};
      for (const [regionKa, regionData] of Object.entries(data.regions) as [
        string,
        RegionData,
      ][]) {
        const regionName = isGeorgian ? regionKa : regionData.en;
        const cities = isGeorgian ? regionData.cities : regionData.citiesEn;
        regions[regionName] = cities;
      }

      // Build city mapping for translating saved serviceAreas
      const cityMapping = buildCityMapping(
        data.regions as Record<string, RegionData>,
      );

      return {
        country: isGeorgian ? data.country.ka : data.country.en,
        nationwide: isGeorgian ? data.nationwide.ka : data.nationwide.en,
        nationwideKa: data.nationwide.ka,
        nationwideEn: data.nationwide.en,
        regions,
        cityMapping,
        emoji: data.emoji,
      };
    }

    // Default fallback
    const defaultData = this.LOCATIONS_DATA["Georgia"];
    const regions: Record<string, string[]> = {};
    for (const [regionKa, regionData] of Object.entries(
      defaultData.regions,
    ) as [string, RegionData][]) {
      const regionName = isGeorgian ? regionKa : regionData.en;
      const cities = isGeorgian ? regionData.cities : regionData.citiesEn;
      regions[regionName] = cities;
    }

    // Build city mapping for translating saved serviceAreas
    const cityMapping = buildCityMapping(
      defaultData.regions as Record<string, RegionData>,
    );

    return {
      country: isGeorgian ? defaultData.country.ka : defaultData.country.en,
      nationwide: isGeorgian
        ? defaultData.nationwide.ka
        : defaultData.nationwide.en,
      nationwideKa: defaultData.nationwide.ka,
      nationwideEn: defaultData.nationwide.en,
      regions,
      cityMapping,
      emoji: defaultData.emoji,
    };
  }

  async getSchedule(userId: string) {
    const user = await this.userModel
      .findById(userId)
      .select("weeklySchedule scheduleOverrides")
      .exec();
    if (!user) throw new NotFoundException("User not found");
    return {
      weeklySchedule: user.weeklySchedule || [],
      scheduleOverrides: user.scheduleOverrides || [],
    };
  }

  async updateSchedule(
    userId: string,
    data: {
      weeklySchedule?: {
        dayOfWeek: number;
        isAvailable: boolean;
        startHour: number;
        endHour: number;
      }[];
      scheduleOverrides?: {
        date: string;
        isBlocked: boolean;
        startHour?: number;
        endHour?: number;
      }[];
    },
  ) {
    const updateData: any = {};
    if (data.weeklySchedule !== undefined)
      updateData.weeklySchedule = data.weeklySchedule;
    if (data.scheduleOverrides !== undefined)
      updateData.scheduleOverrides = data.scheduleOverrides;

    // If pro is still in registration (step 4 = pricing done, schedule not yet saved),
    // mark registration as complete and set pending verification for admin approval
    const current = await this.userModel.findById(userId).select("registrationStep isProfileCompleted role name").exec();
    const isCompletingRegistration = current?.role === 'pro' && current.registrationStep === 4 && !current.isProfileCompleted;
    if (isCompletingRegistration) {
      updateData.registrationStep = 5;
      updateData.isProfileCompleted = true;
      updateData.verificationStatus = 'pending';
    }

    const user = await this.userModel
      .findByIdAndUpdate(userId, { $set: updateData }, { new: true })
      .select("weeklySchedule scheduleOverrides isProfileCompleted verificationStatus registrationStep")
      .exec();
    if (!user) throw new NotFoundException("User not found");

    // Notify all admins about new pro registration pending approval
    if (isCompletingRegistration) {
      const admins = await this.userModel.find({ role: 'admin' }).select('_id').exec();
      if (admins.length > 0) {
        const notifications = admins.map((admin) => ({
          userId: admin._id,
          type: 'profile_update',
          title: 'New Pro Registration',
          message: `${current.name} has completed registration and is awaiting approval`,
          link: '/admin/pending-pros',
          referenceId: current._id,
          referenceModel: 'User',
        }));
        await this.notificationModel.insertMany(notifications);
      }
    }

    return {
      weeklySchedule: user.weeklySchedule || [],
      scheduleOverrides: user.scheduleOverrides || [],
      isProfileCompleted: user.isProfileCompleted,
      verificationStatus: user.verificationStatus,
    };
  }

  async findAllPros(filters?: {
    category?: string;
    subcategory?: string;
    subcategories?: string; // comma-separated list of subcategories
    serviceArea?: string;
    minRating?: number;
    minPrice?: number;
    maxPrice?: number;
    search?: string;
    sort?: string;
    page?: number;
    limit?: number;
    excludeUserId?: string;
    scheduledDate?: string;
    scheduledSlot?: string;
    serviceKey?: string;
    serviceMinPrice?: number;
    serviceMaxPrice?: number;
    /**
     * Filter to pros who speak ANY of the listed languages. ISO 639-1
     * codes like "en", "ka", "ru". Matched against User.languages array
     * via $in. Added 2026-05 for AI chat richer search.
     */
    languages?: string[];
    /**
     * ISO 3166-1 alpha-2 country code. When set, restricts results to
     * pros in that marketplace. When omitted, returns pros across every
     * country - controller defaults to "GE" for non-admin callers and
     * leaves it undefined for admins so the cross-country admin view
     * stays uncluttered.
     */
    country?: string;
    /**
     * Quality floor for the default browse first-impression. When true, hides
     * "empty shell" pros - those with NO portfolio, NO priced services, and NO
     * reviews (a client cannot evaluate or hire them). Opt-in so other
     * consumers (admin, AI search) keep the full set; the browse page sets it.
     */
    completeOnly?: boolean;
    /** When true, return only Homico Partners (the bookable pros). */
    partnersOnly?: boolean;
  }): Promise<{
    data: User[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
      hasMore: boolean;
    };
  }> {
    const page = filters?.page || 1;
    const limit = filters?.limit || 6;
    const skip = (page - 1) * limit;

    // Build sort object - always sort premium first.
    //
    // The default "recommended" sort uses a derived `profileScore` (computed
    // in the aggregation below) so that visually-complete profiles (with
    // portfolio photos, real bios, priced services) rank above bare ones.
    // The previous default put any pro with `totalReviews > 0` first, but
    // most pros currently have zero reviews so the listing showed empty
    // cards on top - exactly the issue users were complaining about.
    //
    // Other sorts (rating, newest, price-low/high) still respect the user's
    // explicit choice; profileScore appears only as a soft tiebreaker so
    // identical-rating / identical-price pros are deterministically ordered
    // with the fuller profile on top.
    //
    // Include _id as final sort key to ensure consistent pagination across
    // pages (prevents duplicate items appearing in two pages).
    // Sort orders. Every variant places `hasVisiblePortfolio` right
    // after `isPremium` so that within each premium tier, pros whose
    // cards show real project photos beat empty-card pros at the same
    // tier - users were seeing portfolio-having pros buried below
    // premium-but-no-photo pros because the only signal between tiers
    // was `profileScore`, which mixes portfolio with avatar/bio/etc.
    // and could be matched by a complete-but-no-portfolio profile.
    // Adding the explicit portfolio flag makes "has photos" a hard
    // ordering criterion rather than a few extra points.
    let sortObj: any = {};
    switch (filters?.sort) {
      case "rating":
        sortObj = { isHomicoPartner: -1, isFeatured: -1, isPremium: -1, hasVisiblePortfolio: -1, avgRating: -1, totalReviews: -1, profileScore: -1, _id: -1 };
        break;
      case "reviews":
        sortObj = { isHomicoPartner: -1, isFeatured: -1, isPremium: -1, hasVisiblePortfolio: -1, totalReviews: -1, profileScore: -1, _id: -1 };
        break;
      case "price-low":
        sortObj = { isHomicoPartner: -1, isFeatured: -1, isPremium: -1, hasVisiblePortfolio: -1, basePrice: 1, profileScore: -1, _id: -1 };
        break;
      case "price-high":
        sortObj = { isHomicoPartner: -1, isFeatured: -1, isPremium: -1, hasVisiblePortfolio: -1, basePrice: -1, profileScore: -1, _id: -1 };
        break;
      case "newest":
        sortObj = { isHomicoPartner: -1, isFeatured: -1, isPremium: -1, hasVisiblePortfolio: -1, createdAt: -1, profileScore: -1, _id: -1 };
        break;
      case "badges":
        // Sort by standing/badges: editor's-pick (featured) first, then paid
        // premium, then the top-rated badge (rating + review volume), then
        // portfolio. All listed pros are already verified, so that badge is a
        // constant rather than a differentiator here.
        sortObj = { isHomicoPartner: -1, isFeatured: -1, isPremium: -1, avgRating: -1, totalReviews: -1, hasVisiblePortfolio: -1, profileScore: -1, _id: -1 };
        break;
      default:
        // "recommended" - portfolio-having pros at the top of each
        // premium tier, then profileScore, then reviews/rating as
        // tiebreakers within identical-portfolio bands.
        sortObj = {
          // Homico Partners (bookable, contracted) lead every list.
          isHomicoPartner: -1,
          isFeatured: -1,
          isPremium: -1,
          hasVisiblePortfolio: -1,
          profileScore: -1,
          totalReviews: -1,
          avgRating: -1,
          _id: -1,
        };
    }

    // Build query - only role=pro
    // Include pros where isAvailable is true OR not set (for backwards compatibility)
    // Exclude deactivated profiles
    // Only show pros with completed profiles AND approved by admin
    const query: any = {
      role: "pro",
      $and: [
        {
          $or: [{ isAvailable: true }, { isAvailable: { $exists: false } }],
        },
        {
          $or: [
            { isProfileDeactivated: false },
            { isProfileDeactivated: { $exists: false } },
          ],
        },
        {
          $or: [
            { isProfileCompleted: true },
            // For backwards compatibility: consider profiles with basic data as complete
            {
              $and: [
                { categories: { $exists: true, $ne: [] } },
                {
                  $or: [
                    { bio: { $exists: true, $ne: "" } },
                    { description: { $exists: true, $ne: "" } },
                  ],
                },
              ],
            },
          ],
        },
        // Only show verified professionals
        { verificationStatus: "verified" },
      ],
    };

    // Quality floor (opt-in). Empty-shell profiles - no portfolio, no priced
    // services, no reviews - give a first-time client nothing to judge, so the
    // default browse hides them. A pro needs ANY one real signal to appear.
    if (filters?.completeOnly) {
      query.$and.push({
        $or: [
          { "portfolioProjects.0": { $exists: true } },
          { "servicePricing.0": { $exists: true } },
          { totalReviews: { $gt: 0 } },
        ],
      });
    }

    // Country scoping (added 2026-05). The pro's `country` field is
    // populated by the backfill migration on existing rows and at
    // registration for new pros. We match by exact code AND by the
    // legacy "missing country" case so a freshly migrated DB doesn't
    // skip pros whose backfill hasn't run yet.
    if (filters?.country) {
      query.$and.push({
        $or: [
          { country: filters.country },
          // Legacy rows from before the migration: treat them as GE
          // since that's the historical default.
          ...(filters.country === "GE"
            ? [{ country: { $exists: false } }, { country: null }, { country: "" }]
            : []),
        ],
      });
    }

    // Exclude current user from results
    if (filters?.excludeUserId) {
      const { Types } = require("mongoose");
      query._id = { $ne: new Types.ObjectId(filters.excludeUserId) };
    }

    if (filters?.category) {
      query.$and.push({
        $or: [
          { categories: filters.category },
          { selectedCategories: filters.category },
          { "servicePricing.categoryKey": filters.category },
        ],
      });
    }

    // Handle multiple subcategories/services (comma-separated) or single
    // Keys can be subcategory-level OR service-level, so check all relevant fields
    if (filters?.subcategories) {
      const subcatArray = filters.subcategories
        .split(",")
        .map((s: string) => s.trim())
        .filter(Boolean);
      if (subcatArray.length > 0) {
        query.$and.push({
          $or: [
            { subcategories: { $in: subcatArray } },
            { selectedSubcategories: { $in: subcatArray } },
            { "servicePricing.subcategoryKey": { $in: subcatArray } },
            { "servicePricing.serviceKey": { $in: subcatArray } },
            { "selectedServices.key": { $in: subcatArray } },
          ],
        });
      }
    } else if (filters?.subcategory) {
      query.$and.push({
        $or: [
          { subcategories: filters.subcategory },
          { selectedSubcategories: filters.subcategory },
          { "servicePricing.subcategoryKey": filters.subcategory },
          { "servicePricing.serviceKey": filters.subcategory },
          { "selectedServices.key": filters.subcategory },
        ],
      });
    }

    if (filters?.serviceArea) {
      query.serviceAreas = filters.serviceArea;
    }

    // Service-level filters on servicePricing array
    if (filters?.serviceKey || filters?.serviceMinPrice !== undefined || filters?.serviceMaxPrice !== undefined) {
      const elemMatch: any = {};
      if (filters?.serviceKey) {
        elemMatch.serviceKey = filters.serviceKey;
      }
      elemMatch.isActive = true;
      if (filters?.serviceMinPrice !== undefined) {
        elemMatch.price = { ...elemMatch.price, $gte: filters.serviceMinPrice };
      }
      if (filters?.serviceMaxPrice !== undefined) {
        elemMatch.price = { ...elemMatch.price, $lte: filters.serviceMaxPrice };
      }
      query.$and.push({ servicePricing: { $elemMatch: elemMatch } });
    }

    if (filters?.minRating) {
      query.avgRating = { $gte: filters.minRating };
    }

    if (filters?.partnersOnly) {
      query.isHomicoPartner = true;
    }

    if (filters?.languages && filters.languages.length > 0) {
      // Match if the pro speaks ANY of the requested languages.
      query.languages = { $in: filters.languages };
    }

    // Price filter should work for different pricing models:
    // - fixed/from/hourly/etc: basePrice (maxPrice may be missing or equal)
    // - project_based range: basePrice..maxPrice
    // We match pros whose price range overlaps the requested range:
    // proMax >= filterMin AND proMin <= filterMax
    if (filters?.minPrice !== undefined || filters?.maxPrice !== undefined) {
      const proMinExpr = { $ifNull: ["$basePrice", 0] };
      const proMaxExpr = { $ifNull: ["$maxPrice", proMinExpr] };
      const exprAnd: any[] = [];
      if (filters?.minPrice !== undefined) {
        exprAnd.push({ $gte: [proMaxExpr, filters.minPrice] });
      }
      if (filters?.maxPrice !== undefined) {
        exprAnd.push({ $lte: [proMinExpr, filters.maxPrice] });
      }
      query.$expr = exprAnd.length > 1 ? { $and: exprAnd } : exprAnd[0];
    }

    if (filters?.search) {
      const searchTerm = filters.search.trim();

      if (searchTerm.startsWith("#")) {
        const uidSearch = searchTerm.substring(1);
        const uidNumber = parseInt(uidSearch, 10);
        if (!isNaN(uidNumber)) {
          query.uid = uidNumber;
        }
      } else {
        // The regex matches the user's own free-text profile fields. That
        // catches "Giorgi" → pros named Giorgi, but completely misses
        // "ავეჯი" → pros offering furniture services (because the word
        // never appears on the user document; it lives only on the catalog
        // labels we render from `servicePricing.serviceKey` etc.).
        //
        // We expand the match by walking the cached catalog and collecting
        // every service / subcategory / category key whose label in any
        // locale contains the search term, then asking Mongo to also match
        // pros whose servicePricing / selectedServices / subcategories
        // arrays reference any of those keys. Result: search by name AND
        // by services in one query, no extra round-trip, no LLM call.
        const escaped = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const searchRegex = new RegExp(escaped, "i");
        const orClauses: Array<Record<string, unknown>> = [
          { name: searchRegex },
          { title: searchRegex },
          { tagline: searchRegex },
          { description: searchRegex },
          { bio: searchRegex },
          { categories: searchRegex },
          { subcategories: searchRegex },
        ];
        const matchedKeys = await this.findCatalogKeyMatches(searchTerm);
        if (matchedKeys.size > 0) {
          const keysArr = Array.from(matchedKeys);
          orClauses.push(
            { categories: { $in: keysArr } },
            { selectedCategories: { $in: keysArr } },
            { subcategories: { $in: keysArr } },
            { selectedSubcategories: { $in: keysArr } },
            { "selectedServices.key": { $in: keysArr } },
            { "servicePricing.serviceKey": { $in: keysArr } },
            { "servicePricing.subcategoryKey": { $in: keysArr } },
            { "servicePricing.categoryKey": { $in: keysArr } },
          );
        }
        query.$or = orClauses;
      }
    }

    // When filtering by schedule, fetch more results and filter in-memory
    const hasScheduleFilter = filters?.scheduledDate && filters?.scheduledSlot;
    const fetchLimit = hasScheduleFilter ? limit * 5 : limit;
    const fetchSkip = hasScheduleFilter ? 0 : skip;

    // Profile-completeness score. Computed at query time so it always
    // reflects the latest user doc - no migration, no sync job, no stale
    // cache. Each signal contributes a fixed weight; total caps at ~110
    // for a fully-loaded profile. Weights were chosen by visual impact on
    // the listing card: a portfolio of photos changes a card the most,
    // an avatar is the next-biggest visual upgrade, then bio/services.
    //
    //   embedded portfolio present      30 pts
    //   bonus per portfolio entry      +5 pts (capped +20)
    //   linked /portfolios entries     +5 pts per item (capped +20)
    //   avatar set                      15 pts
    //   priced services                 15 pts
    //   bio >= 50 chars                 10 pts
    //   has any reviews                 10 pts
    //   tagline set                      5 pts
    //   has categories                   5 pts
    //   --------------------------------
    //   max                            130 pts
    //
    // Type note: Mongo aggregation expressions are deeply-nested union types
    // that class-validator / Mongoose don't fully model. `Record<string,
    // unknown>` is the strictest practical type without spelling out every
    // operator overload.
    const profileScoreExpr: Record<string, unknown> = {
      $add: [
        // 30 if portfolio array non-empty
        {
          $cond: [
            { $gt: [{ $size: { $ifNull: ["$portfolioProjects", []] } }, 0] },
            30,
            0,
          ],
        },
        // bonus for breadth: 5 per embedded project, cap 20
        {
          $min: [
            { $multiply: [{ $size: { $ifNull: ["$portfolioProjects", []] } }, 5] },
            20,
          ],
        },
        // bonus for linked /portfolios entries: 5 per item, cap 20.
        // `linkedPortfolioCount` is added by the $lookup above, so it's
        // always present (defaulting to 0) when this $addFields stage runs.
        {
          $min: [
            { $multiply: [{ $ifNull: ["$linkedPortfolioCount", 0] }, 5] },
            20,
          ],
        },
        // 15 for a real avatar (not empty string)
        {
          $cond: [
            {
              $and: [
                { $ifNull: ["$avatar", false] },
                { $ne: ["$avatar", ""] },
              ],
            },
            15,
            0,
          ],
        },
        // 15 for priced services (servicePricing array populated)
        {
          $cond: [
            { $gt: [{ $size: { $ifNull: ["$servicePricing", []] } }, 0] },
            15,
            0,
          ],
        },
        // 10 for a substantive bio
        {
          $cond: [
            { $gte: [{ $strLenCP: { $ifNull: ["$bio", ""] } }, 50] },
            10,
            0,
          ],
        },
        // 10 for any reviews
        {
          $cond: [{ $gt: [{ $ifNull: ["$totalReviews", 0] }, 0] }, 10, 0],
        },
        // 5 for a tagline
        {
          $cond: [
            {
              $and: [
                { $ifNull: ["$tagline", false] },
                { $ne: ["$tagline", ""] },
              ],
            },
            5,
            0,
          ],
        },
        // 5 for at least one category set
        {
          $cond: [
            { $gt: [{ $size: { $ifNull: ["$categories", []] } }, 0] },
            5,
            0,
          ],
        },
      ],
    };

    // Aggregation result shape: a lean `User` plus the derived score and
    // the linked-portfolio count used to compute it. We type it as
    // `User & { profileScore: number }` so downstream consumers get proper
    // field completion. The pipeline gets typed as `PipelineStage[]` so a
    // typo in any operator name fails the build.
    type ProWithScore = User & { profileScore: number };

    // We $lookup the separate `portfolioitems` collection (Homico-completed
    // jobs auto-imported by the booking flow) and include its count in the
    // score - pros whose visible cards show "filled" photos pulled from that
    // collection deserve the same score boost as pros with embedded
    // `portfolioProjects`. Otherwise the visible-vs-empty distinction we're
    // trying to surface would miss anyone whose portfolio lives only in the
    // separate collection.
    const pipeline: PipelineStage[] = [
      { $match: query },
      {
        $lookup: {
          from: "portfolioitems",
          let: { proId: "$_id" },
          pipeline: [
            { $match: { $expr: { $eq: ["$proId", "$$proId"] } } },
            { $count: "n" },
          ],
          as: "linkedPortfolio",
        },
      },
      {
        $addFields: {
          linkedPortfolioCount: {
            $ifNull: [{ $arrayElemAt: ["$linkedPortfolio.n", 0] }, 0],
          },
        },
      },
      { $addFields: { profileScore: profileScoreExpr } },
      // Boolean "this pro has at least one visible project card",
      // derived from BOTH the embedded portfolioProjects array AND
      // the linked portfolioitems collection (Homico-completed jobs).
      // Sorted by `sortObj` ahead of profileScore so pros with real
      // photos surface to the top of each premium tier.
      {
        $addFields: {
          hasVisiblePortfolio: {
            $gt: [
              {
                $add: [
                  { $size: { $ifNull: ["$portfolioProjects", []] } },
                  { $ifNull: ["$linkedPortfolioCount", 0] },
                ],
              },
              0,
            ],
          },
        },
      },
      // Normalize the premium-tier flags before sorting. New registrations
      // get an explicit `false` from the schema defaults, while pros created
      // before these fields existed carry no field at all - and Mongo's
      // descending sort places `false` ABOVE a missing field. Without this,
      // a brand-new empty profile outranked every legacy pro on the very
      // first sort key, so portfolio/score/rating were never even compared.
      // Coalescing to `false` makes both shapes compare equal and lets the
      // rest of `sortObj` do its job.
      {
        $addFields: {
          isHomicoPartner: { $ifNull: ["$isHomicoPartner", false] },
          isFeatured: { $ifNull: ["$isFeatured", false] },
          isPremium: { $ifNull: ["$isPremium", false] },
        },
      },
      // Drop the temporary lookup array - keeps the response payload tight.
      { $project: { linkedPortfolio: 0, password: 0 } },
      { $sort: sortObj },
      { $skip: fetchSkip },
      { $limit: fetchLimit },
    ];

    let total = await this.userModel.countDocuments(query).exec();
    let users = await this.userModel
      .aggregate<ProWithScore>(pipeline)
      .exec();

    // Post-query filter by schedule availability
    if (hasScheduleFilter) {
      const date = new Date(filters.scheduledDate + "T00:00:00");
      // JavaScript getDay: 0=Sun..6=Sat → convert to 0=Mon..6=Sun
      const jsDay = date.getDay();
      const dayOfWeek = jsDay === 0 ? 6 : jsDay - 1;

      const slotParts = filters.scheduledSlot.split("-");
      const slotStart = parseInt(slotParts[0].split(":")[0], 10);
      const slotEnd = parseInt(slotParts[1].split(":")[0], 10);

      users = users.filter((pro) => {
        // Check date override first
        const overrides = pro.scheduleOverrides || [];
        const override = overrides.find(
          (o) => o.date === filters.scheduledDate,
        );
        if (override) {
          if (override.isBlocked) return false;
          if (override.startHour != null && override.endHour != null) {
            return (
              override.startHour <= slotStart && override.endHour >= slotEnd
            );
          }
        }

        // Check weekly schedule
        const schedule = pro.weeklySchedule || [];
        if (schedule.length === 0) return true; // No schedule = available for all

        const dayEntry = schedule.find((s) => s.dayOfWeek === dayOfWeek);
        if (!dayEntry) return true; // No entry for this day = available
        if (!dayEntry.isAvailable) return false;
        return dayEntry.startHour <= slotStart && dayEntry.endHour >= slotEnd;
      });

      total = users.length;
      users = users.slice(skip, skip + limit);
    }

    // Get portfolio counts + preview images from PortfolioItem collection
    const userIds = users.map((u) => u._id);
    const [portfolioCounts, portfolioPreviews] = await Promise.all([
      this.portfolioItemModel.aggregate([
        { $match: { proId: { $in: userIds } } },
        { $group: { _id: "$proId", count: { $sum: 1 } } },
      ]),
      // Fetch up to 6 portfolio items per pro for preview media
      this.portfolioItemModel.aggregate([
        { $match: { proId: { $in: userIds }, status: 'completed' } },
        { $sort: { createdAt: -1 } },
        { $group: {
          _id: "$proId",
          items: { $push: { images: "$images", videos: "$videos", beforeAfter: "$beforeAfter" } },
        }},
        { $project: { items: { $slice: ["$items", 6] } } },
      ]),
    ]);

    const portfolioCountMap = new Map<string, number>();
    portfolioCounts.forEach((item) => {
      portfolioCountMap.set(item._id.toString(), item.count);
    });

    // Build preview media map: proId -> { images, videos, beforeAfterPairs }
    const previewMap = new Map<string, {
      images: string[];
      videos: string[];
      beforeAfterPairs: { before: string; after: string }[];
    }>();
    portfolioPreviews.forEach((entry) => {
      const images: string[] = [];
      const videos: string[] = [];
      const beforeAfterPairs: { before: string; after: string }[] = [];
      for (const item of entry.items) {
        for (const img of (item.images || [])) {
          if (images.length < 10) images.push(img);
        }
        for (const vid of (item.videos || [])) {
          if (videos.length < 3) videos.push(vid);
        }
        for (const ba of (item.beforeAfter || [])) {
          if (beforeAfterPairs.length < 3) {
            beforeAfterPairs.push({ before: ba.before, after: ba.after });
          }
        }
      }
      previewMap.set(entry._id.toString(), { images, videos, beforeAfterPairs });
    });

    // Add portfolioItemCount and preview media to each user.
    //
    // We switched from `.find()` to `.aggregate()` upstream, which returns
    // plain JS objects rather than Mongoose Documents - so `user.toObject()`
    // (a Document-only method) doesn't exist on aggregation results. Use a
    // shallow spread instead; the downstream code already treats `userObj`
    // dynamically (it mutates dynamic preview fields on it), matching the
    // pre-existing `as any` shape.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = users.map((user) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const userObj = { ...user } as any;
      const portfolioItemCount =
        portfolioCountMap.get(user._id.toString()) || 0;
      const embeddedCount = userObj.portfolioProjects?.length || 0;
      userObj.portfolioItemCount = Math.max(portfolioItemCount, embeddedCount);
      // Merge preview media: prefer PortfolioItem collection, fall back to embedded
      const collectionPreview = previewMap.get(user._id.toString());
      if (collectionPreview && (collectionPreview.images.length > 0 || collectionPreview.beforeAfterPairs.length > 0)) {
        userObj.portfolioPreviewImages = collectionPreview.images;
        userObj.portfolioPreviewVideos = collectionPreview.videos;
        userObj.portfolioPreviewBeforeAfter = collectionPreview.beforeAfterPairs;
      } else {
        // Fallback: extract from embedded portfolioProjects
        const embeddedImages: string[] = [];
        const embeddedBA: { before: string; after: string }[] = [];
        for (const proj of (userObj.portfolioProjects || [])) {
          for (const img of (proj.images || [])) {
            embeddedImages.push(img);
          }
          for (const ba of (proj.beforeAfterPairs || proj.beforeAfter || [])) {
            if (embeddedBA.length < 3) {
              embeddedBA.push({ before: ba.before || ba.beforeImage, after: ba.after || ba.afterImage });
            }
          }
        }
        userObj.portfolioPreviewImages = embeddedImages.slice(0, 10);
        userObj.portfolioPreviewVideos = [];
        userObj.portfolioPreviewBeforeAfter = embeddedBA;
      }
      return userObj;
    });

    const totalPages = Math.ceil(total / limit);

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasMore: page < totalPages,
      },
    };
  }

  async findProById(id: string, ip?: string): Promise<User> {
    const { Types } = require("mongoose");

    // Check if id is a numeric UID (6-digit number starting with 1)
    const isOnlyDigits = /^\d+$/.test(id);
    const numericId = parseInt(id, 10);
    const isNumericUid =
      isOnlyDigits &&
      !isNaN(numericId) &&
      numericId >= 100001 &&
      numericId <= 999999;

    let user: User | null = null;

    if (isNumericUid) {
      user = await this.userModel
        .findOne({ uid: numericId, role: "pro" })
        .select("-password")
        .exec();
    } else if (Types.ObjectId.isValid(id)) {
      user = await this.userModel
        .findOne({ _id: id, role: "pro" })
        .select("-password")
        .exec();
    }

    // Backward compatibility / data recovery:
    // Some legacy users may have pro fields filled but role not updated to "pro".
    // Treat as pro if they have meaningful pro data.
    if (!user) {
      if (isNumericUid) {
        user = await this.userModel
          .findOne({ uid: numericId })
          .select("-password")
          .exec();
      } else if (Types.ObjectId.isValid(id)) {
        user = await this.userModel
          .findOne({ _id: id })
          .select("-password")
          .exec();
      }

      const looksLikePro =
        !!user &&
        (user.role === "pro" ||
          (Array.isArray((user as any).categories) &&
            (user as any).categories.length > 0) ||
          (Array.isArray((user as any).selectedCategories) &&
            (user as any).selectedCategories.length > 0));

      if (!looksLikePro) {
        user = null;
      }
    }

    if (!user) {
      throw new NotFoundException("Pro profile not found");
    }

    // Best-effort views increment: never block profile reads on write errors.
    // When an IP is provided (public profile reads), dedupe by IP (24h TTL) so
    // a refresh doesn't re-count. Without an IP (internal callers), fall back to
    // the legacy unconditional increment.
    if (ip) {
      this.trackProfileView(user._id, ip).catch(() => {});
    } else {
      this.userModel
        .updateOne({ _id: user._id }, { $inc: { profileViewCount: 1 } })
        .exec()
        .catch(() => {});
    }

    // Read-time guard: never present an expired premium as active. The hourly
    // cron flips the stored flag, but this makes the profile correct the moment
    // it lapses. In-memory only - not persisted (the cron owns the write).
    if (
      user.isPremium &&
      user.premiumExpiresAt &&
      new Date(user.premiumExpiresAt) < new Date()
    ) {
      user.isPremium = false;
      user.premiumTier = "none";
    }

    return user;
  }

  // Dedupe profile views by IP within a 24h window (the ProfileView unique
  // index + TTL handle both), so a page refresh from the same IP never inflates
  // profileViewCount. Mirrors the upsert/$setOnInsert dedup used in analytics.
  private async trackProfileView(proId: any, ip: string): Promise<void> {
    const result = await this.profileViewModel
      .updateOne(
        { proId, ip, type: ProfileViewType.PROFILE },
        { $setOnInsert: { viewedAt: new Date() } },
        { upsert: true },
      )
      .exec()
      .catch(() => null);

    if (result && (result.upsertedCount ?? 0) > 0) {
      await this.userModel
        .updateOne({ _id: proId }, { $inc: { profileViewCount: 1 } })
        .exec()
        .catch(() => {});
    }
  }

  // Count how many unique visitors revealed a pro's phone number. Deduped by IP
  // within a 24h window (the ProfileView unique index + TTL handle both), so a
  // page refresh from the same IP never inflates the count.
  async trackPhoneView(proId: string, ip: string): Promise<number> {
    const { Types } = require("mongoose");
    if (!Types.ObjectId.isValid(proId)) return 0;

    // Upsert the dedup row; only a genuinely new (IP, pro) row reports an
    // upsertedCount > 0. Refreshes match the existing row and are no-ops.
    const result = await this.profileViewModel
      .updateOne(
        { proId, ip, type: ProfileViewType.PHONE },
        { $setOnInsert: { viewedAt: new Date() } },
        { upsert: true },
      )
      .exec()
      .catch(() => null);

    if (result && (result.upsertedCount ?? 0) > 0) {
      await this.userModel
        .updateOne({ _id: proId }, { $inc: { phoneViewCount: 1 } })
        .exec()
        .catch(() => {});
    }

    // Return the current count so the client can reflect it immediately.
    const pro = await this.userModel
      .findById(proId)
      .select("phoneViewCount")
      .exec()
      .catch(() => null);
    return pro?.phoneViewCount ?? 0;
  }

  async updateRating(
    userId: string,
    newRating: number,
    weight: number = 1,
  ): Promise<void> {
    const user = await this.findById(userId);
    const currentTotalReviews = user.totalReviews || 0;
    const currentRating = user.avgRating || 0;

    // Weight affects how much this review contributes to the average
    // weight=1 for Homico reviews, weight=0.7 for external reviews
    const weightedNewRating = newRating * weight;
    const totalWeight = currentTotalReviews + weight;

    const avgRating =
      totalWeight > 0
        ? (currentRating * currentTotalReviews + weightedNewRating) /
          totalWeight
        : newRating;

    await this.userModel.findByIdAndUpdate(userId, {
      avgRating,
      totalReviews: currentTotalReviews + 1,
    });
  }

  async updateProProfile(userId: string, proData: any): Promise<User> {
    const user = await this.findById(userId);

    // Allow admins to set pro fields on any account (including their own).
    // The admin update-by-id endpoint already routes through here; this
    // additionally lets an admin run their own /pro/profile-setup flow.
    if (user.role !== "pro" && user.role !== "admin") {
      throw new BadRequestException(
        "Only pro users can update their pro profile",
      );
    }

    // Update the pro-specific fields on the user document
    const updateData: any = {};
    const unsetData: Record<string, any> = {};

    // Pro profile fields
    if (proData.firstName !== undefined)
      updateData.firstName = proData.firstName;
    if (proData.lastName !== undefined) updateData.lastName = proData.lastName;
    // Recompose `name` when either first/last is provided (keeps legacy
    // single-field display paths working without touching them).
    if (
      proData.firstName !== undefined ||
      proData.lastName !== undefined
    ) {
      const first =
        proData.firstName !== undefined ? proData.firstName : user.firstName;
      const last =
        proData.lastName !== undefined ? proData.lastName : user.lastName;
      const composed = [first, last].filter(Boolean).join(" ").trim();
      if (composed) updateData.name = composed;
    }
    if (proData.title !== undefined) updateData.title = proData.title;
    if (proData.bio !== undefined) updateData.bio = proData.bio;
    if (proData.description !== undefined)
      updateData.description = proData.description;
    if (proData.categories !== undefined) {
      updateData.categories = proData.categories;
      // Also update selectedCategories for consistency
      updateData.selectedCategories = proData.categories;
    }
    if (proData.subcategories !== undefined) {
      updateData.subcategories = proData.subcategories;
      // Also update selectedSubcategories for consistency
      updateData.selectedSubcategories = proData.subcategories;
    }
    if (proData.selectedServices !== undefined) {
      updateData.selectedServices = proData.selectedServices;
      // Also derive subcategories and selectedSubcategories from selectedServices for backwards compatibility
      const subcategoryKeys = proData.selectedServices.map((s) => s.key);
      if (subcategoryKeys.length > 0) {
        updateData.subcategories = subcategoryKeys;
        updateData.selectedSubcategories = subcategoryKeys;
      }
      // Derive max yearsExperience from selectedServices
      const experienceToYears: Record<string, number> = {
        "0-1": 1,
        "1-3": 3,
        "3-5": 5,
        "5-10": 10,
        "10+": 15,
      };
      const maxExperience = Math.max(
        ...proData.selectedServices.map(
          (s) => experienceToYears[s.experience] || 0,
        ),
        0,
      );
      if (maxExperience > 0) {
        updateData.yearsExperience = maxExperience;
      }
    }
    if (proData.yearsExperience !== undefined)
      updateData.yearsExperience = proData.yearsExperience;
    if (proData.avatar !== undefined) updateData.avatar = proData.avatar;
    // Pricing model: allow fixed | range | byAgreement | per_sqm (normalize legacy values)
    if (proData.pricingModel !== undefined) {
      const incoming = proData.pricingModel;
      const base = proData.basePrice;
      const max = proData.maxPrice;

      const hasBase =
        typeof base === "number"
          ? base > 0
          : base !== null && base !== undefined && Number(base) > 0;
      const hasMax =
        typeof max === "number"
          ? max > 0
          : max !== null && max !== undefined && Number(max) > 0;

      let normalized: "fixed" | "range" | "byAgreement" | "per_sqm" =
        "byAgreement";
      if (incoming === "byAgreement" || incoming === "hourly") {
        normalized = "byAgreement";
      } else if (incoming === "per_sqm" || incoming === "sqm") {
        normalized = hasBase || hasMax ? "per_sqm" : "byAgreement";
      } else if (incoming === "range") {
        normalized =
          hasBase && hasMax
            ? "range"
            : hasBase || hasMax
              ? "fixed"
              : "byAgreement";
      } else if (incoming === "fixed") {
        normalized = hasBase || hasMax ? "fixed" : "byAgreement";
      } else {
        // Legacy or unknown: infer from numbers
        if (hasBase && hasMax && Number(max) !== Number(base))
          normalized = "range";
        else if (hasBase || hasMax) normalized = "fixed";
        else normalized = "byAgreement";
      }

      updateData.pricingModel = normalized;

      // If by agreement, force-clear any prices
      if (normalized === "byAgreement") {
        unsetData.basePrice = "";
        unsetData.maxPrice = "";
      }

      // If fixed, ensure old range maxPrice doesn't linger (otherwise UI will still show range)
      if (normalized === "fixed") {
        // If client didn't explicitly set a maxPrice, unset it.
        // If they did set it, collapse it to basePrice to keep "fixed" semantics.
        if (proData.maxPrice === undefined || proData.maxPrice === null) {
          unsetData.maxPrice = "";
        } else if (hasBase) {
          updateData.maxPrice = Number(base);
        }
      }

      // If per_sqm, ensure maxPrice doesn't linger
      if (normalized === "per_sqm") {
        unsetData.maxPrice = "";
        delete updateData.maxPrice;
      }
    }

    // Per-service pricing - when present, derive basePrice/maxPrice from it
    if (proData.servicePricing !== undefined && proData.servicePricing.length > 0) {
      // Server-side defense: class-validator can't easily enforce
      // `priceMin <= priceMax` across two sibling fields, so do it here.
      // Frontend already gates this with the inverted-range Save button
      // block, but any non-browser client (curl, mobile SDK, future API
      // consumer) could otherwise persist a `priceMin: 500, priceMax: 200`
      // entry that breaks every downstream price filter and display.
      const inverted = (proData.servicePricing as any[]).find((sp) => {
        const lo = typeof sp.priceMin === 'number' ? sp.priceMin : null;
        const hi = typeof sp.priceMax === 'number' ? sp.priceMax : null;
        return lo !== null && hi !== null && lo > 0 && hi > 0 && lo > hi;
      });
      if (inverted) {
        throw new BadRequestException(
          `Invalid price range on service "${inverted.serviceKey || 'unknown'}": priceMin (${inverted.priceMin}) cannot exceed priceMax (${inverted.priceMax}).`,
        );
      }

      // Replace entire servicePricing array - old entries are removed
      updateData.servicePricing = proData.servicePricing;

      const activePrices = proData.servicePricing
        .filter((sp: any) => sp.isActive && typeof sp.price === 'number' && sp.price > 0)
        .map((sp: any) => sp.price);

      if (activePrices.length > 0) {
        const minPrice = Math.min(...activePrices);
        const maxPrice = Math.max(...activePrices);
        updateData.basePrice = minPrice;
        updateData.maxPrice = maxPrice;
        updateData.pricingModel = minPrice !== maxPrice ? 'range' : 'fixed';
      } else {
        updateData.basePrice = 0;
        updateData.maxPrice = 0;
        updateData.pricingModel = 'byAgreement';
      }
    } else {
      // Legacy pricing: allow explicit unsetting when client sends null
      if (proData.basePrice === null) unsetData.basePrice = "";
      else if (proData.basePrice !== undefined)
        updateData.basePrice = proData.basePrice;

      if (proData.maxPrice === null) unsetData.maxPrice = "";
      else if (proData.maxPrice !== undefined)
        updateData.maxPrice = proData.maxPrice;
    }

    if (proData.serviceAreas !== undefined)
      updateData.serviceAreas = proData.serviceAreas;
    if (proData.portfolioProjects !== undefined)
      updateData.portfolioProjects = proData.portfolioProjects;
    if (proData.pinterestLinks !== undefined)
      updateData.pinterestLinks = proData.pinterestLinks;
    if (proData.architectLicenseNumber !== undefined)
      updateData.architectLicenseNumber = proData.architectLicenseNumber;
    if (proData.cadastralId !== undefined)
      updateData.cadastralId = proData.cadastralId;
    if (proData.availability !== undefined)
      updateData.availability = proData.availability;
    if (proData.isAvailable !== undefined)
      updateData.isAvailable = proData.isAvailable;
    if (proData.profileType !== undefined)
      updateData.profileType = proData.profileType;
    if (proData.customServices !== undefined)
      updateData.customServices = proData.customServices;

    // Social links
    if (proData.whatsapp !== undefined) updateData.whatsapp = proData.whatsapp;
    if (proData.telegram !== undefined) updateData.telegram = proData.telegram;
    if (proData.instagramUrl !== undefined)
      updateData.instagramUrl = proData.instagramUrl;
    if (proData.facebookUrl !== undefined)
      updateData.facebookUrl = proData.facebookUrl;
    if (proData.linkedinUrl !== undefined)
      updateData.linkedinUrl = proData.linkedinUrl;
    if (proData.websiteUrl !== undefined)
      updateData.websiteUrl = proData.websiteUrl;

    // Check if profile has required fields to be considered complete
    // Required: bio/description, categories, serviceAreas
    const hasRequiredFields =
      (proData.bio || proData.description || user.bio || user.description) &&
      ((proData.categories && proData.categories.length > 0) ||
        (user.categories && user.categories.length > 0)) &&
      ((proData.serviceAreas && proData.serviceAreas.length > 0) ||
        (user.serviceAreas && user.serviceAreas.length > 0));

    if (hasRequiredFields) {
      updateData.isProfileCompleted = true;
    }

    const mongoUpdate: any = {};
    if (Object.keys(updateData).length > 0) mongoUpdate.$set = updateData;
    if (Object.keys(unsetData).length > 0) mongoUpdate.$unset = unsetData;

    const updatedUser = await this.userModel
      .findByIdAndUpdate(userId, mongoUpdate, { new: true })
      .select("-password")
      .exec();

    if (!updatedUser) {
      throw new NotFoundException("User not found");
    }

    // Log profile update
    this.logger.logActivity({
      type: ActivityType.PROFILE_UPDATE,
      userId: updatedUser._id.toString(),
      userEmail: updatedUser.email,
      userName: updatedUser.name,
      details: {
        updatedFields: Object.keys(updateData),
        unsetFields: Object.keys(unsetData),
        before: (() => {
          const fields = Array.from(
            new Set([
              ...Object.keys(updateData || {}),
              ...Object.keys(unsetData || {}),
            ]),
          );
          const snapshot: Record<string, any> = {};
          for (const field of fields) snapshot[field] = (user as any)?.[field];
          return snapshot;
        })(),
        after: (() => {
          const fields = Array.from(
            new Set([
              ...Object.keys(updateData || {}),
              ...Object.keys(unsetData || {}),
            ]),
          );
          const snapshot: Record<string, any> = {};
          for (const field of fields)
            snapshot[field] = (updatedUser as any)?.[field];
          return snapshot;
        })(),
        changes: (() => {
          const fields = Array.from(
            new Set([
              ...Object.keys(updateData || {}),
              ...Object.keys(unsetData || {}),
            ]),
          );
          const diffs: Array<{ field: string; from: any; to: any }> = [];
          for (const field of fields) {
            const fromVal = (user as any)?.[field];
            const toVal = (updatedUser as any)?.[field];
            const same = JSON.stringify(fromVal) === JSON.stringify(toVal);
            if (!same) diffs.push({ field, from: fromVal, to: toVal });
          }
          return diffs;
        })(),
      },
    });

    return updatedUser;
  }

  async deleteAccount(userId: string): Promise<void> {
    const user = await this.userModel.findById(userId).exec();

    if (!user) {
      throw new NotFoundException("User not found");
    }

    // Log the deletion BEFORE actually deleting (capture full user data)
    this.logger.logUserDeletion(user);

    // Delete all related data in parallel for better performance
    await Promise.all([
      // Delete jobs created by this user (as client)
      this.jobModel.deleteMany({ clientId: userId }).exec(),

      // Delete proposals made by this user (as pro)
      this.proposalModel.deleteMany({ proId: userId }).exec(),

      // Delete saved jobs
      this.savedJobModel.deleteMany({ userId: userId }).exec(),

      // Delete conversations where user is participant (as client or pro)
      this.conversationModel
        .deleteMany({
          $or: [{ clientId: userId }, { proId: userId }],
        })
        .exec(),

      // Delete messages sent by this user
      this.messageModel.deleteMany({ senderId: userId }).exec(),

      // Delete all notifications for this user
      this.notificationModel.deleteMany({ userId: userId }).exec(),

      // Delete reviews (both given and received)
      this.reviewModel
        .deleteMany({
          $or: [{ clientId: userId }, { proId: userId }],
        })
        .exec(),

      // Delete likes by this user
      this.likeModel.deleteMany({ userId: userId }).exec(),

      // Delete portfolio items (for pro users)
      this.portfolioItemModel.deleteMany({ proId: userId }).exec(),

      // Delete project requests (as client or assigned pro)
      this.projectRequestModel
        .deleteMany({
          $or: [{ clientId: userId }, { proId: userId }],
        })
        .exec(),

      // Delete offers made by this user (as pro)
      this.offerModel.deleteMany({ proId: userId }).exec(),

      // Delete support tickets
      this.supportTicketModel.deleteMany({ userId: userId }).exec(),
    ]);

    // Finally, delete the user document
    await this.userModel.findByIdAndDelete(userId).exec();

    this.logger.log(
      `User account deleted successfully: ${user.email}`,
      "UsersService",
    );
  }

  // ============== PRO PROFILE DEACTIVATION ==============

  async deactivateProProfile(
    userId: string,
    deactivateUntil?: Date,
    reason?: string,
  ): Promise<User> {
    const user = await this.userModel.findById(userId).exec();

    if (!user) {
      throw new NotFoundException("User not found");
    }

    if (user.role !== "pro" && user.role !== "admin") {
      throw new BadRequestException(
        "Only pro users can deactivate their profile",
      );
    }

    if (user.isProfileDeactivated) {
      throw new ConflictException("Profile is already deactivated");
    }

    const updateData: any = {
      isProfileDeactivated: true,
      deactivatedAt: new Date(),
      isAvailable: false,
    };

    if (deactivateUntil) {
      updateData.deactivatedUntil = deactivateUntil;
    }

    if (reason) {
      updateData.deactivationReason = reason;
    }

    const updatedUser = await this.userModel
      .findByIdAndUpdate(userId, { $set: updateData }, { new: true })
      .select("-password")
      .exec();

    // Log profile deactivation
    this.logger.logActivity({
      type: ActivityType.PROFILE_DEACTIVATE,
      userId: updatedUser._id.toString(),
      userEmail: updatedUser.email,
      userName: updatedUser.name,
      details: {
        deactivateUntil,
        reason,
      },
    });

    return updatedUser;
  }

  async reactivateProProfile(userId: string): Promise<User> {
    const user = await this.userModel.findById(userId).exec();

    if (!user) {
      throw new NotFoundException("User not found");
    }

    if (user.role !== "pro" && user.role !== "admin") {
      throw new BadRequestException(
        "Only pro users can reactivate their profile",
      );
    }

    if (!user.isProfileDeactivated) {
      throw new ConflictException("Profile is not deactivated");
    }

    const updatedUser = await this.userModel
      .findByIdAndUpdate(
        userId,
        {
          $set: {
            isProfileDeactivated: false,
            isAvailable: true,
          },
          $unset: {
            deactivatedAt: 1,
            deactivatedUntil: 1,
            deactivationReason: 1,
          },
        },
        { new: true },
      )
      .select("-password")
      .exec();

    // Log profile reactivation
    this.logger.logActivity({
      type: ActivityType.PROFILE_REACTIVATE,
      userId: updatedUser._id.toString(),
      userEmail: updatedUser.email,
      userName: updatedUser.name,
    });

    return updatedUser;
  }

  /**
   * Update a pro's availability status. Surfaces the existing
   * `ProStatus` enum (active / busy / away) which has lived in the
   * schema but had no API surface until the SLA accountability work
   * landed. `away` is the SLA-exempt signal - the cron skips pros
   * whose status === 'away' so they're not penalised for being
   * deliberately offline (vacation, illness, busy day).
   *
   * Different from the existing `deactivateProProfile` flow: `away`
   * keeps the pro visible in browse with an Away pill; deactivation
   * hides them entirely.
   */
  async updateStatus(
    userId: string,
    status: "active" | "busy" | "away",
  ): Promise<User> {
    const user = await this.userModel.findById(userId).exec();
    if (!user) {
      throw new NotFoundException("User not found");
    }
    if (user.role !== "pro" && user.role !== "admin") {
      throw new BadRequestException("Only pros can update availability status");
    }
    const updated = await this.userModel
      .findByIdAndUpdate(
        userId,
        { $set: { status, statusUpdatedAt: new Date() } },
        { new: true },
      )
      .select("-password")
      .exec();
    return updated;
  }

  async getDeactivationStatus(userId: string): Promise<{
    isDeactivated: boolean;
    deactivatedAt?: Date;
    deactivatedUntil?: Date;
    reason?: string;
  }> {
    const user = await this.userModel.findById(userId).exec();

    if (!user) {
      throw new NotFoundException("User not found");
    }

    return {
      isDeactivated: user.isProfileDeactivated || false,
      deactivatedAt: user.deactivatedAt,
      deactivatedUntil: user.deactivatedUntil,
      reason: user.deactivationReason,
    };
  }

  // ============== NOTIFICATION PREFERENCES ==============

  async getNotificationPreferences(userId: string) {
    const user = await this.userModel.findById(userId).exec();

    if (!user) {
      throw new NotFoundException("User not found");
    }

    // Default preferences if not set
    const defaultPreferences = {
      email: {
        enabled: true,
        newJobs: true,
        proposals: true,
        messages: true,
        marketing: false,
      },
      push: {
        enabled: true,
        newJobs: true,
        proposals: true,
        messages: true,
      },
      sms: {
        enabled: false,
        proposals: false,
        messages: false,
      },
    };

    return {
      email: user.email || null,
      isEmailVerified: user.isEmailVerified || false,
      phone: user.phone || null,
      isPhoneVerified: user.isPhoneVerified || false,
      preferences: user.notificationPreferences || defaultPreferences,
    };
  }

  async updateNotificationPreferences(userId: string, preferences: any) {
    const user = await this.userModel.findById(userId).exec();

    if (!user) {
      throw new NotFoundException("User not found");
    }

    // Merge with existing preferences
    const currentPrefs = user.notificationPreferences || {
      email: {
        enabled: true,
        newJobs: true,
        proposals: true,
        messages: true,
        marketing: false,
      },
      push: { enabled: true, newJobs: true, proposals: true, messages: true },
      sms: { enabled: false, proposals: false, messages: false },
    };

    const updatedPrefs = {
      email: { ...currentPrefs.email, ...(preferences.email || {}) },
      push: { ...currentPrefs.push, ...(preferences.push || {}) },
      sms: { ...currentPrefs.sms, ...(preferences.sms || {}) },
    };

    await this.userModel
      .findByIdAndUpdate(userId, {
        notificationPreferences: updatedPrefs,
      })
      .exec();

    return {
      email: user.email || null,
      isEmailVerified: user.isEmailVerified || false,
      phone: user.phone || null,
      isPhoneVerified: user.isPhoneVerified || false,
      preferences: updatedPrefs,
    };
  }
}
