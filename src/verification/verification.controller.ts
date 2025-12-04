import { Controller, Post, Body, UseGuards, Request, Patch } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { VerificationService } from './verification.service';
import { SendOtpDto, VerifyOtpDto, OtpType, ForgotPasswordDto, ResetPasswordDto } from './dto/send-otp.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { UsersService } from '../users/users.service';

@ApiTags('Verification')
@Controller('verification')
export class VerificationController {
  constructor(
    private readonly verificationService: VerificationService,
    private readonly usersService: UsersService,
  ) {}

  @Post('send-otp')
  @ApiOperation({ summary: 'Send OTP for email or phone verification' })
  @ApiResponse({ status: 200, description: 'OTP sent successfully' })
  @ApiResponse({ status: 400, description: 'Bad request or rate limited' })
  async sendOtp(@Body() sendOtpDto: SendOtpDto) {
    return this.verificationService.sendOtp(sendOtpDto);
  }

  @Post('verify-otp')
  @ApiOperation({ summary: 'Verify OTP code' })
  @ApiResponse({ status: 200, description: 'OTP verified successfully' })
  @ApiResponse({ status: 400, description: 'Invalid or expired OTP' })
  async verifyOtp(@Body() verifyOtpDto: VerifyOtpDto) {
    return this.verificationService.verifyOtp(verifyOtpDto);
  }

  @Patch('mark-verified')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mark user email or phone as verified (requires JWT)' })
  @ApiResponse({ status: 200, description: 'User verification status updated' })
  async markVerified(
    @Request() req,
    @Body() body: { type: OtpType; identifier: string },
  ) {
    const userId = req.user.sub;
    const user = await this.usersService.findById(userId);

    if (!user) {
      throw new Error('User not found');
    }

    // Verify the identifier matches the user's email/phone
    if (body.type === OtpType.EMAIL && user.email !== body.identifier) {
      throw new Error('Email does not match');
    }
    if (body.type === OtpType.PHONE && user.phone !== body.identifier) {
      throw new Error('Phone does not match');
    }

    // Update user verification status
    const updateData: any = {};
    if (body.type === OtpType.EMAIL) {
      updateData.isEmailVerified = true;
      updateData.emailVerifiedAt = new Date();
    } else if (body.type === OtpType.PHONE) {
      updateData.isPhoneVerified = true;
      updateData.phoneVerifiedAt = new Date();
    }

    await this.usersService.update(userId, updateData);

    return {
      message: `${body.type === OtpType.EMAIL ? 'Email' : 'Phone'} verified successfully`,
      verified: true,
    };
  }

  @Post('forgot-password')
  @ApiOperation({ summary: 'Request password reset OTP' })
  @ApiResponse({ status: 200, description: 'Password reset OTP sent if email exists' })
  @ApiResponse({ status: 400, description: 'Rate limited or invalid request' })
  async forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto) {
    return this.verificationService.sendPasswordResetOtp(forgotPasswordDto);
  }

  @Post('verify-reset-code')
  @ApiOperation({ summary: 'Verify password reset OTP code' })
  @ApiResponse({ status: 200, description: 'OTP verified successfully' })
  @ApiResponse({ status: 400, description: 'Invalid or expired OTP' })
  async verifyResetCode(@Body() body: { email: string; code: string }) {
    return this.verificationService.verifyPasswordResetOtp(body.email, body.code);
  }

  @Post('reset-password')
  @ApiOperation({ summary: 'Reset password with verified OTP' })
  @ApiResponse({ status: 200, description: 'Password reset successfully' })
  @ApiResponse({ status: 400, description: 'Invalid or expired OTP' })
  async resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    return this.verificationService.resetPassword(resetPasswordDto);
  }
}
