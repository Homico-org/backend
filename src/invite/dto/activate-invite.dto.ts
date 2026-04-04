import { IsString } from "class-validator";

export class ActivateInviteDto {
  @IsString()
  token: string;

  @IsString()
  phone: string;

  @IsString()
  code: string;
}
