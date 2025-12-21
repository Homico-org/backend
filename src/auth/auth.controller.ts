import { Controller, Post, Body, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { LoginDto } from './dto/login.dto';
import { GoogleRegisterDto } from './dto/google-register.dto';
import { UsersService } from '../users/users.service';

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
  async register(@Body() createUserDto: CreateUserDto) {
    return this.authService.register(createUserDto);
  }

  @Post('login')
  @ApiOperation({ summary: 'Login user' })
  @ApiResponse({ status: 200, description: 'Login successful' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @Post('google-register')
  @ApiOperation({ summary: 'Register or login with Google' })
  @ApiResponse({ status: 201, description: 'User successfully registered/logged in with Google' })
  @ApiResponse({ status: 409, description: 'User already exists with this email or phone' })
  async googleRegister(@Body() googleRegisterDto: GoogleRegisterDto) {
    return this.authService.googleRegister(googleRegisterDto);
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
