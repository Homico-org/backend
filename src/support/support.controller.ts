import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SupportService } from './support.service';
import { CreateTicketDto, SendMessageDto, UpdateTicketStatusDto, AssignTicketDto, ContactFormDto } from './dto/create-ticket.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { TicketStatus } from './schemas/support-ticket.schema';
import { UserRole } from '../users/schemas/user.schema';

@Controller('support')
export class SupportController {
  constructor(private readonly supportService: SupportService) {}

  // Public contact endpoint (no auth required)
  @Post('contact')
  submitContactForm(@Body() contactFormDto: ContactFormDto) {
    return this.supportService.createContactTicket(contactFormDto);
  }

  // User endpoints
  @Post('tickets')
  @UseGuards(JwtAuthGuard)
  createTicket(
    @CurrentUser() user: any,
    @Body() createTicketDto: CreateTicketDto,
  ) {
    return this.supportService.createTicket(user.userId, createTicketDto);
  }

  @Get('tickets/my')
  @UseGuards(JwtAuthGuard)
  getUserTickets(@CurrentUser() user: any) {
    return this.supportService.getUserTickets(user.userId);
  }

  @Get('tickets/:id')
  @UseGuards(JwtAuthGuard)
  getTicket(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ) {
    const isAdmin = user.role === 'admin';
    return this.supportService.getTicketById(id, user.userId, isAdmin);
  }

  @Post('tickets/:id/messages')
  @UseGuards(JwtAuthGuard)
  sendMessage(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body() dto: SendMessageDto,
  ) {
    const isAdmin = user.role === 'admin';
    return this.supportService.sendMessage(id, user.userId, dto, isAdmin);
  }

  @Patch('tickets/:id/read')
  @UseGuards(JwtAuthGuard)
  markAsRead(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ) {
    const isAdmin = user.role === 'admin';
    return this.supportService.markAsRead(id, user.userId, isAdmin);
  }

  // Admin endpoints
  @Get('admin/tickets')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  getAllTickets(
    @Query('status') status?: TicketStatus,
    @Query('priority') priority?: string,
    @Query('hasUnread') hasUnread?: string,
  ) {
    return this.supportService.getAllTickets({
      status,
      priority,
      hasUnread: hasUnread === 'true',
    });
  }

  @Get('admin/stats')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  getTicketStats() {
    return this.supportService.getTicketStats();
  }

  @Patch('admin/tickets/:id/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  updateTicketStatus(
    @Param('id') id: string,
    @Body() dto: UpdateTicketStatusDto,
  ) {
    return this.supportService.updateTicketStatus(id, dto);
  }

  @Patch('admin/tickets/:id/assign')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  assignTicket(
    @Param('id') id: string,
    @Body() dto: AssignTicketDto,
  ) {
    return this.supportService.assignTicket(id, dto.adminId);
  }
}
