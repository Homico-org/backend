import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { LoginDto } from './dto/login.dto';
import { LoggerService, ActivityType } from '../common/logger';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private readonly logger: LoggerService,
  ) {}

  async register(createUserDto: CreateUserDto, requestMeta?: { ip?: string; userAgent?: string }) {
    const user = await this.usersService.create(createUserDto);

    // Log registration
    this.logger.logActivity({
      type: ActivityType.USER_REGISTER,
      userId: user._id.toString(),
      userEmail: user.email || user.phone || 'unknown',
      userName: user.name,
      ip: requestMeta?.ip,
      userAgent: requestMeta?.userAgent,
      details: {
        role: user.role,
        phone: user.phone,
        registrationMethod: user.phone ? 'phone' : 'email',
      },
    });

    const payload = {
      sub: user._id,
      email: user.email,
      role: user.role,
    };

    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user._id,
        uid: user.uid,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        avatar: user.avatar,
        city: user.city,
        selectedCategories: user.selectedCategories || [],
        selectedSubcategories: user.selectedSubcategories || [],
        accountType: user.accountType || 'individual',
        companyName: user.companyName,
        isProfileCompleted: user.isProfileCompleted ?? false,
        verificationStatus: user.verificationStatus || 'pending',
      },
    };
  }

  async login(loginDto: LoginDto, requestMeta?: { ip?: string; userAgent?: string }) {
    // Find user by email or phone
    const user = await this.usersService.findByEmailOrPhone(loginDto.identifier);

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Check if user has a password (might be Google-only user)
    if (!user.password) {
      throw new UnauthorizedException('This account uses Google login. Please sign in with Google or use "Forgot Password" to set a password.');
    }

    const isPasswordValid = await this.usersService.validatePassword(
      loginDto.password,
      user.password,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.usersService.updateLastLogin(user._id.toString());

    // Log login
    const loginMethod = loginDto.identifier?.includes('@') ? 'email' : 'phone';
    this.logger.logActivity({
      type: ActivityType.USER_LOGIN,
      userId: user._id.toString(),
      userEmail: user.email || user.phone || 'unknown',
      userName: user.name,
      ip: requestMeta?.ip,
      userAgent: requestMeta?.userAgent,
      details: {
        role: user.role,
        loginMethod,
        identifier: loginDto.identifier,
      },
    });

    const payload = {
      sub: user._id,
      email: user.email,
      role: user.role,
    };

    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user._id,
        uid: user.uid,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        avatar: user.avatar,
        city: user.city,
        selectedCategories: user.selectedCategories || [],
        selectedSubcategories: user.selectedSubcategories || [],
        accountType: user.accountType || 'individual',
        companyName: user.companyName,
        isProfileCompleted: user.isProfileCompleted ?? false,
        verificationStatus: user.verificationStatus || 'pending',
      },
    };
  }

  async validateUser(userId: string) {
    return this.usersService.findById(userId);
  }

  async getDemoAccounts() {
    return this.usersService.getDemoAccounts();
  }
}
