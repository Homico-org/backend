import {
  Controller,
  Post,
  Get,
  Body,
  Headers,
  Param,
  Query,
  Req,
  Res,
  UseGuards,
  Delete,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
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
    @Query('anonymousId') anonymousId?: string,
  ) {
    const session = await this.aiAssistantService.findActiveSession(
      user?.userId,
      anonymousId,
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
        messages: fullSession.messages.map((msg) => ({
          role: msg.role,
          content: msg.content,
          createdAt: (msg as any).createdAt,
          richContent: msg.metadata?.richContent,
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
      messages: session.messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
        createdAt: (msg as any).createdAt,
        richContent: msg.metadata?.richContent,
        suggestedActions: msg.metadata?.suggestedActions,
      })),
      createdAt: (session as any).createdAt,
    };
  }

  @Post('sessions/:sessionId/messages')
  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  // Layered throttles: per-minute keeps conversational pace sane,
  // burst stops mass-flooding in seconds, ai-cost caps the daily spend
  // ceiling per IP. All three must pass.
  @Throttle({
    default: { limit: 20, ttl: 60000 },
    burst: { limit: 5, ttl: 10000 },
    'ai-cost': { limit: 200, ttl: 24 * 60 * 60_000 },
  })
  @ApiOperation({ summary: 'Send a message and get AI response' })
  @ApiResponse({ status: 200, description: 'AI response' })
  @ApiResponse({ status: 404, description: 'Session not found' })
  async sendMessage(
    @Param('sessionId') sessionId: string,
    @Body() dto: SendMessageDto,
    @CurrentUser() user: any,
    @Headers('x-amplitude-device-id') amplitudeDeviceId?: string,
  ) {
    const result = await this.aiAssistantService.sendMessage(
      sessionId,
      dto,
      user?.userId,
      amplitudeDeviceId,
    );

    return {
      response: result.response,
      suggestedActions: result.suggestedActions,
      richContent: result.richContent,
    };
  }

  /**
   * Streaming variant of sendMessage. Returns text/event-stream so the
   * client can render tokens + tool-status chips as they happen instead
   * of waiting several seconds for the full response.
   *
   * Event types are documented on StreamEvent in ai-assistant.service.ts.
   * Each event is JSON-encoded and emitted as `data: <json>\n\n`.
   *
   * Same throttle stack as the blocking endpoint - streaming doesn't
   * reduce OpenAI cost, just shifts when bytes arrive.
   */
  @Post('sessions/:sessionId/messages/stream')
  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Throttle({
    default: { limit: 20, ttl: 60000 },
    burst: { limit: 5, ttl: 10000 },
    'ai-cost': { limit: 200, ttl: 24 * 60 * 60_000 },
  })
  @ApiOperation({ summary: 'Send a message and get AI response as SSE stream' })
  async sendMessageStream(
    @Param('sessionId') sessionId: string,
    @Body() dto: SendMessageDto,
    @CurrentUser() user: any,
    @Req() req: Request,
    @Res() res: Response,
    @Headers('x-amplitude-device-id') amplitudeDeviceId?: string,
  ): Promise<void> {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // disable nginx/render buffering
    res.flushHeaders?.();

    // Client disconnect -> abort the generator so we stop spending tokens.
    const abortController = new AbortController();
    req.on('close', () => {
      if (!res.writableEnded) abortController.abort();
    });

    try {
      const stream = this.aiAssistantService.sendMessageStream(
        sessionId,
        dto,
        user?.userId,
        amplitudeDeviceId,
        abortController.signal,
      );
      for await (const event of stream) {
        if (res.writableEnded) break;
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }
    } catch (err) {
      // Last-ditch error frame so the client doesn't hang on a half-closed
      // stream. Most errors are caught inside the generator and emitted as
      // type:'error' events; this only fires on truly unexpected failures.
      if (!res.writableEnded) {
        const message = err instanceof Error ? err.message : 'unknown';
        res.write(
          `data: ${JSON.stringify({ type: 'error', errorType: 'server_error', message })}\n\n`,
        );
      }
    } finally {
      res.end();
    }
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
