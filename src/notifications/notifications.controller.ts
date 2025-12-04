import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { NotificationsService } from './notifications.service';
import { MarkReadDto } from './dto/create-notification.dto';

@ApiTags('notifications')
@Controller('notifications')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all notifications for current user' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  @ApiQuery({ name: 'unreadOnly', required: false, type: Boolean })
  async findAll(
    @Request() req,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
    @Query('unreadOnly') unreadOnly?: boolean,
  ) {
    return this.notificationsService.findAllForUser(req.user.userId, {
      limit: limit ? parseInt(String(limit)) : 20,
      offset: offset ? parseInt(String(offset)) : 0,
      unreadOnly: unreadOnly === true || unreadOnly === 'true' as any,
    });
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Get unread notification count' })
  async getUnreadCount(@Request() req) {
    const count = await this.notificationsService.getUnreadCount(req.user.userId);
    return { unreadCount: count };
  }

  @Post('mark-read')
  @ApiOperation({ summary: 'Mark notifications as read' })
  async markAsRead(@Request() req, @Body() markReadDto: MarkReadDto) {
    if (markReadDto.markAll) {
      return this.notificationsService.markAllAsRead(req.user.userId);
    }
    return this.notificationsService.markAsRead(req.user.userId, markReadDto.notificationIds);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a notification' })
  async delete(@Request() req, @Param('id') id: string) {
    const deleted = await this.notificationsService.delete(req.user.userId, id);
    return { success: deleted };
  }

  @Delete()
  @ApiOperation({ summary: 'Delete all notifications' })
  async deleteAll(@Request() req) {
    return this.notificationsService.deleteAll(req.user.userId);
  }
}
