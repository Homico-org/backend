import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

export interface EstimateAnalysisResult {
  summary: string;
  overallAssessment: 'fair' | 'expensive' | 'cheap' | 'mixed';
  totalEstimated: number;
  totalMarketAverage: number;
  savings: number;
  lineItems: {
    item: string;
    estimatedPrice: number;
    marketPrice: number;
    assessment: 'fair' | 'high' | 'low';
    note?: string;
  }[];
  recommendations: string[];
  redFlags: string[];
}

export interface RenovationCalculatorResult {
  totalEstimate: number;
  breakdown: {
    category: string;
    minPrice: number;
    maxPrice: number;
    averagePrice: number;
    description: string;
  }[];
  timeline: string;
  tips: string[];
}

export interface CompareEstimatesResult {
  winner: {
    index: number;
    name: string;
    reason: string;
  };
  comparison: {
    name: string;
    totalPrice: number;
    priceScore: number;
    valueScore: number;
    pros: string[];
    cons: string[];
  }[];
  summary: string;
  recommendation: string;
}

export interface PriceCheckResult {
  item: string;
  minPrice: number;
  maxPrice: number;
  averagePrice: number;
  unit: string;
  factors: string[];
  tips: string[];
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private openai: OpenAI;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      this.logger.warn('OPENAI_API_KEY not configured. AI features will be disabled.');
    }
    this.openai = new OpenAI({
      apiKey: apiKey || 'dummy-key', // Use dummy to avoid constructor error
    });
  }

  private isConfigured(): boolean {
    return !!this.configService.get<string>('OPENAI_API_KEY');
  }

  /**
   * Analyze a contractor's estimate/quote
   */
  async analyzeEstimate(
    estimateText: string,
    locale: string = 'en',
  ): Promise<EstimateAnalysisResult> {
    if (!this.isConfigured()) {
      throw new Error('OpenAI API key not configured');
    }

    const systemPrompt = `You are an expert renovation cost analyst in Tbilisi, Georgia.
You have deep knowledge of local market prices for renovation work in 2024.
Analyze contractor estimates and provide honest, helpful feedback.
Always respond in ${locale === 'ka' ? 'Georgian' : locale === 'ru' ? 'Russian' : 'English'}.

Market reference prices in GEL (Georgian Lari) for Tbilisi:
- Painting (per m²): 8-15 GEL
- Flooring installation (per m²): 15-35 GEL
- Tile work (per m²): 25-50 GEL
- Electrical work (per point): 40-80 GEL
- Plumbing (per point): 50-120 GEL
- Plastering (per m²): 12-25 GEL
- Demolition (per m²): 10-20 GEL
- Drywall (per m²): 20-40 GEL
- Kitchen cabinet installation: 800-2000 GEL
- Bathroom renovation (full): 3000-8000 GEL`;

    const userPrompt = `Analyze this contractor estimate and provide a detailed assessment:

${estimateText}

Respond with a JSON object containing:
{
  "summary": "Brief overall assessment",
  "overallAssessment": "fair" | "expensive" | "cheap" | "mixed",
  "totalEstimated": <number - total from estimate>,
  "totalMarketAverage": <number - your market estimate>,
  "savings": <number - potential savings, negative if estimate is cheap>,
  "lineItems": [
    {
      "item": "item name",
      "estimatedPrice": <number>,
      "marketPrice": <number>,
      "assessment": "fair" | "high" | "low",
      "note": "optional explanation"
    }
  ],
  "recommendations": ["actionable recommendation 1", ...],
  "redFlags": ["any concerning items or missing details"]
}`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response from OpenAI');
      }

      return JSON.parse(content) as EstimateAnalysisResult;
    } catch (error) {
      this.logger.error('Error analyzing estimate:', error);
      throw error;
    }
  }

  /**
   * Calculate renovation budget based on parameters
   */
  async calculateRenovation(
    params: {
      area: number;
      rooms: number;
      bathrooms: number;
      renovationType: 'cosmetic' | 'standard' | 'full' | 'luxury';
      includeKitchen: boolean;
      includeFurniture: boolean;
      propertyType: 'apartment' | 'house';
    },
    locale: string = 'en',
  ): Promise<RenovationCalculatorResult> {
    if (!this.isConfigured()) {
      throw new Error('OpenAI API key not configured');
    }

    const systemPrompt = `You are an expert renovation cost estimator in Tbilisi, Georgia.
Provide accurate cost estimates based on 2024 market prices in GEL (Georgian Lari).
Always respond in ${locale === 'ka' ? 'Georgian' : locale === 'ru' ? 'Russian' : 'English'}.

Price ranges per m² in Tbilisi (2024):
- Cosmetic renovation: 150-300 GEL/m²
- Standard renovation: 350-550 GEL/m²
- Full renovation: 600-900 GEL/m²
- Luxury renovation: 1000-2000+ GEL/m²`;

    const userPrompt = `Calculate renovation estimate for:
- Area: ${params.area} m²
- Rooms: ${params.rooms}
- Bathrooms: ${params.bathrooms}
- Type: ${params.renovationType} renovation
- Property: ${params.propertyType}
- Kitchen renovation: ${params.includeKitchen ? 'Yes' : 'No'}
- Include furniture: ${params.includeFurniture ? 'Yes' : 'No'}

Respond with JSON:
{
  "totalEstimate": <average total in GEL>,
  "breakdown": [
    {
      "category": "category name",
      "minPrice": <number>,
      "maxPrice": <number>,
      "averagePrice": <number>,
      "description": "what's included"
    }
  ],
  "timeline": "estimated duration",
  "tips": ["money-saving tip 1", ...]
}`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response from OpenAI');
      }

      return JSON.parse(content) as RenovationCalculatorResult;
    } catch (error) {
      this.logger.error('Error calculating renovation:', error);
      throw error;
    }
  }

  /**
   * Compare multiple contractor estimates
   */
  async compareEstimates(
    estimates: { name: string; content: string }[],
    locale: string = 'en',
  ): Promise<CompareEstimatesResult> {
    if (!this.isConfigured()) {
      throw new Error('OpenAI API key not configured');
    }

    const systemPrompt = `You are an expert renovation cost analyst in Tbilisi, Georgia.
Compare contractor estimates objectively, considering price, completeness, and value.
Always respond in ${locale === 'ka' ? 'Georgian' : locale === 'ru' ? 'Russian' : 'English'}.`;

    const estimatesText = estimates
      .map((e, i) => `--- Estimate ${i + 1}: ${e.name} ---\n${e.content}`)
      .join('\n\n');

    const userPrompt = `Compare these contractor estimates:

${estimatesText}

Respond with JSON:
{
  "winner": {
    "index": <0-based index>,
    "name": "contractor name",
    "reason": "why this is the best choice"
  },
  "comparison": [
    {
      "name": "contractor name",
      "totalPrice": <number in GEL>,
      "priceScore": <1-10>,
      "valueScore": <1-10>,
      "pros": ["pro 1", ...],
      "cons": ["con 1", ...]
    }
  ],
  "summary": "overall comparison summary",
  "recommendation": "final recommendation"
}`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response from OpenAI');
      }

      return JSON.parse(content) as CompareEstimatesResult;
    } catch (error) {
      this.logger.error('Error comparing estimates:', error);
      throw error;
    }
  }

  /**
   * Get market price for a specific renovation item
   */
  async getPriceInfo(
    item: string,
    locale: string = 'en',
  ): Promise<PriceCheckResult> {
    if (!this.isConfigured()) {
      throw new Error('OpenAI API key not configured');
    }

    const systemPrompt = `You are an expert on renovation costs in Tbilisi, Georgia.
Provide accurate 2024 market prices in GEL (Georgian Lari).
Always respond in ${locale === 'ka' ? 'Georgian' : locale === 'ru' ? 'Russian' : 'English'}.`;

    const userPrompt = `What is the market price for "${item}" in Tbilisi renovation market?

Respond with JSON:
{
  "item": "item name",
  "minPrice": <number>,
  "maxPrice": <number>,
  "averagePrice": <number>,
  "unit": "per m²" or "per piece" or "per point" etc,
  "factors": ["factor affecting price 1", ...],
  "tips": ["how to save money 1", ...]
}`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response from OpenAI');
      }

      return JSON.parse(content) as PriceCheckResult;
    } catch (error) {
      this.logger.error('Error getting price info:', error);
      throw error;
    }
  }

  /**
   * General AI chat for renovation questions
   */
  async chat(
    messages: { role: 'user' | 'assistant'; content: string }[],
    locale: string = 'en',
  ): Promise<string> {
    if (!this.isConfigured()) {
      throw new Error('OpenAI API key not configured');
    }

    const systemPrompt = `You are a helpful renovation assistant for homeowners in Tbilisi, Georgia.
You help with renovation planning, cost estimates, contractor selection, and general advice.
Be friendly, practical, and always consider local market conditions.
Always respond in ${locale === 'ka' ? 'Georgian' : locale === 'ru' ? 'Russian' : 'English'}.
Keep responses concise but helpful.`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages.map((m) => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
          })),
        ],
        temperature: 0.7,
        max_tokens: 1000,
      });

      return response.choices[0]?.message?.content || 'Sorry, I could not generate a response.';
    } catch (error) {
      this.logger.error('Error in chat:', error);
      throw error;
    }
  }
}
