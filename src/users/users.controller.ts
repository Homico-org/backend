import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { OptionalJwtAuthGuard } from "../common/guards/optional-jwt-auth.guard";
import { ChangePasswordDto } from "./dto/change-password.dto";
import {
  AddBankPaymentMethodDto,
  AddCardPaymentMethodDto,
  SetDefaultPaymentMethodDto,
} from "./dto/payment-method.dto";
import {
  AddServiceAddressDto,
  SetDefaultAddressDto,
  UpdateServiceAddressDto,
} from "./dto/service-address.dto";
import { UpdateProfileDto } from "./dto/update-profile.dto";
import { UsersService } from "./users.service";
import { getClientIp } from "../common/utils/client-ip";
@ApiTags("Users")
@Controller("users")
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  @Get("me")
  @ApiOperation({ summary: "Get current user profile" })
  @ApiBearerAuth("JWT-auth")
  @ApiResponse({ status: 200, description: "User profile" })
  @UseGuards(JwtAuthGuard)
  async getProfile(@CurrentUser() user: any) {
    const userData = await this.usersService.findById(user.userId);
    // Derive subcategories from selectedServices if available
    let derivedSubcategories: string[] = [];
    if (userData.selectedServices?.length > 0) {
      derivedSubcategories = userData.selectedServices.map((s: any) => s.key);
    } else if (userData.selectedSubcategories?.length > 0) {
      derivedSubcategories = userData.selectedSubcategories;
    } else if (userData.subcategories?.length > 0) {
      derivedSubcategories = userData.subcategories;
    }

    // Read-time premium expiry guard: never present a lapsed subscription as
    // active (the hourly cron owns the persistent flip, this corrects the
    // moment it expires).
    const premiumActive =
      !!userData.isPremium &&
      (!userData.premiumExpiresAt ||
        new Date(userData.premiumExpiresAt) > new Date());

    return {
      id: userData._id,
      uid: userData.uid,
      name: userData.name,
      email: userData.email,
      role: userData.role,
      phone: userData.phone,
      city: userData.city,
      avatar: userData.avatar,
      accountType: userData.accountType,
      isProfileCompleted: userData.isProfileCompleted,
      selectedCategories: userData.selectedCategories || userData.categories,
      // For pro users, derive subcategories from selectedServices if available
      selectedSubcategories: derivedSubcategories,
      selectedServices: userData.selectedServices,
      serviceAddresses: userData.serviceAddresses || [],
      registrationStep: userData.registrationStep ?? 0,
      servicePricing: userData.servicePricing || [],
      isPhoneVerified: userData.isPhoneVerified,
      isEmailVerified: userData.isEmailVerified,
      // Include verification status for pro users
      ...(userData.role === "pro"
        ? {
            verificationStatus: userData.verificationStatus || "pending",
            bio: userData.bio || "",
            description: userData.description || "",
            serviceAreas: userData.serviceAreas || [],
            portfolioProjects: userData.portfolioProjects || [],
            // Availability + SLA accountability state. Powers the
            // Away toggle (settings) and the SLA status banner on
            // /my-space. `slaMisses` deliberately omitted - keep the
            // /me payload light; if a dashboard widget ever needs
            // the full history we'll add a dedicated endpoint.
            status: userData.status || "active",
            slaPenaltyLevel: userData.slaPenaltyLevel || "none",
            slaDemotedUntil: userData.slaDemotedUntil,
            isProfileDeactivated: userData.isProfileDeactivated || false,
            deactivatedUntil: userData.deactivatedUntil,
            deactivationReason: userData.deactivationReason,
            // Premium subscription status (so the pro can see their plan + expiry).
            isPremium: premiumActive,
            premiumTier: premiumActive
              ? userData.premiumTier || "none"
              : "none",
            premiumExpiresAt: userData.premiumExpiresAt,
            // Drives the 3-day money-back cancellation window on the client.
            premiumStartedAt: premiumActive
              ? userData.premiumStartedAt
              : undefined,
          }
        : {}),
    };
  }

  @Post("push-token")
  @ApiOperation({ summary: "Register push notification token" })
  @UseGuards(JwtAuthGuard)
  async registerPushToken(
    @CurrentUser() user: { userId: string },
    @Body() body: { token: string; platform: string },
  ) {
    await this.usersService.savePushToken(user.userId, body.token, body.platform || "web");
    return { success: true };
  }

  /**
   * Pro's payout bank account. Distinct from /users/payment-methods/bank
   * which is for clients saving cards/banks to PAY WITH. This one is
   * where Homico SENDS money to the pro after escrow releases.
   */
  @Get("me/payout-account")
  @ApiOperation({ summary: "Get my payout bank account (pro only)" })
  @ApiBearerAuth("JWT-auth")
  @UseGuards(JwtAuthGuard)
  async getMyPayoutAccount(@CurrentUser() user: { userId: string }) {
    const me = await this.usersService.findById(user.userId);
    return {
      bankAccount: me.bankAccount ?? null,
      name: me.name,
    };
  }

  @Put("me/payout-account")
  @ApiOperation({ summary: "Set my payout bank account (pro only)" })
  @ApiBearerAuth("JWT-auth")
  @UseGuards(JwtAuthGuard)
  async setMyPayoutAccount(
    @CurrentUser() user: { userId: string },
    @Body() body: { bankCode: string; accountNumber: string; holderName: string },
  ) {
    const updated = await this.usersService.updateBankAccount(user.userId, body);
    return {
      bankAccount: updated.bankAccount,
    };
  }

  @Patch("me")
  @ApiOperation({ summary: "Update current user profile" })
  @ApiBearerAuth("JWT-auth")
  @ApiResponse({ status: 200, description: "Profile updated successfully" })
  @UseGuards(JwtAuthGuard)
  async updateProfile(
    @CurrentUser() user: any,
    @Body() updateProfileDto: UpdateProfileDto,
  ) {
    const updatedUser = await this.usersService.update(
      user.userId,
      updateProfileDto,
    );
    return {
      id: updatedUser._id,
      uid: updatedUser.uid,
      name: updatedUser.name,
      email: updatedUser.email,
      role: updatedUser.role,
      phone: updatedUser.phone,
      city: updatedUser.city,
      avatar: updatedUser.avatar,
      accountType: updatedUser.accountType,
      selectedCategories:
        updatedUser.selectedCategories || updatedUser.categories,
      selectedSubcategories:
        updatedUser.selectedSubcategories?.length > 0
          ? updatedUser.selectedSubcategories
          : updatedUser.subcategories,
    };
  }

  @Post("add-email")
  @ApiOperation({
    summary: "Add or change email address (stores as pending until verified)",
  })
  @ApiBearerAuth("JWT-auth")
  @ApiResponse({ status: 200, description: "Pending email set successfully" })
  @ApiResponse({ status: 409, description: "Email already in use" })
  @UseGuards(JwtAuthGuard)
  async addEmail(@CurrentUser() user: any, @Body() body: { email: string }) {
    return this.usersService.setPendingEmail(user.userId, body.email);
  }

  @Post("verify-email-update")
  @ApiOperation({ summary: "Confirm email change after OTP verification" })
  @ApiBearerAuth("JWT-auth")
  @ApiResponse({ status: 200, description: "Email updated successfully" })
  @ApiResponse({ status: 409, description: "No pending email to confirm" })
  @UseGuards(JwtAuthGuard)
  async verifyEmailUpdate(@CurrentUser() user: any) {
    const updatedUser = await this.usersService.confirmEmailChange(user.userId);
    return {
      success: true,
      message: "Email updated successfully",
      email: updatedUser.email,
    };
  }

  @Post("change-password")
  @ApiOperation({ summary: "Change user password" })
  @ApiBearerAuth("JWT-auth")
  @ApiResponse({ status: 200, description: "Password changed successfully" })
  @ApiResponse({ status: 409, description: "Current password is incorrect" })
  @ApiResponse({
    status: 400,
    description: "Cannot change password for OAuth accounts",
  })
  @UseGuards(JwtAuthGuard)
  async changePassword(
    @CurrentUser() user: any,
    @Body() changePasswordDto: ChangePasswordDto,
  ) {
    return this.usersService.changePassword(
      user.userId,
      changePasswordDto.currentPassword,
      changePasswordDto.newPassword,
    );
  }

  @Post("upgrade-to-pro")
  @ApiOperation({ summary: "Upgrade client account to professional" })
  @ApiBearerAuth("JWT-auth")
  @ApiResponse({ status: 200, description: "Account upgraded to professional" })
  @ApiResponse({
    status: 409,
    description: "User is already a professional or not a client",
  })
  @UseGuards(JwtAuthGuard)
  async upgradeToPro(
    @CurrentUser() user: any,
    @Body()
    body: {
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
  ) {
    const updatedUser = await this.usersService.upgradeToPro(user.userId, {
      selectedCategories: body.selectedCategories,
      selectedSubcategories: body.selectedSubcategories,
      bio: body.bio,
      yearsExperience: body.yearsExperience,
      avatar: body.avatar,
      whatsapp: body.whatsapp,
      telegram: body.telegram,
      instagram: body.instagram,
      facebook: body.facebook,
      linkedin: body.linkedin,
      website: body.website,
      portfolioProjects: body.portfolioProjects,
    });

    // Generate new JWT token with updated role
    const payload = {
      sub: updatedUser._id,
      email: updatedUser.email,
      role: updatedUser.role,
    };

    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: updatedUser._id,
        uid: updatedUser.uid,
        name: updatedUser.name,
        email: updatedUser.email,
        role: updatedUser.role,
        phone: updatedUser.phone,
        city: updatedUser.city,
        avatar: updatedUser.avatar,
        accountType: updatedUser.accountType,
        selectedCategories: updatedUser.selectedCategories,
        selectedSubcategories: updatedUser.selectedSubcategories,
      },
      message: "Account upgraded to professional successfully",
    };
  }

  @Post("migrate-uids")
  @ApiOperation({
    summary: "Assign UIDs to existing users without one (admin only)",
  })
  @ApiResponse({ status: 200, description: "UIDs assigned successfully" })
  async migrateUids() {
    const result = await this.usersService.assignUidsToExistingUsers();
    return {
      message: `Successfully assigned UIDs to ${result.updated} users`,
      ...result,
    };
  }

  // Payment Methods Endpoints
  @Get("payment-methods")
  @ApiOperation({ summary: "Get user payment methods" })
  @ApiBearerAuth("JWT-auth")
  @ApiResponse({ status: 200, description: "List of payment methods" })
  @UseGuards(JwtAuthGuard)
  async getPaymentMethods(@CurrentUser() user: any) {
    return this.usersService.getPaymentMethods(user.userId);
  }

  @Post("payment-methods/card")
  @ApiOperation({ summary: "Add a card payment method" })
  @ApiBearerAuth("JWT-auth")
  @ApiResponse({ status: 201, description: "Card added successfully" })
  @UseGuards(JwtAuthGuard)
  async addCardPaymentMethod(
    @CurrentUser() user: any,
    @Body() dto: AddCardPaymentMethodDto,
  ) {
    return this.usersService.addCardPaymentMethod(
      user.userId,
      dto.cardNumber,
      dto.cardExpiry,
      dto.cardholderName,
      dto.setAsDefault,
    );
  }

  @Post("payment-methods/bank")
  @ApiOperation({ summary: "Add a bank payment method" })
  @ApiBearerAuth("JWT-auth")
  @ApiResponse({ status: 201, description: "Bank account added successfully" })
  @UseGuards(JwtAuthGuard)
  async addBankPaymentMethod(
    @CurrentUser() user: any,
    @Body() dto: AddBankPaymentMethodDto,
  ) {
    return this.usersService.addBankPaymentMethod(
      user.userId,
      dto.bankName,
      dto.iban,
      dto.setAsDefault,
    );
  }

  @Delete("payment-methods/:id")
  @ApiOperation({ summary: "Delete a payment method" })
  @ApiBearerAuth("JWT-auth")
  @ApiResponse({ status: 200, description: "Payment method deleted" })
  @UseGuards(JwtAuthGuard)
  async deletePaymentMethod(
    @CurrentUser() user: any,
    @Param("id") paymentMethodId: string,
  ) {
    await this.usersService.deletePaymentMethod(user.userId, paymentMethodId);
    return { message: "Payment method deleted successfully" };
  }

  @Patch("payment-methods/default")
  @ApiOperation({ summary: "Set default payment method" })
  @ApiBearerAuth("JWT-auth")
  @ApiResponse({ status: 200, description: "Default payment method updated" })
  @UseGuards(JwtAuthGuard)
  async setDefaultPaymentMethod(
    @CurrentUser() user: any,
    @Body() dto: SetDefaultPaymentMethodDto,
  ) {
    return this.usersService.setDefaultPaymentMethod(
      user.userId,
      dto.paymentMethodId,
    );
  }

  // ============== SERVICE ADDRESSES ==============

  @Get("addresses")
  @ApiOperation({ summary: "Get user service addresses" })
  @ApiBearerAuth("JWT-auth")
  @ApiResponse({ status: 200, description: "List of service addresses" })
  @UseGuards(JwtAuthGuard)
  async getServiceAddresses(@CurrentUser() user: any) {
    return this.usersService.getServiceAddresses(user.userId);
  }

  @Post("addresses")
  @ApiOperation({ summary: "Add a service address" })
  @ApiBearerAuth("JWT-auth")
  @ApiResponse({ status: 201, description: "Address added successfully" })
  @UseGuards(JwtAuthGuard)
  async addServiceAddress(
    @CurrentUser() user: any,
    @Body() dto: AddServiceAddressDto,
  ) {
    return this.usersService.addServiceAddress(user.userId, dto);
  }

  @Patch("addresses/:id")
  @ApiOperation({ summary: "Update a service address" })
  @ApiBearerAuth("JWT-auth")
  @ApiResponse({ status: 200, description: "Address updated successfully" })
  @UseGuards(JwtAuthGuard)
  async updateServiceAddress(
    @CurrentUser() user: any,
    @Param("id") addressId: string,
    @Body() dto: UpdateServiceAddressDto,
  ) {
    return this.usersService.updateServiceAddress(user.userId, addressId, dto);
  }

  @Delete("addresses/:id")
  @ApiOperation({ summary: "Delete a service address" })
  @ApiBearerAuth("JWT-auth")
  @ApiResponse({ status: 200, description: "Address deleted" })
  @UseGuards(JwtAuthGuard)
  async deleteServiceAddress(
    @CurrentUser() user: any,
    @Param("id") addressId: string,
  ) {
    await this.usersService.deleteServiceAddress(user.userId, addressId);
    return { message: "Address deleted successfully" };
  }

  @Patch("addresses/default")
  @ApiOperation({ summary: "Set default service address" })
  @ApiBearerAuth("JWT-auth")
  @ApiResponse({ status: 200, description: "Default address updated" })
  @UseGuards(JwtAuthGuard)
  async setDefaultServiceAddress(
    @CurrentUser() user: any,
    @Body() dto: SetDefaultAddressDto,
  ) {
    return this.usersService.setDefaultServiceAddress(
      user.userId,
      dto.addressId,
    );
  }

  // ============== NOTIFICATION PREFERENCES ==============

  @Get("notification-preferences")
  @ApiOperation({ summary: "Get notification preferences" })
  @ApiBearerAuth("JWT-auth")
  @ApiResponse({ status: 200, description: "Notification preferences" })
  @UseGuards(JwtAuthGuard)
  async getNotificationPreferences(@CurrentUser() user: any) {
    return this.usersService.getNotificationPreferences(user.userId);
  }

  @Patch("notification-preferences")
  @ApiOperation({ summary: "Update notification preferences" })
  @ApiBearerAuth("JWT-auth")
  @ApiResponse({ status: 200, description: "Notification preferences updated" })
  @UseGuards(JwtAuthGuard)
  async updateNotificationPreferences(
    @CurrentUser() user: any,
    @Body() body: any,
  ) {
    return this.usersService.updateNotificationPreferences(user.userId, body);
  }

  // ============== PRO SCHEDULE ==============

  @Get("me/schedule")
  @ApiOperation({ summary: "Get current pro schedule (weekly + overrides)" })
  @ApiBearerAuth("JWT-auth")
  @ApiResponse({ status: 200, description: "Pro schedule data" })
  @UseGuards(JwtAuthGuard)
  async getSchedule(@CurrentUser() user: any) {
    return this.usersService.getSchedule(user.userId);
  }

  @Put("me/schedule")
  @ApiOperation({ summary: "Set pro weekly schedule and/or date overrides" })
  @ApiBearerAuth("JWT-auth")
  @ApiResponse({ status: 200, description: "Schedule updated" })
  @UseGuards(JwtAuthGuard)
  async updateSchedule(
    @CurrentUser() user: any,
    @Body()
    body: {
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
    return this.usersService.updateSchedule(user.userId, body);
  }

  // ============== PRO-RELATED ENDPOINTS ==============
  // These replace the old /pro-profiles endpoints

  @Get("me/pro-profile")
  @ApiOperation({ summary: "Get current user pro profile" })
  @ApiBearerAuth("JWT-auth")
  @ApiResponse({ status: 200, description: "Pro profile" })
  @UseGuards(JwtAuthGuard)
  async getMyProProfile(@CurrentUser() user: any) {
    return this.usersService.findProById(user.userId);
  }

  @Get("me/pending-changes")
  @ApiOperation({
    summary:
      "Current pro's profile-moderation status (pending edit / last rejection)",
  })
  @ApiBearerAuth("JWT-auth")
  @ApiResponse({ status: 200, description: "Moderation status" })
  @UseGuards(JwtAuthGuard)
  async getMyPendingChanges(@CurrentUser() user: any) {
    return this.usersService.getMyModerationStatus(user.userId);
  }

  @Post("me/pro-profile")
  @ApiOperation({ summary: "Create or update pro profile for current user" })
  @ApiBearerAuth("JWT-auth")
  @ApiResponse({ status: 200, description: "Pro profile created/updated" })
  @UseGuards(JwtAuthGuard)
  async createOrUpdateProProfile(@CurrentUser() user: any, @Body() body: any) {
    return this.usersService.updateProProfile(user.userId, body);
  }

  @Patch("me/pro-profile")
  @ApiOperation({ summary: "Update pro profile for current user" })
  @ApiBearerAuth("JWT-auth")
  @ApiResponse({ status: 200, description: "Pro profile updated" })
  @UseGuards(JwtAuthGuard)
  async updateProProfile(@CurrentUser() user: any, @Body() body: any) {
    return this.usersService.updateProProfile(user.userId, body);
  }

  @Patch("pros/:id/profile")
  @ApiOperation({ summary: "Admin: update any pro profile by ID" })
  @ApiBearerAuth("JWT-auth")
  @ApiResponse({ status: 200, description: "Pro profile updated by admin" })
  @ApiResponse({ status: 403, description: "Admin access required" })
  @UseGuards(JwtAuthGuard)
  async adminUpdateProProfile(
    @CurrentUser() user: any,
    @Param("id") proId: string,
    @Body() body: any,
  ) {
    if (user.role !== "admin") {
      throw new ForbiddenException("Admin access required");
    }
    // Admin edits apply directly — they are the moderators, not the moderated.
    return this.usersService.updateProProfile(proId, body, {
      bypassModeration: true,
    });
  }

  @Get("pros/locations")
  @ApiOperation({ summary: "Get location data by country" })
  @ApiQuery({ name: "country", required: false })
  @ApiQuery({
    name: "locale",
    required: false,
    description: "Locale for translations (en or ka)",
  })
  @ApiResponse({ status: 200, description: "Location data for country" })
  getLocations(
    @Query("country") country?: string,
    @Query("locale") locale?: string,
  ) {
    return this.usersService.getLocations(country, locale);
  }

  @Get("pros")
  @ApiOperation({
    summary: "Get all pro users with optional filters and pagination",
  })
  @ApiQuery({ name: "category", required: false })
  @ApiQuery({ name: "subcategory", required: false })
  @ApiQuery({ name: "serviceArea", required: false })
  @ApiQuery({ name: "minRating", required: false })
  @ApiQuery({ name: "minPrice", required: false })
  @ApiQuery({ name: "maxPrice", required: false })
  @ApiQuery({
    name: "search",
    required: false,
    description: "Search by name, category, title, or description",
  })
  @ApiQuery({ name: "sort", required: false })
  @ApiQuery({
    name: "page",
    required: false,
    description: "Page number (1-indexed)",
  })
  @ApiQuery({ name: "limit", required: false, description: "Items per page" })
  @ApiQuery({
    name: "subcategories",
    required: false,
    description: "Comma-separated subcategory keys",
  })
  @ApiQuery({
    name: "scheduledDate",
    required: false,
    description: "Filter pros available on this date (ISO date)",
  })
  @ApiQuery({
    name: "scheduledSlot",
    required: false,
    description: "Filter pros available for this time slot",
  })
  @ApiQuery({
    name: "serviceKey",
    required: false,
    description: "Filter by specific service key in servicePricing",
  })
  @ApiQuery({
    name: "serviceMinPrice",
    required: false,
    description: "Minimum service-level price filter",
  })
  @ApiQuery({
    name: "serviceMaxPrice",
    required: false,
    description: "Maximum service-level price filter",
  })
  @ApiQuery({
    name: "country",
    required: false,
    description:
      "ISO 3166-1 alpha-2 country code. Scopes results to pros in that marketplace. Omit to see every country (admin-only behaviour).",
  })
  @ApiQuery({
    name: "seed",
    required: false,
    description:
      "Random seed for grouped-random ordering of the default 'recommended' sort. Pass the same seed across pages for consistent pagination; send a new seed to reshuffle.",
  })
  @ApiResponse({ status: 200, description: "Paginated list of pro users" })
  @UseGuards(OptionalJwtAuthGuard)
  findAllPros(
    @CurrentUser() user: any,
    @Query("category") category?: string,
    @Query("subcategory") subcategory?: string,
    @Query("subcategories") subcategories?: string,
    @Query("serviceArea") serviceArea?: string,
    @Query("minRating") minRating?: string,
    @Query("minPrice") minPrice?: string,
    @Query("maxPrice") maxPrice?: string,
    @Query("search") search?: string,
    @Query("sort") sort?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
    @Query("scheduledDate") scheduledDate?: string,
    @Query("scheduledSlot") scheduledSlot?: string,
    @Query("serviceKey") serviceKey?: string,
    @Query("serviceMinPrice") serviceMinPrice?: string,
    @Query("serviceMaxPrice") serviceMaxPrice?: string,
    @Query("country") country?: string,
    @Query("completeOnly") completeOnly?: string,
    @Query("partnersOnly") partnersOnly?: string,
    @Query("seed") seed?: string,
  ) {
    // Country scoping: an unauthenticated or non-admin caller MUST be
    // scoped to a country. We accept whatever they pass (validated by
    // the listing query in users.service.ts against SUPPORTED_COUNTRIES)
    // and default to "GE" if omitted - today the only live marketplace.
    // Admins pass `country` explicitly when they want to scope, or omit
    // for the cross-country admin view. Uppercased to match the stored
    // ISO 3166-1 form in case a caller forwards a URL-segment lowercase.
    const isAdmin = user?.role === "admin";
    const effectiveCountry = country
      ? country.toUpperCase()
      : (isAdmin ? undefined : "GE");

    return this.usersService.findAllPros({
      category,
      subcategory,
      subcategories,
      serviceArea,
      minRating: minRating ? parseFloat(minRating) : undefined,
      minPrice: minPrice ? parseFloat(minPrice) : undefined,
      maxPrice: maxPrice ? parseFloat(maxPrice) : undefined,
      search,
      sort,
      page: page ? parseInt(page) : undefined,
      limit: limit ? parseInt(limit) : undefined,
      scheduledDate,
      scheduledSlot,
      serviceKey,
      serviceMinPrice: serviceMinPrice ? parseFloat(serviceMinPrice) : undefined,
      serviceMaxPrice: serviceMaxPrice ? parseFloat(serviceMaxPrice) : undefined,
      country: effectiveCountry,
      completeOnly: completeOnly === "true",
      partnersOnly: partnersOnly === "true",
      seed: seed != null && seed !== "" ? parseInt(seed, 10) : undefined,
    });
  }

  // OptionalJwtAuthGuard: public endpoint, but if the visitor is logged in we
  // capture who they are (req.user) for the admin view-tracking log. Anonymous
  // visitors still pass through and are logged by IP only.
  @Get("pros/:id")
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: "Get pro user by ID or UID" })
  @ApiResponse({ status: 200, description: "Pro user profile" })
  @ApiResponse({ status: 404, description: "Pro not found" })
  async findProById(@Param("id") id: string, @Req() req: any) {
    const ip = getClientIp(req);
    const actor = req.user
      ? { id: req.user.userId, name: req.user.name }
      : undefined;
    const pro = await this.usersService.findProById(id, ip, actor);
    // Public endpoint: strip account PII for everyone except the pro viewing
    // their own profile. Strip from the schema's toJSON output so the response
    // shape (id normalization, pricing, premiumSource removal) is preserved.
    const proJson =
      typeof (pro as any)?.toJSON === "function"
        ? (pro as any).toJSON()
        : { ...(pro as any) };
    const viewerId = req.user?.userId;
    const isOwner = !!viewerId && String(proJson?.id) === String(viewerId);
    if (!isOwner) {
      delete proJson.email;
      delete proJson.pendingEmail;
      delete proJson.googleId;
      delete proJson.pushTokens;
    }
    return proJson;
  }

  @Post("pros/:id/phone-view")
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({
    summary: "Track a phone-number reveal on a pro profile (public, deduped by IP)",
  })
  @ApiResponse({ status: 201, description: "Phone view tracked" })
  async trackPhoneView(@Param("id") id: string, @Req() req: any) {
    const ip = getClientIp(req);
    const actor = req.user
      ? { id: req.user.userId, name: req.user.name }
      : undefined;
    const phoneViewCount = await this.usersService.trackPhoneView(id, ip, actor);
    return { success: true, phoneViewCount };
  }

  @Get("profile/:id")
  @ApiOperation({ summary: "Get public user profile by ID" })
  @ApiResponse({ status: 200, description: "User public profile" })
  @ApiResponse({ status: 404, description: "User not found" })
  async getPublicProfile(@Param("id") id: string) {
    return this.usersService.findPublicProfile(id);
  }

  @Delete("me")
  @ApiOperation({ summary: "Delete current user account" })
  @ApiBearerAuth("JWT-auth")
  @ApiResponse({ status: 200, description: "Account deleted successfully" })
  @ApiResponse({ status: 401, description: "Unauthorized" })
  @UseGuards(JwtAuthGuard)
  async deleteAccount(@CurrentUser() user: any) {
    await this.usersService.deleteAccount(user.userId);
    return { message: "Account deleted successfully" };
  }

  // ============== PRO STATUS (Active / Busy / Away) ==============

  @Post("me/status")
  @ApiOperation({
    summary:
      "Set pro availability status (active|busy|away). 'away' exempts the pro from SLA timers.",
  })
  @ApiBearerAuth("JWT-auth")
  @ApiResponse({ status: 200, description: "Status updated" })
  @ApiResponse({ status: 400, description: "Invalid status value" })
  @UseGuards(JwtAuthGuard)
  async updateStatus(
    @CurrentUser() user: any,
    @Body() body: { status: "active" | "busy" | "away" },
  ) {
    const allowed = ["active", "busy", "away"] as const;
    if (!allowed.includes(body?.status)) {
      throw new BadRequestException(
        `status must be one of: ${allowed.join(", ")}`,
      );
    }
    const updated = await this.usersService.updateStatus(
      user.userId,
      body.status,
    );
    return {
      status: updated.status,
      statusUpdatedAt: updated.statusUpdatedAt,
    };
  }

  // ============== PRO PROFILE DEACTIVATION ==============

  @Post("me/deactivate")
  @ApiOperation({ summary: "Temporarily deactivate pro profile" })
  @ApiBearerAuth("JWT-auth")
  @ApiResponse({ status: 200, description: "Profile deactivated successfully" })
  @ApiResponse({
    status: 400,
    description: "Only pro users can deactivate their profile",
  })
  @ApiResponse({ status: 409, description: "Profile is already deactivated" })
  @UseGuards(JwtAuthGuard)
  async deactivateProfile(
    @CurrentUser() user: any,
    @Body() body: { deactivateUntil?: string; reason?: string },
  ) {
    const deactivateUntil = body.deactivateUntil
      ? new Date(body.deactivateUntil)
      : undefined;
    const updatedUser = await this.usersService.deactivateProProfile(
      user.userId,
      deactivateUntil,
      body.reason,
    );
    return {
      message: "Profile deactivated successfully",
      isProfileDeactivated: updatedUser.isProfileDeactivated,
      deactivatedAt: updatedUser.deactivatedAt,
      deactivatedUntil: updatedUser.deactivatedUntil,
      deactivationReason: updatedUser.deactivationReason,
    };
  }

  @Post("me/reactivate")
  @ApiOperation({ summary: "Reactivate pro profile" })
  @ApiBearerAuth("JWT-auth")
  @ApiResponse({ status: 200, description: "Profile reactivated successfully" })
  @ApiResponse({
    status: 400,
    description: "Only pro users can reactivate their profile",
  })
  @ApiResponse({ status: 409, description: "Profile is not deactivated" })
  @UseGuards(JwtAuthGuard)
  async reactivateProfile(@CurrentUser() user: any) {
    const updatedUser = await this.usersService.reactivateProProfile(
      user.userId,
    );
    return {
      message: "Profile reactivated successfully",
      isProfileDeactivated: updatedUser.isProfileDeactivated,
    };
  }

  @Get("me/deactivation-status")
  @ApiOperation({ summary: "Get pro profile deactivation status" })
  @ApiBearerAuth("JWT-auth")
  @ApiResponse({ status: 200, description: "Deactivation status" })
  @UseGuards(JwtAuthGuard)
  async getDeactivationStatus(@CurrentUser() user: any) {
    return this.usersService.getDeactivationStatus(user.userId);
  }
}
