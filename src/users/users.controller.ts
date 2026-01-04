import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../common/guards/optional-jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { AddCardPaymentMethodDto, AddBankPaymentMethodDto, SetDefaultPaymentMethodDto } from './dto/payment-method.dto';

@ApiTags('Users')
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  @Get('me')
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 200, description: 'User profile' })
  @UseGuards(JwtAuthGuard)
  async getProfile(@CurrentUser() user: any) {
    const userData = await this.usersService.findById(user.userId);
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
      companyName: userData.companyName,
      selectedCategories: userData.selectedCategories || userData.categories,
      // For pro users, subcategories are stored in 'subcategories' field
      selectedSubcategories: userData.selectedSubcategories?.length > 0
        ? userData.selectedSubcategories
        : userData.subcategories,
      // Include verification status for pro users
      ...(userData.role === 'pro' ? { verificationStatus: userData.verificationStatus || 'pending' } : {}),
    };
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update current user profile' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 200, description: 'Profile updated successfully' })
  @UseGuards(JwtAuthGuard)
  async updateProfile(
    @CurrentUser() user: any,
    @Body() updateProfileDto: UpdateProfileDto,
  ) {
    const updatedUser = await this.usersService.update(user.userId, updateProfileDto);
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
      companyName: updatedUser.companyName,
      selectedCategories: updatedUser.selectedCategories || updatedUser.categories,
      selectedSubcategories: updatedUser.selectedSubcategories?.length > 0
        ? updatedUser.selectedSubcategories
        : updatedUser.subcategories,
    };
  }

  @Post('add-email')
  @ApiOperation({ summary: 'Add or change email address (stores as pending until verified)' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 200, description: 'Pending email set successfully' })
  @ApiResponse({ status: 409, description: 'Email already in use' })
  @UseGuards(JwtAuthGuard)
  async addEmail(
    @CurrentUser() user: any,
    @Body() body: { email: string },
  ) {
    return this.usersService.setPendingEmail(user.userId, body.email);
  }

  @Post('verify-email-update')
  @ApiOperation({ summary: 'Confirm email change after OTP verification' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 200, description: 'Email updated successfully' })
  @ApiResponse({ status: 409, description: 'No pending email to confirm' })
  @UseGuards(JwtAuthGuard)
  async verifyEmailUpdate(@CurrentUser() user: any) {
    const updatedUser = await this.usersService.confirmEmailChange(user.userId);
    return {
      success: true,
      message: 'Email updated successfully',
      email: updatedUser.email,
    };
  }

  @Post('upgrade-to-pro')
  @ApiOperation({ summary: 'Upgrade client account to professional' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 200, description: 'Account upgraded to professional' })
  @ApiResponse({ status: 409, description: 'User is already a professional or not a client' })
  @UseGuards(JwtAuthGuard)
  async upgradeToPro(
    @CurrentUser() user: any,
    @Body() body: { selectedCategories: string[] },
  ) {
    const updatedUser = await this.usersService.upgradeToPro(user.userId, body.selectedCategories);

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
        companyName: updatedUser.companyName,
        selectedCategories: updatedUser.selectedCategories || updatedUser.categories,
        selectedSubcategories: updatedUser.selectedSubcategories?.length > 0
          ? updatedUser.selectedSubcategories
          : updatedUser.subcategories,
      },
      message: 'Account upgraded to professional successfully',
    };
  }

  @Post('migrate-uids')
  @ApiOperation({ summary: 'Assign UIDs to existing users without one (admin only)' })
  @ApiResponse({ status: 200, description: 'UIDs assigned successfully' })
  async migrateUids() {
    const result = await this.usersService.assignUidsToExistingUsers();
    return {
      message: `Successfully assigned UIDs to ${result.updated} users`,
      ...result,
    };
  }

  // Payment Methods Endpoints
  @Get('payment-methods')
  @ApiOperation({ summary: 'Get user payment methods' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 200, description: 'List of payment methods' })
  @UseGuards(JwtAuthGuard)
  async getPaymentMethods(@CurrentUser() user: any) {
    return this.usersService.getPaymentMethods(user.userId);
  }

  @Post('payment-methods/card')
  @ApiOperation({ summary: 'Add a card payment method' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 201, description: 'Card added successfully' })
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

  @Post('payment-methods/bank')
  @ApiOperation({ summary: 'Add a bank payment method' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 201, description: 'Bank account added successfully' })
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

  @Delete('payment-methods/:id')
  @ApiOperation({ summary: 'Delete a payment method' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 200, description: 'Payment method deleted' })
  @UseGuards(JwtAuthGuard)
  async deletePaymentMethod(
    @CurrentUser() user: any,
    @Param('id') paymentMethodId: string,
  ) {
    await this.usersService.deletePaymentMethod(user.userId, paymentMethodId);
    return { message: 'Payment method deleted successfully' };
  }

  @Patch('payment-methods/default')
  @ApiOperation({ summary: 'Set default payment method' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 200, description: 'Default payment method updated' })
  @UseGuards(JwtAuthGuard)
  async setDefaultPaymentMethod(
    @CurrentUser() user: any,
    @Body() dto: SetDefaultPaymentMethodDto,
  ) {
    return this.usersService.setDefaultPaymentMethod(user.userId, dto.paymentMethodId);
  }

  // ============== NOTIFICATION PREFERENCES ==============

  @Get('notification-preferences')
  @ApiOperation({ summary: 'Get notification preferences' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 200, description: 'Notification preferences' })
  @UseGuards(JwtAuthGuard)
  async getNotificationPreferences(@CurrentUser() user: any) {
    return this.usersService.getNotificationPreferences(user.userId);
  }

  @Patch('notification-preferences')
  @ApiOperation({ summary: 'Update notification preferences' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 200, description: 'Notification preferences updated' })
  @UseGuards(JwtAuthGuard)
  async updateNotificationPreferences(
    @CurrentUser() user: any,
    @Body() body: any,
  ) {
    return this.usersService.updateNotificationPreferences(user.userId, body);
  }

  // ============== PRO-RELATED ENDPOINTS ==============
  // These replace the old /pro-profiles endpoints

  @Get('me/pro-profile')
  @ApiOperation({ summary: 'Get current user pro profile' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 200, description: 'Pro profile' })
  @UseGuards(JwtAuthGuard)
  async getMyProProfile(@CurrentUser() user: any) {
    return this.usersService.findProById(user.userId);
  }

  @Post('me/pro-profile')
  @ApiOperation({ summary: 'Create or update pro profile for current user' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 200, description: 'Pro profile created/updated' })
  @UseGuards(JwtAuthGuard)
  async createOrUpdateProProfile(
    @CurrentUser() user: any,
    @Body() body: any,
  ) {
    return this.usersService.updateProProfile(user.userId, body);
  }

  @Patch('me/pro-profile')
  @ApiOperation({ summary: 'Update pro profile for current user' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 200, description: 'Pro profile updated' })
  @UseGuards(JwtAuthGuard)
  async updateProProfile(
    @CurrentUser() user: any,
    @Body() body: any,
  ) {
    return this.usersService.updateProProfile(user.userId, body);
  }

  @Get('pros/locations')
  @ApiOperation({ summary: 'Get location data by country' })
  @ApiQuery({ name: 'country', required: false })
  @ApiQuery({ name: 'locale', required: false, description: 'Locale for translations (en or ka)' })
  @ApiResponse({ status: 200, description: 'Location data for country' })
  getLocations(
    @Query('country') country?: string,
    @Query('locale') locale?: string,
  ) {
    return this.usersService.getLocations(country, locale);
  }

  @Get('pros')
  @ApiOperation({ summary: 'Get all pro users with optional filters and pagination' })
  @ApiQuery({ name: 'category', required: false })
  @ApiQuery({ name: 'subcategory', required: false })
  @ApiQuery({ name: 'serviceArea', required: false })
  @ApiQuery({ name: 'minRating', required: false })
  @ApiQuery({ name: 'minPrice', required: false })
  @ApiQuery({ name: 'maxPrice', required: false })
  @ApiQuery({ name: 'search', required: false, description: 'Search by name, category, title, or description' })
  @ApiQuery({ name: 'sort', required: false })
  @ApiQuery({ name: 'page', required: false, description: 'Page number (1-indexed)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page' })
  @ApiQuery({ name: 'companyIds', required: false, description: 'Comma-separated company IDs to filter by' })
  @ApiResponse({ status: 200, description: 'Paginated list of pro users' })
  @UseGuards(OptionalJwtAuthGuard)
  findAllPros(
    @CurrentUser() user: any,
    @Query('category') category?: string,
    @Query('subcategory') subcategory?: string,
    @Query('serviceArea') serviceArea?: string,
    @Query('minRating') minRating?: string,
    @Query('minPrice') minPrice?: string,
    @Query('maxPrice') maxPrice?: string,
    @Query('search') search?: string,
    @Query('sort') sort?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('companyIds') companyIds?: string,
  ) {
    return this.usersService.findAllPros({
      category,
      subcategory,
      serviceArea,
      minRating: minRating ? parseFloat(minRating) : undefined,
      minPrice: minPrice ? parseFloat(minPrice) : undefined,
      maxPrice: maxPrice ? parseFloat(maxPrice) : undefined,
      search,
      sort,
      page: page ? parseInt(page) : undefined,
      limit: limit ? parseInt(limit) : undefined,
      companyIds: companyIds ? companyIds.split(',').filter(id => id.trim()) : undefined,
    });
  }

  @Get('pros/:id')
  @ApiOperation({ summary: 'Get pro user by ID or UID' })
  @ApiResponse({ status: 200, description: 'Pro user profile' })
  @ApiResponse({ status: 404, description: 'Pro not found' })
  findProById(@Param('id') id: string) {
    return this.usersService.findProById(id);
  }

  @Get('profile/:id')
  @ApiOperation({ summary: 'Get public user profile by ID' })
  @ApiResponse({ status: 200, description: 'User public profile' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getPublicProfile(@Param('id') id: string) {
    return this.usersService.findPublicProfile(id);
  }

  @Delete('me')
  @ApiOperation({ summary: 'Delete current user account' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 200, description: 'Account deleted successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @UseGuards(JwtAuthGuard)
  async deleteAccount(@CurrentUser() user: any) {
    await this.usersService.deleteAccount(user.userId);
    return { message: 'Account deleted successfully' };
  }

  // ============== PRO PROFILE DEACTIVATION ==============

  @Post('me/deactivate')
  @ApiOperation({ summary: 'Temporarily deactivate pro profile' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 200, description: 'Profile deactivated successfully' })
  @ApiResponse({ status: 400, description: 'Only pro users can deactivate their profile' })
  @ApiResponse({ status: 409, description: 'Profile is already deactivated' })
  @UseGuards(JwtAuthGuard)
  async deactivateProfile(
    @CurrentUser() user: any,
    @Body() body: { deactivateUntil?: string; reason?: string },
  ) {
    const deactivateUntil = body.deactivateUntil ? new Date(body.deactivateUntil) : undefined;
    const updatedUser = await this.usersService.deactivateProProfile(
      user.userId,
      deactivateUntil,
      body.reason,
    );
    return {
      message: 'Profile deactivated successfully',
      isProfileDeactivated: updatedUser.isProfileDeactivated,
      deactivatedAt: updatedUser.deactivatedAt,
      deactivatedUntil: updatedUser.deactivatedUntil,
      deactivationReason: updatedUser.deactivationReason,
    };
  }

  @Post('me/reactivate')
  @ApiOperation({ summary: 'Reactivate pro profile' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 200, description: 'Profile reactivated successfully' })
  @ApiResponse({ status: 400, description: 'Only pro users can reactivate their profile' })
  @ApiResponse({ status: 409, description: 'Profile is not deactivated' })
  @UseGuards(JwtAuthGuard)
  async reactivateProfile(@CurrentUser() user: any) {
    const updatedUser = await this.usersService.reactivateProProfile(user.userId);
    return {
      message: 'Profile reactivated successfully',
      isProfileDeactivated: updatedUser.isProfileDeactivated,
    };
  }

  @Get('me/deactivation-status')
  @ApiOperation({ summary: 'Get pro profile deactivation status' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 200, description: 'Deactivation status' })
  @UseGuards(JwtAuthGuard)
  async getDeactivationStatus(@CurrentUser() user: any) {
    return this.usersService.getDeactivationStatus(user.userId);
  }
}
