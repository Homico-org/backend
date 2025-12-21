import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { LoginDto } from './dto/login.dto';
import { GoogleRegisterDto } from './dto/google-register.dto';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
  ) {}

  async register(createUserDto: CreateUserDto) {
    const user = await this.usersService.create(createUserDto);

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
      },
    };
  }

  async login(loginDto: LoginDto) {
    // Find user by email or phone
    const user = await this.usersService.findByEmailOrPhone(loginDto.identifier);

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await this.usersService.validatePassword(
      loginDto.password,
      user.password,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.usersService.updateLastLogin(user._id.toString());

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
      },
    };
  }

  async validateUser(userId: string) {
    return this.usersService.findById(userId);
  }

  async getDemoAccounts() {
    return this.usersService.getDemoAccounts();
  }

  async googleRegister(googleRegisterDto: GoogleRegisterDto) {
    // Check if user already exists with this Google ID
    const existingGoogleUser = await this.usersService.findByGoogleId(googleRegisterDto.googleId);
    if (existingGoogleUser) {
      // User already exists, log them in
      await this.usersService.updateLastLogin(existingGoogleUser._id.toString());

      const payload = {
        sub: existingGoogleUser._id,
        email: existingGoogleUser.email,
        role: existingGoogleUser.role,
      };

      return {
        access_token: this.jwtService.sign(payload),
        user: {
          id: existingGoogleUser._id,
          uid: existingGoogleUser.uid,
          name: existingGoogleUser.name,
          email: existingGoogleUser.email,
          phone: existingGoogleUser.phone,
          role: existingGoogleUser.role,
          avatar: existingGoogleUser.avatar,
          city: existingGoogleUser.city,
          selectedCategories: existingGoogleUser.selectedCategories || [],
          selectedSubcategories: existingGoogleUser.selectedSubcategories || [],
        },
      };
    }

    // Create new user with Google data
    const user = await this.usersService.createGoogleUser({
      googleId: googleRegisterDto.googleId,
      email: googleRegisterDto.email,
      name: googleRegisterDto.name,
      phone: googleRegisterDto.phone,
      avatar: googleRegisterDto.picture,
      role: googleRegisterDto.role,
      city: googleRegisterDto.city,
      selectedCategories: googleRegisterDto.selectedCategories,
      selectedSubcategories: googleRegisterDto.selectedSubcategories,
      isPhoneVerified: googleRegisterDto.isPhoneVerified,
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
      },
    };
  }
}
