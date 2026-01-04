import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import * as bcrypt from "bcrypt";
import { Model } from "mongoose";
import { v4 as uuidv4 } from "uuid";
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
import { PaymentMethod, User } from "./schemas/user.schema";
import { LoggerService, ActivityType } from "../common/logger";

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
    private readonly logger: LoggerService,
  ) {}

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
          "User with this phone number already exists"
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
      // Set phoneVerifiedAt if phone was verified during registration
      ...(createUserDto.isPhoneVerified && { phoneVerifiedAt: new Date() }),
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
        })
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

  async findByGoogleId(googleId: string): Promise<User | null> {
    return this.userModel.findOne({ googleId }).exec();
  }

  async createGoogleUser(data: {
    googleId: string;
    email: string;
    name: string;
    phone: string;
    password?: string;
    avatar?: string;
    role?: string;
    city?: string;
    selectedCategories?: string[];
    selectedSubcategories?: string[];
    customServices?: string[];
    portfolioProjects?: Array<{
      title: string;
      description?: string;
      images: string[];
    }>;
    isPhoneVerified?: boolean;
  }): Promise<User> {
    // Check if user with same email or phone already exists
    if (data.email) {
      const existingByEmail = await this.userModel.findOne({
        email: data.email,
      });
      if (existingByEmail) {
        throw new ConflictException("User with this email already exists");
      }
    }

    if (data.phone) {
      const existingByPhone = await this.userModel.findOne({
        phone: data.phone,
      });
      if (existingByPhone) {
        throw new ConflictException(
          "User with this phone number already exists"
        );
      }
    }

    // Check if googleId already exists
    const existingByGoogleId = await this.userModel.findOne({
      googleId: data.googleId,
    });
    if (existingByGoogleId) {
      throw new ConflictException(
        "User with this Google account already exists"
      );
    }

    const uid = await this.generateNextUid();

    // Hash password if provided
    const hashedPassword = data.password
      ? await bcrypt.hash(data.password, 10)
      : undefined;

    const user = new this.userModel({
      uid,
      googleId: data.googleId,
      email: data.email,
      name: data.name,
      phone: data.phone,
      password: hashedPassword,
      avatar: data.avatar,
      role: data.role || "client",
      city: data.city,
      selectedCategories: data.selectedCategories || [],
      selectedSubcategories: data.selectedSubcategories || [],
      customServices: data.customServices || [],
      portfolioProjects: data.portfolioProjects || [],
      isPhoneVerified: data.isPhoneVerified || false,
      phoneVerifiedAt: data.isPhoneVerified ? new Date() : undefined,
      isEmailVerified: true, // Google emails are verified
      emailVerifiedAt: new Date(),
    });

    const savedUser = await user.save();

    // Create portfolio items in the portfolio collection if provided
    if (data.portfolioProjects && data.portfolioProjects.length > 0) {
      const portfolioItems = data.portfolioProjects.map((project, index) => ({
        proId: savedUser._id,
        title: project.title || `Project ${index + 1}`,
        description: project.description || "",
        imageUrl: project.images[0] || "",
        images: project.images || [],
        source: "external",
        status: "completed",
        projectType: "project",
        displayOrder: index,
      }));

      await this.portfolioItemModel.insertMany(portfolioItems);
    }

    return savedUser;
  }

  async findById(id: string): Promise<User> {
    const user = await this.userModel.findById(id).exec();

    if (!user) {
      throw new NotFoundException("User not found");
    }

    return user;
  }

  async validatePassword(
    password: string,
    hashedPassword: string
  ): Promise<boolean> {
    return bcrypt.compare(password, hashedPassword);
  }

  async updateLastLogin(userId: string): Promise<void> {
    await this.userModel.findByIdAndUpdate(userId, {
      lastLoginAt: new Date(),
    });
  }

  async updateGoogleId(userId: string, googleId: string): Promise<void> {
    await this.userModel.findByIdAndUpdate(userId, { googleId });
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
    { email: string; role: string; name: string }[]
  > {
    const users = await this.userModel
      .find({
        email: { $regex: /@demo\.com$/ },
      })
      .select("email role name")
      .sort({ role: 1, email: 1 })
      .exec();

    return users.map((u) => ({
      email: u.email,
      role: u.role,
      name: u.name,
    }));
  }

  async checkExists(
    field: "email" | "phone",
    value: string
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
    selectedCategories: string[]
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
        "Only clients can upgrade to professional status"
      );
    }

    const updatedUser = await this.userModel
      .findByIdAndUpdate(
        userId,
        {
          role: "pro",
          selectedCategories,
        },
        { new: true }
      )
      .exec();

    // Log upgrade to pro
    this.logger.logActivity({
      type: ActivityType.USER_UPGRADE_TO_PRO,
      userId: updatedUser._id.toString(),
      userEmail: updatedUser.email,
      userName: updatedUser.name,
      details: {
        selectedCategories,
      },
    });

    return updatedUser;
  }

  async setPendingEmail(
    userId: string,
    email: string
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

    return { success: true, message: "Pending email set. Please verify with OTP." };
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
        { new: true }
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
    setAsDefault: boolean = false
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
    setAsDefault: boolean = false
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
    paymentMethodId: string
  ): Promise<void> {
    const user = await this.userModel.findById(userId).exec();
    if (!user) {
      throw new NotFoundException("User not found");
    }

    const methodIndex = user.paymentMethods?.findIndex(
      (pm) => pm.id === paymentMethodId
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
    paymentMethodId: string
  ): Promise<PaymentMethod> {
    const user = await this.userModel.findById(userId).exec();
    if (!user) {
      throw new NotFoundException("User not found");
    }

    const methodIndex = user.paymentMethods?.findIndex(
      (pm) => pm.id === paymentMethodId
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

  // Location data with Georgian translations
  private readonly LOCATIONS_DATA = {
    Georgia: {
      nationwide: { en: "Countrywide", ka: "საქართველოს მასშტაბით" },
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
  };

  getLocations(country?: string, locale?: string) {
    const targetCountry = country || "Georgia";
    const isGeorgian = locale === "ka";

    type RegionData = { en: string; cities: string[]; citiesEn: string[] };

    const buildCityMapping = (regions: Record<string, RegionData>): Record<string, string> => {
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
      const cityMapping = buildCityMapping(data.regions as Record<string, RegionData>);

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
      defaultData.regions
    ) as [string, RegionData][]) {
      const regionName = isGeorgian ? regionKa : regionData.en;
      const cities = isGeorgian ? regionData.cities : regionData.citiesEn;
      regions[regionName] = cities;
    }

    // Build city mapping for translating saved serviceAreas
    const cityMapping = buildCityMapping(defaultData.regions as Record<string, RegionData>);

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

  async findAllPros(filters?: {
    category?: string;
    subcategory?: string;
    serviceArea?: string;
    minRating?: number;
    minPrice?: number;
    maxPrice?: number;
    search?: string;
    sort?: string;
    page?: number;
    limit?: number;
    companyIds?: string[];
    excludeUserId?: string;
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

    // Build sort object - always sort premium first
    let sortObj: any = {};
    switch (filters?.sort) {
      case "rating":
        sortObj = { isPremium: -1, avgRating: -1 };
        break;
      case "reviews":
        sortObj = { isPremium: -1, totalReviews: -1 };
        break;
      case "price-low":
        sortObj = { isPremium: -1, basePrice: 1 };
        break;
      case "price-high":
        sortObj = { isPremium: -1, basePrice: -1 };
        break;
      case "newest":
        sortObj = { isPremium: -1, createdAt: -1 };
        break;
      default: // 'recommended'
        sortObj = { isPremium: -1, avgRating: -1, totalReviews: -1 };
    }

    // Build query - only role=pro
    // Include pros where isAvailable is true OR not set (for backwards compatibility)
    // Exclude deactivated profiles
    // Only show pros with completed profiles
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
      ],
    };

    // Exclude current user from results
    if (filters?.excludeUserId) {
      const { Types } = require("mongoose");
      query._id = { $ne: new Types.ObjectId(filters.excludeUserId) };
    }

    if (filters?.category) {
      query.categories = filters.category;
    }

    if (filters?.subcategory) {
      query.subcategories = filters.subcategory;
    }

    if (filters?.serviceArea) {
      query.serviceAreas = filters.serviceArea;
    }

    if (filters?.minRating) {
      query.avgRating = { $gte: filters.minRating };
    }

    if (filters?.minPrice !== undefined) {
      query.basePrice = { ...query.basePrice, $gte: filters.minPrice };
    }

    if (filters?.maxPrice !== undefined) {
      query.basePrice = { ...query.basePrice, $lte: filters.maxPrice };
    }

    if (filters?.companyIds && filters.companyIds.length > 0) {
      const { Types } = require("mongoose");
      query.companyId = {
        $in: filters.companyIds.map((id) => new Types.ObjectId(id)),
      };
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
        const searchRegex = new RegExp(searchTerm, "i");
        query.$or = [
          { name: searchRegex },
          { title: searchRegex },
          { tagline: searchRegex },
          { description: searchRegex },
          { categories: searchRegex },
          { subcategories: searchRegex },
          { companyName: searchRegex },
        ];
      }
    }

    const total = await this.userModel.countDocuments(query).exec();
    const data = await this.userModel
      .find(query)
      .select("-password")
      .sort(sortObj)
      .skip(skip)
      .limit(limit)
      .exec();

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

  async findProById(id: string): Promise<User> {
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

    if (!user) {
      throw new NotFoundException("Pro profile not found");
    }

    return user;
  }

  async updateRating(userId: string, newRating: number): Promise<void> {
    const user = await this.findById(userId);
    const totalReviews = (user.totalReviews || 0) + 1;
    const currentRating = user.avgRating || 0;
    const avgRating =
      (currentRating * (user.totalReviews || 0) + newRating) / totalReviews;

    await this.userModel.findByIdAndUpdate(userId, {
      avgRating,
      totalReviews,
    });
  }

  async updateProProfile(userId: string, proData: any): Promise<User> {
    const user = await this.findById(userId);

    if (user.role !== "pro") {
      throw new BadRequestException(
        "Only pro users can update their pro profile"
      );
    }

    // Update the pro-specific fields on the user document
    const updateData: any = {};

    // Pro profile fields
    if (proData.title !== undefined) updateData.title = proData.title;
    if (proData.bio !== undefined) updateData.bio = proData.bio;
    if (proData.description !== undefined)
      updateData.description = proData.description;
    if (proData.categories !== undefined)
      updateData.categories = proData.categories;
    if (proData.subcategories !== undefined)
      updateData.subcategories = proData.subcategories;
    if (proData.yearsExperience !== undefined)
      updateData.yearsExperience = proData.yearsExperience;
    if (proData.avatar !== undefined) updateData.avatar = proData.avatar;
    if (proData.pricingModel !== undefined)
      updateData.pricingModel = proData.pricingModel;
    if (proData.basePrice !== undefined)
      updateData.basePrice = proData.basePrice;
    if (proData.maxPrice !== undefined) updateData.maxPrice = proData.maxPrice;
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

    const updatedUser = await this.userModel
      .findByIdAndUpdate(userId, { $set: updateData }, { new: true })
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

    this.logger.log(`User account deleted successfully: ${user.email}`, 'UsersService');
  }

  // ============== PRO PROFILE DEACTIVATION ==============

  async deactivateProProfile(
    userId: string,
    deactivateUntil?: Date,
    reason?: string
  ): Promise<User> {
    const user = await this.userModel.findById(userId).exec();

    if (!user) {
      throw new NotFoundException("User not found");
    }

    if (user.role !== "pro") {
      throw new BadRequestException(
        "Only pro users can deactivate their profile"
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

    if (user.role !== "pro") {
      throw new BadRequestException(
        "Only pro users can reactivate their profile"
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
        { new: true }
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
