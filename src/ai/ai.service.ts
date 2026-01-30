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
  ): Promise<EstimateAnalysisResult> {
    if (!this.isConfigured()) {
      throw new Error('OpenAI API key not configured');
    }

    const langInstruction = locale === 'ka'
      ? 'პასუხი გამოიტანე ქართულად.'
      : locale === 'ru'
      ? 'Отвечай на русском языке.'
      : 'Respond in English.';

    const systemPrompt = `You are an expert renovation cost analyst specializing in Tbilisi, Georgia market.
You analyze contractor estimates (ხარჯთაღრიცხვა/смета) with deep knowledge of 2024-2025 local prices.
${langInstruction}

IMPORTANT PARSING INSTRUCTIONS:
- The input may be from Excel files with various column formats (item, quantity, unit price, total)
- Look for patterns like: item name - quantity - unit price - total price
- Georgian text may include: კვ.მ (m²), ცალი (pieces), გრძ.მ (linear m), კომპლექტი (set)
- Prices are in GEL (₾/ლარი). Parse numbers even if formatted with spaces or commas
- Sum up all line items to calculate total if not explicitly stated
- Identify work categories: ელექტრო (electrical), სანტექნიკა (plumbing), შელესვა (plastering), etc.

TBILISI MARKET REFERENCE PRICES (2024-2025, Labor + Basic Materials):

DEMOLITION & PREPARATION:
- დემონტაჟი/Demolition (per m²): 8-20 ₾
- Debris removal: 150-400 ₾ per load

ELECTRICAL (ელექტრიკა):
- ელექტრო წერტილი/Electrical point: 50-90 ₾
- Electrical panel installation: 350-600 ₾
- Chandelier installation: 40-80 ₾
- Floor heating cable (per m²): 35-60 ₾

PLUMBING (სანტექნიკა):
- სანტექნიკის წერტილი/Plumbing point: 80-150 ₾
- Toilet installation: 80-150 ₾
- Sink installation: 60-120 ₾
- Bathtub/shower installation: 150-350 ₾
- Water heater installation: 100-200 ₾
- Radiator installation: 100-180 ₾

WALLS (კედლები):
- შელესვა/Plastering (per m²): 25-45 ₾
- შპაკლი/Putty work (per m²): 12-22 ₾
- Primer application (per m²): 3-6 ₾
- თაბაშირმუყაოს კედელი/Drywall partition (per m²): 45-75 ₾

CEILING (ჭერი):
- თაბაშირმუყაოს ჭერი/Drywall ceiling (per m²): 40-70 ₾
- Multi-level ceiling (per m²): 80-150 ₾
- Stretch ceiling (per m²): 35-60 ₾

FLOORING (იატაკი):
- სტიაჟკა/Floor screed (per m²): 25-45 ₾
- ლამინატის დაგება/Laminate installation (per m²): 18-35 ₾
- Parquet installation (per m²): 30-55 ₾
- Self-leveling floor (per m²): 20-40 ₾

TILING (კაფელი):
- Floor tiles (per m²): 35-65 ₾
- Wall tiles (per m²): 35-70 ₾
- Mosaic work (per m²): 70-120 ₾

PAINTING (შეღებვა):
- კედლის შეღებვა/Wall painting (per m²): 8-18 ₾
- Ceiling painting (per m²): 10-20 ₾
- Decorative painting (per m²): 25-50 ₾

DOORS & WINDOWS (კარები და ფანჯრები):
- Interior door installation: 120-250 ₾
- Entrance door installation: 200-400 ₾
- Window installation: 80-150 ₾
- Windowsill installation: 40-80 ₾

OTHER:
- პლინტუსი/Baseboard installation (per linear m): 8-18 ₾
- Balcony glazing (per m²): 150-350 ₾
- კონდიციონერის მონტაჟი/AC installation: 200-400 ₾

Note: Prices vary by ±20% based on quality, complexity, and contractor experience.`;

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

    const langInstruction = locale === 'ka'
      ? 'პასუხი გამოიტანე ქართულად.'
      : locale === 'ru'
      ? 'Отвечай на русском языке.'
      : 'Respond in English.';

    const systemPrompt = `You are an expert renovation cost analyst specializing in Tbilisi, Georgia market.
You compare contractor estimates (ხარჯთაღრიცხვა) objectively and provide actionable insights.
${langInstruction}

COMPARISON CRITERIA:
1. Total Price - overall cost comparison
2. Completeness - are all necessary work items included?
3. Price Fairness - are individual items priced at market rate?
4. Transparency - are quantities and unit prices clearly specified?
5. Hidden Costs - are there likely additional costs not mentioned?

IMPORTANT:
- Parse prices in GEL (₾/ლარი), handle various number formats
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
      "totalPrice": <calculated total in GEL as number>,
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
   * Analyze project file and extract room/work configurations
   * Supports both text content and images (floor plans, blueprints)
   */
  async analyzeProject(
    projectText: string,
    locale: string = 'en',
    imageBase64?: string,
    imageMimeType?: string,
  ): Promise<ProjectAnalysisResult> {
    if (!this.isConfigured()) {
      throw new Error('OpenAI API key not configured');
    }

    const langInstruction = locale === 'ka'
      ? 'პასუხი გამოიტანე ქართულად (notes ველში).'
      : locale === 'ru'
      ? 'Отвечай на русском языке (в поле notes).'
      : 'Respond in English (in notes field).';

    const systemPrompt = `You are an expert at analyzing apartment/house project documents and floor plans.
Extract room information and suggest renovation work configurations.
${langInstruction}

ROOM TYPE MAPPING:
- მისაღები/гостиная/living room/salon → "living"
- საძინებელი/спальня/bedroom → "bedroom"
- სააბაზანო/აბაზანა/ванная/bathroom/WC/toilet → "bathroom"
- სამზარეულო/кухня/kitchen → "kitchen"
- დერეფანი/коридор/hallway/corridor → "hallway"
- აივანი/балкон/balcony/terrace → "balcony"

MATERIAL SUGGESTIONS based on room type:
- Bathroom/Kitchen: tile flooring, tile/paint walls
- Living/Bedroom: laminate/parquet flooring, paint walls
- Hallway: laminate/tile flooring, paint walls
- Balcony: tile flooring, paint walls

STANDARD DIMENSIONS if not specified:
- Ceiling height: 2.7-3.0m (typical Tbilisi apartments)
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
