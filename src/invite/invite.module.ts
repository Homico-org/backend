import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { JwtModule } from "@nestjs/jwt";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { InviteController } from "./invite.controller";
import { InviteService } from "./invite.service";
import {
  InviteToken,
  InviteTokenSchema,
} from "./schemas/invite-token.schema";
import { User, UserSchema } from "../users/schemas/user.schema";
import { VerificationModule } from "../verification/verification.module";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: InviteToken.name, schema: InviteTokenSchema },
      { name: User.name, schema: UserSchema },
    ]),
    VerificationModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret:
          configService.get<string>("JWT_SECRET") ||
          (process.env.NODE_ENV === "production"
            ? undefined
            : "dev-jwt-secret"),
        signOptions: {
          expiresIn: configService.get<string>("JWT_EXPIRES_IN") || "7d",
        },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [InviteController],
  providers: [InviteService],
})
export class InviteModule {}
