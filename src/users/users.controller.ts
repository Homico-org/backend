import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  UseGuards,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateNotificationPreferencesDto, AddEmailDto } from './dto/notification-preferences.dto';

@ApiTags('Users')
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  @Get('profile/:id')
  @ApiOperation({ summary: 'Get public user profile by ID' })
  @ApiResponse({ status: 200, description: 'Public user profile' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getPublicProfile(@Param('id') id: string) {
    try {
      const user = await this.usersService.findById(id);
      return {
        _id: user._id,
        name: user.name,
        avatar: user.avatar,
        city: user.city,
        role: user.role,
        accountType: user.accountType,
        companyName: user.companyName,
        createdAt: (user as any).createdAt,
      };
    } catch {
      throw new NotFoundException('User not found');
    }
  }

  @Get('me')
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 200, description: 'User profile' })
  @UseGuards(JwtAuthGuard)
  async getProfile(@CurrentUser() user: any) {
    const userData = await this.usersService.findById(user.userId);
    return {
      id: userData._id,
      name: userData.name,
      email: userData.email,
      role: userData.role,
      phone: userData.phone,
      city: userData.city,
      avatar: userData.avatar,
      accountType: userData.accountType,
      companyName: userData.companyName,
      selectedCategories: userData.selectedCategories,
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
      name: updatedUser.name,
      email: updatedUser.email,
      role: updatedUser.role,
      phone: updatedUser.phone,
      city: updatedUser.city,
      avatar: updatedUser.avatar,
      accountType: updatedUser.accountType,
      companyName: updatedUser.companyName,
      selectedCategories: updatedUser.selectedCategories,
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
        name: updatedUser.name,
        email: updatedUser.email,
        role: updatedUser.role,
        phone: updatedUser.phone,
        city: updatedUser.city,
        avatar: updatedUser.avatar,
        accountType: updatedUser.accountType,
        companyName: updatedUser.companyName,
        selectedCategories: updatedUser.selectedCategories,
      },
      message: 'Account upgraded to professional successfully',
    };
  }

  @Post('change-password')
  @ApiOperation({ summary: 'Change user password' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 200, description: 'Password changed successfully' })
  @ApiResponse({ status: 409, description: 'Current password is incorrect' })
  @UseGuards(JwtAuthGuard)
  async changePassword(
    @CurrentUser() user: any,
    @Body() changePasswordDto: ChangePasswordDto,
  ) {
    await this.usersService.changePassword(
      user.userId,
      changePasswordDto.currentPassword,
      changePasswordDto.newPassword,
    );

    return {
      success: true,
      message: 'Password changed successfully',
    };
  }

  @Get('notification-preferences')
  @ApiOperation({ summary: 'Get user notification preferences' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 200, description: 'Notification preferences retrieved' })
  @UseGuards(JwtAuthGuard)
  async getNotificationPreferences(@CurrentUser() user: any) {
    const userData = await this.usersService.findById(user.userId);
    return {
      email: userData.email,
      isEmailVerified: userData.isEmailVerified,
      phone: userData.phone,
      isPhoneVerified: userData.isPhoneVerified,
      preferences: userData.notificationPreferences || {
        email: { enabled: true, newJobs: true, proposals: true, messages: true, marketing: false },
        push: { enabled: true, newJobs: true, proposals: true, messages: true },
        sms: { enabled: false, proposals: true, messages: true },
      },
    };
  }

  @Patch('notification-preferences')
  @ApiOperation({ summary: 'Update user notification preferences' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 200, description: 'Notification preferences updated' })
  @UseGuards(JwtAuthGuard)
  async updateNotificationPreferences(
    @CurrentUser() user: any,
    @Body() updateDto: UpdateNotificationPreferencesDto,
  ) {
    const userData = await this.usersService.findById(user.userId);

    // Merge existing preferences with updates
    const currentPrefs = userData.notificationPreferences || {
      email: { enabled: true, newJobs: true, proposals: true, messages: true, marketing: false },
      push: { enabled: true, newJobs: true, proposals: true, messages: true },
      sms: { enabled: false, proposals: true, messages: true },
    };

    const mergedPrefs = {
      email: { ...currentPrefs.email, ...updateDto.email },
      push: { ...currentPrefs.push, ...updateDto.push },
      sms: { ...currentPrefs.sms, ...updateDto.sms },
    };

    const updatedUser = await this.usersService.update(user.userId, {
      notificationPreferences: mergedPrefs,
    });

    return {
      success: true,
      preferences: updatedUser.notificationPreferences,
    };
  }

  @Post('add-email')
  @ApiOperation({ summary: 'Add email to user account' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 200, description: 'Email added successfully' })
  @ApiResponse({ status: 409, description: 'Email already in use' })
  @UseGuards(JwtAuthGuard)
  async addEmail(
    @CurrentUser() user: any,
    @Body() addEmailDto: AddEmailDto,
  ) {
    const userData = await this.usersService.findById(user.userId);

    // Check if user already has an email
    if (userData.email) {
      throw new ConflictException('User already has an email address');
    }

    // Check if email is already in use by another user
    const existingUser = await this.usersService.findByEmail(addEmailDto.email.toLowerCase());
    if (existingUser) {
      throw new ConflictException('This email is already in use');
    }

    // Update user with new email (unverified)
    const updatedUser = await this.usersService.update(user.userId, {
      email: addEmailDto.email.toLowerCase(),
      isEmailVerified: false,
    });

    return {
      success: true,
      email: updatedUser.email,
      isEmailVerified: updatedUser.isEmailVerified,
      message: 'Email added. Please verify your email address.',
    };
  }

  @Post('verify-email-update')
  @ApiOperation({ summary: 'Mark email as verified after OTP verification' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 200, description: 'Email verified successfully' })
  @UseGuards(JwtAuthGuard)
  async verifyEmailUpdate(@CurrentUser() user: any) {
    const updatedUser = await this.usersService.update(user.userId, {
      isEmailVerified: true,
      emailVerifiedAt: new Date(),
    });

    return {
      success: true,
      email: updatedUser.email,
      isEmailVerified: updatedUser.isEmailVerified,
      message: 'Email verified successfully',
    };
  }
}
