import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { PassportStrategy } from '@nestjs/passport';
import { Model } from 'mongoose';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { User } from '../../users/schemas/user.schema';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    @InjectModel(User.name) private userModel: Model<User>,
  ) {
    const secret =
      configService.get<string>('JWT_SECRET') ||
      (process.env.NODE_ENV === 'production' ? undefined : 'dev-jwt-secret');
    if (!secret) {
      // Fail fast in production, but allow local dev without a .env
      throw new Error('JWT_SECRET is required in production');
    }
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(payload: any) {
    const userExists = await this.userModel.exists({ _id: payload.sub });
    if (!userExists) {
      throw new UnauthorizedException();
    }
    return {
      // `userId` is the canonical field every controller now uses. `sub` is
      // kept as a defensive alias (same value) so that if a controller is ever
      // written with `req.user.sub` again it can't silently `findById(undefined)`
      // -> 404 "User not found" (the bug this guards against).
      userId: payload.sub,
      sub: payload.sub,
      email: payload.email,
      role: payload.role,
    };
  }
}
