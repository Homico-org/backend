import { Controller, Get, Post, Body, UseGuards, Param, Patch } from '@nestjs/common';
import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ConversationService } from './conversation.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

class StartConversationDto {
  @IsString()
  @IsNotEmpty()
  recipientId: string; // proProfileId for clients, userId for pros

  @IsString()
  @IsOptional()
  message?: string;
}

@Controller('conversations')
@UseGuards(JwtAuthGuard)
export class ConversationController {
  constructor(private readonly conversationService: ConversationService) {}

  @Get()
  findByUser(@CurrentUser() user: any) {
    return this.conversationService.findByUser(user.userId, user.role);
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.conversationService.findById(id);
  }

  @Post('start')
  async startConversation(
    @CurrentUser() user: any,
    @Body() dto: StartConversationDto,
  ) {
    if (dto.message) {
      return this.conversationService.startConversation(
        user.userId,
        dto.recipientId,
        dto.message,
        user.role,
      );
    } else {
      // Just find or create without sending a message
      const conversation = await this.conversationService.findOrStartConversation(
        user.userId,
        dto.recipientId,
        user.role,
      );
      return { conversation };
    }
  }

  @Patch(':id/read')
  async markAsRead(
    @CurrentUser() user: any,
    @Param('id') id: string,
  ) {
    await this.conversationService.resetUnreadCount(id, user.role);
    return { success: true };
  }
}
