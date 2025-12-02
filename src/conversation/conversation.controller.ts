import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { IsString, IsNotEmpty } from 'class-validator';
import { ConversationService } from './conversation.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

class StartConversationDto {
  @IsString()
  @IsNotEmpty()
  proId: string;

  @IsString()
  @IsNotEmpty()
  message: string;
}

@Controller('conversations')
@UseGuards(JwtAuthGuard)
export class ConversationController {
  constructor(private readonly conversationService: ConversationService) {}

  @Get()
  findByUser(@CurrentUser() user: any) {
    return this.conversationService.findByUser(user.userId, user.role);
  }

  @Post('start')
  async startConversation(
    @CurrentUser() user: any,
    @Body() dto: StartConversationDto,
  ) {
    return this.conversationService.startConversation(user.userId, dto.proId, dto.message);
  }
}
