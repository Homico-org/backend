import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../common/guards/optional-jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { UserRole } from '../users/schemas/user.schema';
import { AssistedJobService } from './assisted-job.service';
import { CreateAssistedJobDto } from './dto/create-assisted-job.dto';
import { ApproveAssistedJobDto } from './dto/approve-assisted-job.dto';
import { SendAssistedJobLinkDto } from './dto/send-assisted-job-link.dto';

@Controller('assisted-jobs')
export class AssistedJobController {
  constructor(private readonly service: AssistedJobService) {}

  // ── Admin ──
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  create(
    @CurrentUser() user: { userId: string },
    @Body() dto: CreateAssistedJobDto,
  ) {
    return this.service.create(user.userId, dto);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  list() {
    return this.service.list();
  }

  @Post(':id/cancel')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  cancel(@Param('id') id: string) {
    return this.service.cancel(id);
  }

  @Post(':id/send')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  send(@Param('id') id: string, @Body() dto: SendAssistedJobLinkDto) {
    return this.service.sendLink(id, dto.channel);
  }

  // ── Public (client opens the shared link before signing in) ──
  // Optional auth: if the viewer is already signed in as the client, the
  // preview says so (viewerIsClient) and the page skips the password step.
  @Get(':token')
  @UseGuards(OptionalJwtAuthGuard)
  getByToken(
    @Param('token') token: string,
    @CurrentUser() user?: { userId?: string },
  ) {
    return this.service.getByToken(token, user?.userId);
  }

  // Optional auth: if the viewer is already signed in as the draft's client,
  // we skip the password step (see the service).
  @Post(':token/approve')
  @UseGuards(OptionalJwtAuthGuard)
  approve(
    @Param('token') token: string,
    @Body() dto: ApproveAssistedJobDto,
    @Req() req: Request,
    @CurrentUser() user?: { userId?: string },
  ) {
    return this.service.approve(token, dto, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      authUserId: user?.userId,
    });
  }
}
