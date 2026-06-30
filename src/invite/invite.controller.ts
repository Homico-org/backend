import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { InviteService } from "./invite.service";
import { ActivateInviteDto } from "./dto/activate-invite.dto";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { UserRole } from "../users/schemas/user.schema";

@Controller("invite")
export class InviteController {
  constructor(private inviteService: InviteService) {}

  @Get("stats/overview")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  getStats() {
    return this.inviteService.getStats();
  }

  @Get(":token")
  getInvite(@Param("token") token: string) {
    return this.inviteService.getInviteByToken(token);
  }

  @Post("activate")
  activate(@Body() dto: ActivateInviteDto) {
    return this.inviteService.activateInvite(dto);
  }
}
