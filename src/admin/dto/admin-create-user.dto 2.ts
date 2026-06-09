import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
  MinLength,
  ValidateIf,
} from "class-validator";
import { UserRole } from "../../users/schemas/user.schema";

/**
 * DTO for admin-initiated user creation. Differs from the public
 * `CreateUserDto` in two important ways:
 *
 * 1. `role` is required and explicitly allows `admin` (the public DTO doesn't
 *    let users self-register as admin).
 * 2. Either `email` OR `phone` is required - admins shouldn't be able to
 *    create accounts that can't be used for login.
 *
 * Uniqueness checks (email, phone) are delegated to UsersService.create()
 * which throws ConflictException on collisions.
 */
export class AdminCreateUserDto {
  @IsString()
  @IsNotEmpty()
  @Length(2, 100)
  name: string;

  // Either email or phone must be present - validated in the service.
  @ValidateIf((o: AdminCreateUserDto) => Boolean(o.email && o.email.length > 0))
  @IsEmail()
  @IsOptional()
  email?: string;

  @ValidateIf((o: AdminCreateUserDto) => Boolean(o.phone && o.phone.length > 0))
  @Matches(/^\+?\d{8,15}$/, {
    message:
      "phone must be in E.164 format like +995599000099 (8-15 digits, optional +)",
  })
  @IsOptional()
  phone?: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsEnum(UserRole, {
    message: "role must be one of: client, pro, company, admin",
  })
  role: UserRole;

  @IsOptional()
  @IsString()
  @Length(0, 80)
  city?: string;
}
