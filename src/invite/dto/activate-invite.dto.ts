import { IsOptional, IsString, MinLength } from "class-validator";

export class ActivateInviteDto {
  @IsString()
  token: string;

  @IsString()
  phone: string;

  @IsString()
  code: string;

  @IsString()
  @MinLength(6)
  @IsOptional()
  password?: string;
}
