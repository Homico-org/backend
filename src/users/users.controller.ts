import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UpdateProfileDto } from './dto/update-profile.dto';

@ApiTags('Users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

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
      message: 'Account upgraded to professional successfully',
    };
  }
}
