import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { InviteService } from "./invite.service";
import { ActivateInviteDto } from "./dto/activate-invite.dto";

@Controller("invite")
export class InviteController {
  constructor(private inviteService: InviteService) {}

  @Get("stats/overview")
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
