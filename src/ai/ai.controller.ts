import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AiService } from './ai.service';
import { Throttle } from '@nestjs/throttler';
import {
  AnalyzeEstimateDto,
  CalculateRenovationDto,
  CompareEstimatesDto,
  GetPriceInfoDto,
  ChatDto,
  GenerateBioDto,
  AnalyzeProjectDto,
} from './dto/ai.dto';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('AI Tools')
@Controller('ai')
// AI endpoints can be expensive; keep a stricter limit than global default.
@Throttle({ default: { ttl: 60_000, limit: 30 } })
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('analyze-estimate')
  @Public() // Allow public access for the tool
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Analyze a contractor estimate using AI' })
  @ApiResponse({ status: 200, description: 'Estimate analysis result' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  async analyzeEstimate(@Body() dto: AnalyzeEstimateDto) {
    if (!dto.estimateText?.trim()) {
      throw new BadRequestException('Estimate text is required');
    }
    return this.aiService.analyzeEstimate(dto.estimateText, dto.locale || 'en');
  }

  @Post('calculate-renovation')
  @Public() // Allow public access for the tool
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Calculate renovation budget based on parameters' })
  @ApiResponse({ status: 200, description: 'Renovation calculation result' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  async calculateRenovation(@Body() dto: CalculateRenovationDto) {
    return this.aiService.calculateRenovation(
      {
        area: dto.area,
        rooms: dto.rooms,
        bathrooms: dto.bathrooms,
        renovationType: dto.renovationType,
        includeKitchen: dto.includeKitchen,
        includeFurniture: dto.includeFurniture,
        propertyType: dto.propertyType,
      },
      dto.locale || 'en',
    );
  }

  @Post('compare-estimates')
  @Public() // Allow public access for the tool
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Compare multiple contractor estimates' })
  @ApiResponse({ status: 200, description: 'Comparison result' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  async compareEstimates(@Body() dto: CompareEstimatesDto) {
    if (!dto.estimates || dto.estimates.length < 2) {
      throw new BadRequestException('At least 2 estimates are required for comparison');
    }
    if (dto.estimates.length > 5) {
      throw new BadRequestException('Maximum 5 estimates can be compared');
    }
    return this.aiService.compareEstimates(dto.estimates, dto.locale || 'en');
  }

  @Post('price-info')
  @Public() // Allow public access for the tool
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get market price information for a renovation item' })
  @ApiResponse({ status: 200, description: 'Price information result' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  async getPriceInfo(@Body() dto: GetPriceInfoDto) {
    if (!dto.item?.trim()) {
      throw new BadRequestException('Item is required');
    }
    return this.aiService.getPriceInfo(dto.item, dto.locale || 'en');
  }

  @Post('generate-bio')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Generate a professional bio from short user input' })
  @ApiResponse({ status: 200, description: 'Generated bio text' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  async generateBio(@Body() dto: GenerateBioDto) {
    if (!dto.prompt?.trim()) {
      throw new BadRequestException('Prompt is required');
    }
    const bio = await this.aiService.generateBio(dto.prompt, dto.locale || 'en');
    return { bio };
  }

  @Post('chat')
  @Public() // Allow public access for the tool
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Chat with AI renovation assistant' })
  @ApiResponse({ status: 200, description: 'Chat response' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  async chat(@Body() dto: ChatDto) {
    if (!dto.messages || dto.messages.length === 0) {
      throw new BadRequestException('At least one message is required');
    }
    const response = await this.aiService.chat(dto.messages, dto.locale || 'en');
    return { response };
  }

  @Post('analyze-project')
  @Public() // Allow public access for the tool
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Analyze project file or image and extract room/work configurations' })
  @ApiResponse({ status: 200, description: 'Project analysis result with room configurations' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  async analyzeProject(@Body() dto: AnalyzeProjectDto) {
    if (!dto.projectText?.trim() && !dto.imageBase64) {
      throw new BadRequestException('Either project text or image is required');
    }
    return this.aiService.analyzeProject(
      dto.projectText || '',
      dto.locale || 'en',
      dto.imageBase64,
      dto.imageMimeType,
    );
  }
}
