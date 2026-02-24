import { Controller, Post, Patch, Body, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { LoginDto } from './dto/login.dto';
import { PhoneLoginDto } from './dto/phone-login.dto';
import { ProRegisterDto } from './dto/pro-register.dto';
import { ProRegistrationStepDto } from './dto/pro-registration-step.dto';
import { UsersService } from '../users/users.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { Request } from 'express';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
  ) {}

  @Post('register')
  @ApiOperation({ summary: 'Register a new user' })
  @ApiResponse({ status: 201, description: 'User successfully registered' })
  @ApiResponse({ status: 409, description: 'User already exists' })
  async register(@Body() createUserDto: CreateUserDto, @Req() req: Request) {
    return this.authService.register(createUserDto, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Post('login')
  @ApiOperation({ summary: 'Login user' })
  @ApiResponse({ status: 200, description: 'Login successful' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(@Body() loginDto: LoginDto, @Req() req: Request) {
    return this.authService.login(loginDto, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Post('phone-login')
  @ApiOperation({ summary: 'Client phone OTP login/register' })
  @ApiResponse({ status: 200, description: 'Login successful' })
  @ApiResponse({ status: 400, description: 'Invalid OTP or missing name' })
  async phoneLogin(@Body() dto: PhoneLoginDto, @Req() req: Request) {
    return this.authService.phoneLogin(dto, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Post('pro-register')
  @ApiOperation({ summary: 'Professional phone OTP registration' })
  @ApiResponse({ status: 200, description: 'Registration successful' })
  @ApiResponse({ status: 409, description: 'Already registered as professional' })
  async proRegister(@Body() dto: ProRegisterDto, @Req() req: Request) {
    return this.authService.proRegister(dto, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Patch('pro-registration-step')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Save pro registration wizard step progress' })
  @ApiResponse({ status: 200, description: 'Step saved' })
  async updateProRegistrationStep(
    @CurrentUser() currentUser: any,
    @Body() dto: ProRegistrationStepDto,
  ) {
    return this.authService.updateProRegistrationStep(currentUser.userId, dto);
  }

  @Get('demo-accounts')
  @ApiOperation({ summary: 'Get demo accounts for testing' })
  @ApiResponse({ status: 200, description: 'Demo accounts retrieved' })
  async getDemoAccounts() {
    return this.authService.getDemoAccounts();
  }

  @Get('check-exists')
  @ApiOperation({ summary: 'Check if email or phone already exists' })
  @ApiQuery({ name: 'field', enum: ['email', 'phone'], description: 'Field to check' })
  @ApiQuery({ name: 'value', description: 'Value to check' })
  @ApiResponse({ status: 200, description: 'Returns whether the value exists' })
  async checkExists(
    @Query('field') field: 'email' | 'phone',
    @Query('value') value: string,
  ) {
    if (!field || !value) {
      return { exists: false };
    }
    return this.usersService.checkExists(field, value);
  }
}
