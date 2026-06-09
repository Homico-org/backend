import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import {
  getMarketContext,
  marketHeader,
  currencyHint,
  type MarketContext,
} from './market-context';

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

export interface ProjectAnalysisRoom {
  name: string;
  type: 'living' | 'bedroom' | 'bathroom' | 'kitchen' | 'hallway' | 'balcony';
  length: number;
  width: number;
  height: number;
  doors: number;
  windows: number;
  flooring: 'laminate' | 'parquet' | 'tile' | 'vinyl' | 'carpet';
  walls: 'paint' | 'wallpaper' | 'tile' | 'decorative_plaster';
  ceiling: 'paint' | 'stretch' | 'drywall' | 'suspended';
}

export interface ProjectAnalysisResult {
  rooms: ProjectAnalysisRoom[];
  totalArea: number;
  workSuggestions: {
    demolition: boolean;
    electrical: {
      outlets: number;
      switches: number;
      lightingPoints: number;
      acPoints: number;
    };
    plumbing: {
      toilets: number;
      sinks: number;
      showers: number;
      bathtubs: number;
    };
    heating: {
      radiators: number;
      underfloorArea: number;
    };
    doorsWindows: {
      interiorDoors: number;
      entranceDoor: boolean;
    };
  };
  qualityLevel: 'economy' | 'standard' | 'premium';
  notes: string[];
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
    country?: string,
  ): Promise<EstimateAnalysisResult> {
    if (!this.isConfigured()) {
      throw new Error('OpenAI API key not configured');
    }

    const langInstruction = locale === 'ka'
      ? 'პასუხი გამოიტანე ქართულად.'
      : locale === 'ru'
      ? 'Отвечай на русском языке.'
      : 'Respond in English.';

    const market = getMarketContext(country);
    // Tbilisi gets the detailed labor-rate block because we have curated
    // 2024-2025 data for it. Other markets get the marketplace header
    // and let the model draw on its general training for the region;
    // claiming hard numbers we can't back up would be worse than letting
    // the model say "I don't have precise local data" when relevant.
    const referenceBlock = market.referencePrices
      ? `${market.referencePrices}\n\nNote: Prices vary by ±20% based on quality, complexity, and contractor experience.`
      : `${marketHeader(market)} Use your general knowledge of ${market.city} renovation costs; if you don't have confident local data for an item, say so rather than fabricating numbers.`;

    const systemPrompt = `You are an expert renovation cost analyst specializing in the ${market.city}, ${market.country} market.
You analyze contractor estimates with deep knowledge of 2024-2025 local prices.
${langInstruction}

IMPORTANT PARSING INSTRUCTIONS:
- The input may be from Excel files with various column formats (item, quantity, unit price, total)
- Look for patterns like: item name - quantity - unit price - total price
- Georgian text may include: კვ.მ (m²), ცალი (pieces), გრძ.მ (linear m), კომპლექტი (set)
- Prices are in ${market.currencyName} (${market.currencyCode}, symbol ${market.currencySymbol}). Parse numbers even if formatted with spaces or commas
- Sum up all line items to calculate total if not explicitly stated
- Identify work categories like electrical, plumbing, plastering, painting, etc.

${referenceBlock}`;

    const userPrompt = `Carefully analyze this contractor estimate/ხარჯთაღრიცხვა:

${estimateText}

ANALYSIS STEPS:
1. Parse each line item, identifying: work type, quantity, unit, unit price, total price
2. Compare each item against market reference prices
3. Calculate the grand total from all line items
4. Identify any missing essential work items
5. Flag unusually high or low prices (>30% deviation from market)

Respond ONLY with a valid JSON object:
{
  "summary": "2-3 sentence overall assessment of the estimate",
  "overallAssessment": "fair" | "expensive" | "cheap" | "mixed",
  "totalEstimated": <number - sum of all items from the estimate>,
  "totalMarketAverage": <number - what this work should cost at market average>,
  "savings": <number - positive if estimate is overpriced, negative if it's a good deal>,
  "lineItems": [
    {
      "item": "work item name (translate to response language if needed)",
      "estimatedPrice": <number - price from estimate>,
      "marketPrice": <number - fair market price for this item>,
      "assessment": "fair" | "high" | "low",
      "note": "brief explanation if price deviates significantly"
    }
  ],
  "recommendations": ["specific actionable advice 1", "specific actionable advice 2", ...],
  "redFlags": ["concerning items, missing work, or suspicious pricing patterns"]
}

Important: Extract ALL line items from the estimate. If quantities are specified, calculate total = quantity × unit price.`;

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
    country?: string,
  ): Promise<RenovationCalculatorResult> {
    if (!this.isConfigured()) {
      throw new Error('OpenAI API key not configured');
    }

    const market = getMarketContext(country);
    const tierBlock = market.tierRanges
      ? `Price ranges per m² in ${market.city} (2024):
- Cosmetic renovation: ${market.tierRanges.cosmetic}
- Standard renovation: ${market.tierRanges.standard}
- Full renovation: ${market.tierRanges.full}
- Luxury renovation: ${market.tierRanges.luxury}`
      : `Use your general knowledge of ${market.city} renovation tier pricing.`;

    const systemPrompt = `You are an expert renovation cost estimator in ${market.city}, ${market.country}.
Provide accurate cost estimates based on 2024 market prices in ${market.currencyName} (${market.currencyCode}).
Always respond in ${locale === 'ka' ? 'Georgian' : locale === 'ru' ? 'Russian' : 'English'}.

${tierBlock}`;

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
  "totalEstimate": <average total in ${market.currencyCode}>,
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
    country?: string,
  ): Promise<CompareEstimatesResult> {
    if (!this.isConfigured()) {
      throw new Error('OpenAI API key not configured');
    }

    const langInstruction = locale === 'ka'
      ? 'პასუხი გამოიტანე ქართულად.'
      : locale === 'ru'
      ? 'Отвечай на русском языке.'
      : 'Respond in English.';

    const market = getMarketContext(country);
    const systemPrompt = `You are an expert renovation cost analyst specializing in the ${market.city}, ${market.country} market.
You compare contractor estimates objectively and provide actionable insights.
${langInstruction}

COMPARISON CRITERIA:
1. Total Price - overall cost comparison
2. Completeness - are all necessary work items included?
3. Price Fairness - are individual items priced at market rate?
4. Transparency - are quantities and unit prices clearly specified?
5. Hidden Costs - are there likely additional costs not mentioned?

IMPORTANT:
- Parse prices in ${market.currencyName} (${market.currencyCode}, symbol ${market.currencySymbol}), handle various number formats
- Consider that cheaper isn't always better - check for missing items
- Flag estimates that seem incomplete or suspiciously cheap`;

    const estimatesText = estimates
      .map((e, i) => `\n=== ESTIMATE ${i + 1}: ${e.name} ===\n${e.content}`)
      .join('\n');

    const userPrompt = `Compare these ${estimates.length} contractor estimates for a renovation project:
${estimatesText}

ANALYSIS STEPS:
1. Parse each estimate to extract line items and calculate totals
2. Compare equivalent items across estimates (e.g., electrical points, plastering per m²)
3. Identify which estimate offers the best value (not just lowest price)
4. Note any missing items in cheaper estimates
5. Determine the overall winner based on price-to-value ratio

Respond ONLY with valid JSON:
{
  "winner": {
    "index": <0-based index of winning estimate>,
    "name": "contractor/estimate name",
    "reason": "clear explanation of why this is the best choice (2-3 sentences)"
  },
  "comparison": [
    {
      "name": "estimate name",
      "totalPrice": <calculated total in ${market.currencyCode} as number>,
      "priceScore": <1-10, where 10 is most competitive>,
      "valueScore": <1-10, considering completeness and fairness>,
      "pros": ["specific advantage 1", "specific advantage 2", ...],
      "cons": ["specific concern 1", "specific concern 2", ...]
    }
  ],
  "summary": "2-3 sentence overview of the comparison results",
  "recommendation": "specific actionable recommendation for the client"
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
    country?: string,
  ): Promise<PriceCheckResult> {
    if (!this.isConfigured()) {
      throw new Error('OpenAI API key not configured');
    }

    const market = getMarketContext(country);
    const systemPrompt = `You are an expert on renovation costs in ${market.city}, ${market.country}.
Provide accurate 2024 market prices in ${market.currencyName} (${market.currencyCode}).
Always respond in ${locale === 'ka' ? 'Georgian' : locale === 'ru' ? 'Russian' : 'English'}.`;

    const userPrompt = `What is the market price for "${item}" in the ${market.city} renovation market?

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
   * Analyze project file and extract room/work configurations
   * Supports both text content and images (floor plans, blueprints)
   */
  async analyzeProject(
    projectText: string,
    locale: string = 'en',
    imageBase64?: string,
    imageMimeType?: string,
    country?: string,
  ): Promise<ProjectAnalysisResult> {
    if (!this.isConfigured()) {
      throw new Error('OpenAI API key not configured');
    }

    const langInstruction = locale === 'ka'
      ? 'CRITICAL: The "notes" array MUST be written in Georgian language (ქართულად). Example: ["გაითვალისწინეთ ტენიანობისგან დამცავი მასალები სააბაზანოში", "უზრუნველყავით სათანადო ვენტილაცია"]'
      : locale === 'ru'
      ? 'CRITICAL: The "notes" array MUST be written in Russian language. Example: ["Используйте влагостойкие материалы в ванной", "Обеспечьте хорошую вентиляцию"]'
      : 'Write notes in English.';

    const market = getMarketContext(country);
    const systemPrompt = `You are an expert at analyzing apartment/house project documents and floor plans for the ${market.city}, ${market.country} renovation market.
Extract room information and suggest renovation work configurations.
${langInstruction}

ROOM TYPE MAPPING:
- მისაღები/гостиная/living room/salon -> "living"
- საძინებელი/спальня/bedroom -> "bedroom"
- სააბაზანო/აბაზანა/ванная/bathroom/WC/toilet -> "bathroom"
- სამზარეულო/кухня/kitchen -> "kitchen"
- დერეფანი/коридор/hallway/corridor -> "hallway"
- აივანი/балкон/balcony/terrace -> "balcony"

MATERIAL SUGGESTIONS based on room type:
- Bathroom/Kitchen: tile flooring, tile/paint walls
- Living/Bedroom: laminate/parquet flooring, paint walls
- Hallway: laminate/tile flooring, paint walls
- Balcony: tile flooring, paint walls

STANDARD DIMENSIONS if not specified:
- Ceiling height: ${market.typicalCeilingHeight ?? '2.7-3.0m'}
- Doors: 1 per room (2 for living room), Windows: 1-2 per room

ELECTRICAL ESTIMATES per room type:
- Living room: 6-8 outlets, 2-3 switches, 3-4 lights
- Bedroom: 4-6 outlets, 2 switches, 2-3 lights
- Kitchen: 8-10 outlets, 2-3 switches, 3-4 lights
- Bathroom: 2-3 outlets, 1-2 switches, 2-3 lights
- Hallway: 2-3 outlets, 2-3 switches, 2-3 lights`;

    const userPromptText = imageBase64
      ? `Analyze this apartment/house floor plan image and extract room configurations.

Look for:
- Room labels, names, or numbers
- Dimension annotations (in meters or centimeters)
- Door and window placements
- Room shapes and relative sizes
- Kitchen and bathroom locations (often have fixtures drawn)
- Any text annotations or legends

${projectText ? `Additional context from document:\n${projectText}` : ''}`
      : `Analyze this apartment/house project document and extract room configurations:

${projectText}`;

    const analysisInstructions = `
Parse all rooms with their dimensions (if available) and suggest appropriate:
- Room types and names
- Dimensions (length, width, height) - estimate if not specified based on typical sizes
- Number of doors and windows per room
- Flooring, wall, and ceiling materials appropriate for each room type
- Electrical points (outlets, switches, lights)
- Plumbing fixtures for bathrooms/kitchen
- Heating requirements

Respond ONLY with valid JSON:
{
  "rooms": [
    {
      "name": "room name (e.g., 'Living Room', 'Master Bedroom')",
      "type": "living" | "bedroom" | "bathroom" | "kitchen" | "hallway" | "balcony",
      "length": <number in meters>,
      "width": <number in meters>,
      "height": <number in meters, default 2.7>,
      "doors": <number>,
      "windows": <number>,
      "flooring": "laminate" | "parquet" | "tile" | "vinyl" | "carpet",
      "walls": "paint" | "wallpaper" | "tile" | "decorative_plaster",
      "ceiling": "paint" | "stretch" | "drywall" | "suspended"
    }
  ],
  "totalArea": <sum of all room floor areas>,
  "workSuggestions": {
    "demolition": <true if renovation involves removing old finishes>,
    "electrical": {
      "outlets": <total outlets>,
      "switches": <total switches>,
      "lightingPoints": <total light points>,
      "acPoints": <AC units needed, typically 1 per 20-25m²>
    },
    "plumbing": {
      "toilets": <number>,
      "sinks": <number>,
      "showers": <number>,
      "bathtubs": <number>
    },
    "heating": {
      "radiators": <number, typically 1 per room except bathroom>,
      "underfloorArea": <m² for underfloor heating, 0 if not needed>
    },
    "doorsWindows": {
      "interiorDoors": <number>,
      "entranceDoor": <true/false>
    }
  },
  "qualityLevel": "economy" | "standard" | "premium",
  "notes": ["observation 1", "suggestion 2", ...]
}`;

    const userPrompt = userPromptText + analysisInstructions;

    try {
      // Build message content - include image if provided
      const messageContent: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [];

      if (imageBase64 && imageMimeType) {
        messageContent.push({
          type: 'image_url',
          image_url: {
            url: `data:${imageMimeType};base64,${imageBase64}`,
            detail: 'high',
          },
        });
      }

      messageContent.push({
        type: 'text',
        text: userPrompt,
      });

      // Use gpt-4o for vision, gpt-4o-mini for text-only
      const model = imageBase64 ? 'gpt-4o' : 'gpt-4o-mini';

      const response = await this.openai.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: messageContent },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
        max_tokens: 4096,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response from OpenAI');
      }

      return JSON.parse(content) as ProjectAnalysisResult;
    } catch (error) {
      this.logger.error('Error analyzing project:', error);
      throw error;
    }
  }

  /**
   * Generate a professional bio/description from short user input
   */
  async generateBio(
    prompt: string,
    locale: string = 'en',
  ): Promise<string> {
    if (!this.isConfigured()) {
      throw new Error('OpenAI API key not configured');
    }

    const isKa = locale === 'ka';

    const systemPrompt = isKa
      ? `შენ ხარ პროფესიონალი კოპირაიტერი, რომელიც ეხმარება ხელოსნებს და სპეციალისტებს პროფილის აღწერის შექმნაში.
მომხმარებელი მოგაწვდის რამდენიმე სიტყვას ან მოკლე ფრაზას თავის შესახებ.
შენი ამოცანაა ეს გადააკეთო პროფესიონალურ, მიმზიდველ აღწერად.

წესები:
- დაწერე პირველ პირში ("მე ვარ...", "ჩემი გამოცდილება...")
- 3-5 წინადადება, მაქსიმუმ 400 სიმბოლო
- იყავი კონკრეტული და პროფესიონალური
- ხაზი გაუსვი გამოცდილებას და უნარებს
- ნუ გამოიგონებ ფაქტებს რაც მომხმარებელმა არ ახსენა
- მხოლოდ აღწერის ტექსტი დააბრუნე, სხვა არაფერი`
      : `You are a professional copywriter helping tradespeople and service professionals create their profile description.
The user will give you a few words or a short phrase about themselves.
Your job is to turn this into a professional, compelling bio.

Rules:
- Write in first person ("I am...", "My experience...")
- 3-5 sentences, max 400 characters
- Be specific and professional
- Highlight experience and skills
- Do not invent facts the user didn't mention
- Return only the bio text, nothing else`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
        temperature: 0.7,
        max_tokens: 500,
      });

      return response.choices[0]?.message?.content?.trim() || '';
    } catch (error) {
      this.logger.error('Error generating bio:', error);
      throw error;
    }
  }

  /**
   * General AI chat for renovation questions
   */
  async chat(
    messages: { role: 'user' | 'assistant'; content: string }[],
    locale: string = 'en',
    country?: string,
  ): Promise<string> {
    if (!this.isConfigured()) {
      throw new Error('OpenAI API key not configured');
    }

    const market = getMarketContext(country);
    const systemPrompt = `You are a helpful renovation assistant for homeowners in ${market.city}, ${market.country}.
You help with renovation planning, cost estimates, contractor selection, and general advice.
Be friendly, practical, and always consider local market conditions. ${currencyHint(market)}
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

  /**
   * Raw completion call for lightweight AI tasks
   */
  async completionRaw(params: {
    model: string;
    messages: { role: 'system' | 'user' | 'assistant'; content: string }[];
    temperature?: number;
    max_tokens?: number;
  }): Promise<string> {
    if (!this.isConfigured()) {
      throw new Error('OpenAI not configured');
    }

    const response = await this.openai.chat.completions.create({
      model: params.model,
      messages: params.messages,
      temperature: params.temperature ?? 0,
      max_tokens: params.max_tokens ?? 100,
    });

    return response.choices[0]?.message?.content || '';
  }
}
