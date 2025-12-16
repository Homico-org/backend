import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
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
      selectedCategories: userData.selectedCategories,
      selectedSubcategories: userData.selectedSubcategories,
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
      selectedCategories: updatedUser.selectedCategories,
      selectedSubcategories: updatedUser.selectedSubcategories,
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
        selectedCategories: updatedUser.selectedCategories,
        selectedSubcategories: updatedUser.selectedSubcategories,
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
}
