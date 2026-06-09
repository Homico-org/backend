import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import {
  ApproveScheduleDto,
  ProposeScheduleDto,
  RaiseMilestoneDisputeDto,
} from './dto/milestone-payment.dto';
import { MilestonePaymentsService } from './milestone-payments.service';

@Controller('milestone-payments')
@UseGuards(JwtAuthGuard)
export class MilestonePaymentsController {
  constructor(private readonly service: MilestonePaymentsService) {}

  // A pro's installments across all their projects (for /my-space).
  @Get('mine')
  listMine(@CurrentUser() user: any) {
    return this.service.listMine(user.userId);
  }

  // The pro's payable engagements (for the /my-space payments section).
  @Get('my-engagements')
  listMyEngagements(@CurrentUser() user: any) {
    return this.service.listMyEngagements(user.userId);
  }

  // Suggested schedule total for an engagement (from scope items / budget).
  @Get('suggest/:projectId/:engagementId')
  suggest(
    @CurrentUser() user: any,
    @Param('projectId') projectId: string,
    @Param('engagementId') engagementId: string,
  ) {
    return this.service.suggestSchedule(user.userId, projectId, engagementId);
  }

  // The schedule for one project (client sees all; a pro sees only theirs).
  @Get('project/:projectId')
  listForProject(
    @CurrentUser() user: any,
    @Param('projectId') projectId: string,
  ) {
    return this.service.listForProject(projectId, user.userId);
  }

  // Pro proposes a schedule for an engagement they're assigned to.
  @Post('propose')
  propose(@CurrentUser() user: any, @Body() dto: ProposeScheduleDto) {
    return this.service.proposeSchedule(
      user.userId,
      dto.projectId,
      dto.engagementId,
      dto.items,
    );
  }

  // Client approves the whole proposed schedule for an engagement.
  @Post('approve')
  approve(@CurrentUser() user: any, @Body() dto: ApproveScheduleDto) {
    return this.service.approveSchedule(
      user.userId,
      dto.projectId,
      dto.engagementId,
    );
  }

  @Post(':id/decline')
  decline(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.decline(user.userId, id);
  }

  @Delete(':id')
  remove(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.remove(user.userId, id);
  }

  // Client funds an approved installment -> returns BoG redirect URL.
  @Post(':id/fund')
  fund(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.fund(user.userId, id);
  }

  // Called by the return page after the user comes back from the gateway.
  @Post(':id/reconcile')
  reconcile(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.reconcile(user.userId, id);
  }

  // Pro marks the funded milestone done -> starts the 7-day review window.
  @Post(':id/mark-done')
  markDone(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.markDone(user.userId, id);
  }

  // Client confirms the work -> escrow pending_release.
  @Post(':id/confirm')
  confirm(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.clientConfirm(user.userId, id);
  }

  @Post(':id/dispute')
  dispute(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: RaiseMilestoneDisputeDto,
  ) {
    return this.service.raiseDispute(user.userId, id, dto);
  }
}
