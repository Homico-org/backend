import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Patch,
} from '@nestjs/common';
import { MessageService } from './message.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('messages')
@UseGuards(JwtAuthGuard)
export class MessageController {
  constructor(private readonly messageService: MessageService) {}

  @Post()
  create(
    @CurrentUser() user: any,
    @Body() createMessageDto: CreateMessageDto,
  ) {
    return this.messageService.create(user.userId, user.role, createMessageDto);
  }

  @Get('conversation/:conversationId')
  findByConversation(
    @CurrentUser() user: any,
    @Param('conversationId') conversationId: string,
    @Query('limit') limit?: number,
    @Query('skip') skip?: number,
  ) {
    return this.messageService.findByConversation(conversationId, limit, skip);
  }

  @Patch(':id/read')
  markAsRead(@Param('id') id: string) {
    return this.messageService.markAsRead(id);
  }

  @Patch('conversation/:conversationId/read-all')
  markAllAsRead(
    @CurrentUser() user: any,
    @Param('conversationId') conversationId: string,
  ) {
    return this.messageService.markAllAsRead(conversationId, user.userId);
  }

  @Patch('conversation/:conversationId/delivered')
  markAsDelivered(
    @CurrentUser() user: any,
    @Param('conversationId') conversationId: string,
  ) {
    return this.messageService.markAsDelivered(conversationId, user.userId);
  }
}
