import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  Delete,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AiAssistantService } from './ai-assistant.service';
import { CreateSessionDto, SendMessageDto } from './dto/ai-assistant.dto';
import { Public } from '../common/decorators/public.decorator';
import { OptionalJwtAuthGuard } from '../common/guards/optional-jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('AI Assistant')
@Controller('ai-assistant')
export class AiAssistantController {
  constructor(private readonly aiAssistantService: AiAssistantService) {}

  @Post('sessions')
  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 10 sessions per minute
  @ApiOperation({ summary: 'Create a new chat session' })
  @ApiResponse({ status: 201, description: 'Session created successfully' })
  async createSession(
    @CurrentUser() user: any,
    @Body() dto: CreateSessionDto,
  ) {
    const session = await this.aiAssistantService.createSession(
      user?.userId || null,
      dto,
    );
    return {
      sessionId: session._id,
      status: session.status,
      createdAt: (session as any).createdAt,
    };
  }

  @Get('sessions/active')
  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Find active session for current user/visitor' })
  @ApiResponse({ status: 200, description: 'Active session or null' })
  async findActiveSession(
    @CurrentUser() user: any,
    @Body() body: { anonymousId?: string },
  ) {
    const session = await this.aiAssistantService.findActiveSession(
      user?.userId,
      body?.anonymousId,
    );

    if (!session) {
      return { session: null };
    }

    // Get full session with messages
    const fullSession = await this.aiAssistantService.getSession(
      (session as any)._id.toString(),
      user?.userId,
    );

    return {
      session: {
        sessionId: (fullSession as any)._id,
        status: fullSession.status,
        messageCount: fullSession.messageCount,
        messages: fullSession.messages.map(msg => ({
          role: msg.role,
          content: msg.content,
          createdAt: (msg as any).createdAt,
          suggestedActions: msg.metadata?.suggestedActions,
        })),
      },
    };
  }

  @Get('sessions/:sessionId')
  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Get chat session with messages' })
  @ApiResponse({ status: 200, description: 'Session with messages' })
  @ApiResponse({ status: 404, description: 'Session not found' })
  async getSession(
    @Param('sessionId') sessionId: string,
    @CurrentUser() user: any,
  ) {
    const session = await this.aiAssistantService.getSession(
      sessionId,
      user?.userId,
    );

    return {
      sessionId: (session as any)._id,
      status: session.status,
      messageCount: session.messageCount,
      messages: session.messages.map(msg => ({
        role: msg.role,
        content: msg.content,
        createdAt: (msg as any).createdAt,
        suggestedActions: msg.metadata?.suggestedActions,
      })),
      createdAt: (session as any).createdAt,
    };
  }

  @Post('sessions/:sessionId/messages')
  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Throttle({ default: { limit: 20, ttl: 60000 } }) // 20 messages per minute
  @ApiOperation({ summary: 'Send a message and get AI response' })
  @ApiResponse({ status: 200, description: 'AI response' })
  @ApiResponse({ status: 404, description: 'Session not found' })
  async sendMessage(
    @Param('sessionId') sessionId: string,
    @Body() dto: SendMessageDto,
    @CurrentUser() user: any,
  ) {
    const result = await this.aiAssistantService.sendMessage(
      sessionId,
      dto,
      user?.userId,
    );

    return {
      response: result.response,
      suggestedActions: result.suggestedActions,
    };
  }

  @Delete('sessions/:sessionId')
  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Close a chat session' })
  @ApiResponse({ status: 200, description: 'Session closed' })
  async closeSession(
    @Param('sessionId') sessionId: string,
    @CurrentUser() user: any,
  ) {
    await this.aiAssistantService.closeSession(sessionId, user?.userId);
    return { message: 'Session closed' };
  }
}
