import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Model, Types } from 'mongoose';
import OpenAI from 'openai';
import { ChatSession } from './schemas/chat-session.schema';
import { ChatMessage } from './schemas/chat-message.schema';
import { CreateSessionDto, SendMessageDto } from './dto/ai-assistant.dto';
import { AiToolsService } from './ai-tools.service';
import { getMarketContext } from '../ai/market-context';
import {
  RichContent,
  RichContentType,
  AiAssistantResponse,
  SuggestedAction,
} from './dto/rich-content.dto';
import { AmplitudeService } from '../analytics/amplitude.service';

type ToolContext = {
  categoryQuery?: string;
  proIds?: string[];
  proUids?: number[];
  featureQuery?: string;
  helpQuery?: string;
};

/**
 * SSE event types emitted by sendMessageStream. The frontend consumer
 * maintains an in-flight message reducer keyed off `type`.
 */
export type StreamEvent =
  | { type: 'started' }
  | { type: 'tool_call_start'; toolName: string }
  | {
      type: 'tool_call_end';
      toolName: string;
      durationMs: number;
      hasRichContent: boolean;
    }
  | { type: 'rich_content'; block: RichContent }
  | { type: 'text_delta'; content: string }
  | { type: 'suggested_actions'; actions: SuggestedAction[] }
  | { type: 'done'; messageId: string; processingTimeMs: number }
  | { type: 'error'; errorType: string; message: string };

// OpenAI function definitions for the AI to call
const AI_TOOLS: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'search_professionals',
      description:
        'Search for professionals/contractors on Homico. Use this when the user asks to find, recommend, or show professionals in any category. Returns a list of matching professionals with their profiles.',
      parameters: {
        type: 'object',
        properties: {
          category: {
            type: 'string',
            description:
              'Category to search in. Prefer the category key (e.g., "plumbing", "electrical", "interior-design", "architecture"). If the user provides a localized name (e.g., "არქიტექტურა") or a role word (e.g., "არქიტექტორი"), pass it as-is - the backend will resolve it.',
          },
          subcategory: {
            type: 'string',
            description:
              'Optional subcategory to narrow the search. Can be a key or a localized/free-text term; it will be resolved when possible.',
          },
          serviceKey: {
            type: 'string',
            description:
              'Specific service identifier (e.g. "drain-cleaning", "wall-painting"). Use when the user names a very specific service WITHIN a category. Most queries should use `category` instead.',
          },
          serviceArea: {
            type: 'string',
            description:
              'Tbilisi district or city name (e.g. "Vake", "Saburtalo", "Old Tbilisi", "Mtskheta"). Use when the user mentions a location, e.g. "plumber in Vake", "ვაკეში სანტექნიკოსი", "сантехник в Ваке".',
          },
          scheduledDate: {
            type: 'string',
            description:
              'YYYY-MM-DD date when the user needs the service. Use when the user mentions timing, e.g. "tomorrow", "next Monday", "this Saturday". Resolve relative dates to absolute YYYY-MM-DD before passing.',
          },
          languages: {
            type: 'array',
            items: { type: 'string', enum: ['en', 'ka', 'ru'] },
            description:
              'Language codes the pro must speak. Use when the user mentions language requirements, e.g. "English-speaking plumber" -> ["en"], "русскоговорящий" -> ["ru"]. Pass as an array even for a single language.',
          },
          minRating: {
            type: 'number',
            description:
              'Minimum rating filter (0-5). Only use when user explicitly asks for a specific minimum rating like "at least 4 stars". Do NOT use for "best" or "top" requests - use sort: "rating" instead.',
          },
          minPrice: {
            type: 'number',
            description: "Minimum price in the marketplace's local currency.",
          },
          maxPrice: {
            type: 'number',
            description: "Maximum price in the marketplace's local currency for budget searches.",
          },
          sort: {
            type: 'string',
            enum: ['rating', 'reviews', 'price-low', 'price-high', 'newest'],
            description:
              'How to sort results. ALWAYS use "rating" for "best", "top", or "საუკეთესო" requests. Use "reviews" for most popular/reviewed. Use "price-low" for budget/cheap options.',
          },
          limit: {
            type: 'number',
            description: 'Number of results to return (default 5, max 10).',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_professional_details',
      description:
        'Get detailed information about a specific professional by their ID or UID number.',
      parameters: {
        type: 'object',
        properties: {
          proId: {
            type: 'string',
            description: 'The professional ID or UID number.',
          },
        },
        required: ['proId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_professional_reviews',
      description: 'Get reviews for a specific professional.',
      parameters: {
        type: 'object',
        properties: {
          proId: {
            type: 'string',
            description: 'The professional ID or UID number.',
          },
          limit: {
            type: 'number',
            description: 'Number of reviews to return (default 5).',
          },
        },
        required: ['proId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_categories',
      description:
        'Get available service categories on Homico. Use this when the user asks about available services or what types of work can be found.',
      parameters: {
        type: 'object',
        properties: {
          categoryKey: {
            type: 'string',
            description:
              'Optional specific category key to get details for. Leave empty to get all categories.',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_price_ranges',
      description:
        'Get real price ranges for a category based on actual professional pricing. Use this when users ask about costs, prices, or how much something costs.',
      parameters: {
        type: 'object',
        properties: {
          category: {
            type: 'string',
            description:
              'The category key to get pricing for (e.g., "plumbing", "electrical", "interior-design").',
          },
        },
        required: ['category'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'explain_feature',
      description:
        'Explain a Homico platform feature with rich step-by-step guidance. ALWAYS use this when users ask "how do I", "how to", "როგორ" questions about platform features. Returns detailed steps with icons.',
      parameters: {
        type: 'object',
        properties: {
          feature: {
            type: 'string',
            description:
              'The feature to explain. Use these exact values: "registration_pro" for professional registration, "registration_client" for client registration, "post_job" for posting jobs, "find_professionals" for finding pros, "verification" for verification process, "messaging" for chat/messages, "proposals" for job proposals, "reviews" for reviews, "portfolio" for portfolio, "how_it_works" for general platform explanation, "tools" for all renovation tools overview, "tool_analyzer" for estimate analyzer (check contractor prices), "tool_prices" for price database, "tool_calculator" for renovation calculator, "tool_compare" for comparing estimates.',
          },
        },
        required: ['feature'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_help',
      description:
        "Search Homico's help/FAQ and feature guides. Use this when the user asks about platform rules, how something works, troubleshooting, or general questions that may be answered from Homico knowledge base.",
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'What to search for (user question or keywords).',
          },
          limit: {
            type: 'number',
            description: 'Max items per list (default 4, max 6).',
          },
        },
        required: ['query'],
      },
    },
  },
];

@Injectable()
export class AiAssistantService {
  private openai: OpenAI | null = null;

  constructor(
    @InjectModel(ChatSession.name) private sessionModel: Model<ChatSession>,
    @InjectModel(ChatMessage.name) private messageModel: Model<ChatMessage>,
    private configService: ConfigService,
    private aiToolsService: AiToolsService,
    private amplitude: AmplitudeService,
  ) {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    if (apiKey) {
      this.openai = new OpenAI({ apiKey });
    } else {
      console.warn('[AiAssistantService] OPENAI_API_KEY not configured. AI chat will be disabled.');
    }
  }

  private getSystemPrompt(
    locale: string = 'en',
    userRole?: string,
    country?: string,
  ): string {
    const market = getMarketContext(country);
    const marketEn = `${market.city}, ${market.country}`;
    const currencyEn = `${market.currencyName} (${market.currencyCode}, symbol ${market.currencySymbol})`;
    const marketDescriptorByLocale: Record<string, { intro: string; expertise: string; pricing: string }> = {
      en: {
        intro: `Homico is the leading platform connecting homeowners in ${marketEn} with renovation professionals.`,
        expertise: `You're an expert on the ${marketEn} renovation market, pricing, and best practices.`,
        pricing: `Always reason about costs in ${currencyEn}.`,
      },
      ka: {
        intro: `Homico - წამყვანი პლატფორმა, რომელიც ${market.city}-ში სახლის მფლობელებს რემონტის პროფესიონალებთან აკავშირებს.`,
        expertise: `ექსპერტი ხარ ${market.city}-ის სარემონტო ბაზარზე, ფასებსა და საუკეთესო პრაქტიკაში.`,
        pricing: `ფასებზე ყოველთვის ისაუბრე ${market.currencyName}-ში (${market.currencyCode}, სიმბოლო ${market.currencySymbol}).`,
      },
      ru: {
        intro: `Homico - ведущая платформа, соединяющая домовладельцев в ${marketEn} с профессионалами по ремонту.`,
        expertise: `Эксперт по рынку ремонта в ${marketEn}, ценам и лучшим практикам.`,
        pricing: `О ценах всегда рассуждай в ${market.currencyName} (${market.currencyCode}, символ ${market.currencySymbol}).`,
      },
    };
    const md = marketDescriptorByLocale[locale] ?? marketDescriptorByLocale.en;

    const roleContext =
      userRole === 'pro'
        ? 'The user is a professional/contractor on Homico.'
        : userRole === 'client'
          ? 'The user is a homeowner looking for renovation services.'
          : 'The user is browsing Homico.';

    const toolInstructions = `
You have access to tools that let you query real data from Homico's database:
- search_professionals: Find professionals by category, rating, price
- get_professional_details: Get details about a specific professional
- get_professional_reviews: Get reviews for a professional
- get_categories: List available service categories
- get_price_ranges: Get real pricing data for a category
- explain_feature: Explain how Homico features work
- search_help: Search Homico help/FAQ and feature guides

IMPORTANT GUIDELINES:
1. When users ask about professionals, ALWAYS use search_professionals to show real data
2. When users ask about prices/costs, use get_price_ranges for real pricing data
3. When users ask "how do I" questions, use explain_feature to provide step-by-step guidance
4. When users ask about services/categories, use get_categories to show available options
5. When users ask how the platform works / rules / troubleshooting, use search_help
6. After calling a tool, provide a helpful summary of results and what to do next
7. If a tool returns no results, suggest alternative approaches and ask 1 clarifying question.
   - If search_professionals returns 0, suggest 2–5 closest categories and offer to browse all professionals or post a job.

HOW TO SOUND (this matters most — apply to EVERY reply):
- Write like a real, friendly member of the Homico team chatting with a
  customer. Natural, warm, human — NOT like an "AI assistant".
- Default to short flowing prose: usually 1-3 conversational sentences.
  Do NOT use numbered "steps", bullet lists, or bold headers UNLESS the user
  explicitly asks for a list or a step-by-step. Most answers need no
  formatting at all — just talk.
- Never use canned AI phrases or sign-offs. BANNED (in any language):
  "feel free to ask", "let me know if you need anything", "I'm here to help",
  "Would you like to proceed?", "What would you prefer?", "As an AI",
  "Here are some...", "Ready to take the next step?", "Would you like me to
  suggest some other/related categories", "Is there anything else I can help
  you with?", "just let me know", "if you're ready to get started". End like a person would — often with nothing, or with ONE
  natural, specific question, but only when it genuinely helps.
- Never narrate the system or its data state. Never mention databases,
  records, "data", "at the moment", or what you do/don't "have". BANNED:
  "our database", "no results were found", "it seems there are currently
  no...", "based on the data", "I couldn't find ... data", "I don't have
  information about ... on Homico", and their Georgian/Russian equivalents
  ("ინფორმაცია არ მაქვს", "ჩვენს ბაზაში", "в нашей базе", "на данный момент").
  If you find nothing, just say it plainly like a human (e.g. "I don't have
  set prices for tiling — most tilers quote per m². Want me to connect you
  with a few?").
- Suggest ONE specific, on-topic next action tied to what they asked
  (e.g. "Want me to list 3 electricians near you?"). Never offer a menu of
  options or double-barreled "...or perhaps..." suggestions.
- When the UI shows a card under your reply (steps, pros, prices, FAQ,
  categories), it already lists the details — do NOT repeat them in your text.
  Your words are just a short, human lead-in or one useful takeaway, never a
  written copy of the card (don't re-list registration steps, prices, or each
  pro's name/rating — the card has them).
- Write every place / city name in the user's own script. In Georgian:
  თბილისი, ბათუმი, ქუთაისი (never "Tbilisi"); in Russian: Cyrillic. Never
  leave a Latin-script name inside a Georgian or Russian sentence.
- Don't announce that you're an AI and don't narrate your own steps. Vary
  your openings — don't start every reply the same way.

OTHER OUTPUT RULES:
- NEVER expose internal identifiers, slugs, tool names, query parameters,
  or feature codes (e.g. "registration_pro", "search_professionals",
  "search_help", "explain_feature", any "tool_name: value" phrasing).
  Translate the intent to natural language.
- Do NOT use markdown links like [text](url). Write plain text and put any
  URL on its own line. Action buttons are rendered separately by the UI.
- Do NOT wrap output in code fences unless the user explicitly asked for code.
- Write in the user's language (Georgian / Russian / English). When writing
  Georgian, use real Georgian words only - never transliterate English or
  invent new vocabulary.`;

    const prompts = {
      en: `You are Homi from Homico — the friendly person who helps people here plan, price and find help for their home-renovation projects. ${md.intro}

${roleContext}

${toolInstructions}

Your personality:
- Warm, helpful, and knowledgeable about home renovation
- You are direct and practical
- ${md.expertise} ${md.pricing}

You can help with:
1. **Finding Professionals**: Search our database to find the best pros for any job
2. **Cost Estimation**: Show real price ranges from professionals on the platform
3. **Platform Help**: Explain how to register, post jobs, contact pros, etc.
4. **Renovation Advice**: Planning projects, choosing materials, understanding timelines
5. **Free Tools**: Explain our tools at /tools - Estimate Analyzer (check if contractor prices are fair), Price Database (browse market prices), Calculator (estimate costs), Compare (compare multiple estimates)

Response style:
- Answer in a couple of natural sentences, like you're texting someone who just asked you. No bullet lists or bold unless they explicitly asked for steps.
- Go a bit longer only when they ask for details, a comparison, or real guidance — but still as flowing prose, not a fact sheet.
- The cards already show the pros/prices, so don't restate every number — just point out 1-2 genuinely useful things and a natural next move.`,

      ka: `შენ ხარ Homi - Homico-ს გუნდის წევრი, რომელიც ეხმარება ხალხს რემონტის დაგეგმვაში, ფასების გარკვევასა და სპეციალისტის პოვნაში. ${md.intro}

${roleContext}

${toolInstructions}

შენი პიროვნება:
- თბილი, დამხმარე და რემონტის საკითხებში მცოდნე
- საუბრობ მოკლედ, მაგრამ ინფორმატიულად
- იშვიათად იყენებ მეგობრულ emoji-ებს (მაქსიმუმ 1-2 შეტყობინებაში)
- ${md.expertise} ${md.pricing}

შეგიძლია დაეხმარო:
1. **პროფესიონალების პოვნა**: მოძებნე საუკეთესო სპეციალისტები ნებისმიერი სამუშაოსთვის
2. **ღირებულების შეფასება**: აჩვენე რეალური ფასები პლატფორმის პროფესიონალებისგან
3. **პლატფორმის დახმარება**: ახსენი როგორ დარეგისტრირდნენ, განათავსონ განცხადება და ა.შ.
4. **რემონტის რჩევები**: პროექტების დაგეგმვა, მასალების შერჩევა
5. **უფასო ხელსაწყოები**: აგიხსნი ჩვენს ხელსაწყოებს /tools გვერდზე - შეფასების ანალიზატორი (კონტრაქტორის ფასების შემოწმება), ფასების ბაზა (საბაზრო ფასების ნახვა), კალკულატორი (ღირებულების შეფასება), შედარება (რამდენიმე შეფასების შედარება)

ტონი (ყველაზე მნიშვნელოვანი):
- წერე ისე, როგორც Homico-ს ცოცხალი თანამშრომელი მიწერდა — ბუნებრივად და მეგობრულად, არა როგორც AI.
- პასუხი მოკლე და თხრობითი, ჩვეულებრივ 1-3 წინადადება. ნუ გამოიყენებ ნუსხებს, ნომრიან ნაბიჯებს ან გამუქებულ სათაურებს, თუ მომხმარებელი პირდაპირ არ ითხოვს.
- არასოდეს თქვა „ინფორმაცია არ მაქვს", „ჩვენს ბაზაში", „ამ ეტაპზე არ მაქვს". თუ ვერაფერი იპოვე, უბრალოდ ადამიანურად თქვი და შესთავაზე ერთი კონკრეტული ნაბიჯი (არა მენიუ).
- ქალაქების სახელები ქართულად დაწერე: თბილისი, ბათუმი, ქუთაისი (არასოდეს ლათინურად „Tbilisi").`,

      ru: `Ты Homi из Homico — живой помощник, который помогает людям спланировать ремонт, разобраться в ценах и найти специалиста. ${md.intro}

${roleContext}

${toolInstructions}

Твоя личность:
- Тёплый, отзывчивый и знающий в вопросах ремонта
- Говоришь кратко, но информативно
- Редко используешь дружелюбные эмодзи (максимум 1-2 на сообщение)
- ${md.expertise} ${md.pricing}

Ты можешь помочь с:
1. **Поиск профессионалов**: Найти лучших специалистов для любой работы
2. **Оценка стоимости**: Показать реальные цены от специалистов на платформе
3. **Помощь с платформой**: Объяснить как регистрироваться, размещать заказы и т.д.
4. **Советы по ремонту**: Планирование проектов, выбор материалов
5. **Бесплатные инструменты**: Объясню наши инструменты на /tools - Анализатор смет (проверить цены подрядчика), База цен (рыночные цены), Калькулятор (оценка стоимости), Сравнение (сравнить несколько смет)

Тон (самое важное):
- Пиши как живой сотрудник Homico — естественно и по-дружески, не как ИИ.
- Коротко и разговорно, обычно 1-3 предложения. Не используй списки, нумерованные шаги и жирные заголовки, если пользователь сам не попросил.
- Никогда не говори «в нашей базе», «на данный момент нет», «у меня нет информации». Если ничего не нашёл — скажи просто, по-человечески, и предложи один конкретный шаг (не меню вариантов).
- Названия городов пиши кириллицей: Тбилиси, Батуми, Кутаиси (никогда латиницей).`,
    };

    return prompts[locale as keyof typeof prompts] || prompts.en;
  }

  async createSession(
    userId: string | null,
    dto: CreateSessionDto,
  ): Promise<ChatSession> {
    const session = new this.sessionModel({
      visitorId: userId ? new Types.ObjectId(userId) : undefined,
      anonymousId: dto.anonymousId,
      context: dto.context,
      status: 'active',
      messageCount: 0,
    });

    return session.save();
  }

  async getSession(sessionId: string, userId?: string): Promise<any> {
    const session = await this.sessionModel.findById(sessionId).lean().exec();

    if (!session) {
      throw new NotFoundException('Chat session not found');
    }

    // Security: verify user owns this session
    if (userId && session.visitorId && session.visitorId.toString() !== userId) {
      throw new NotFoundException('Chat session not found');
    }

    const messages = await this.messageModel
      .find({ sessionId: new Types.ObjectId(sessionId) })
      .sort({ createdAt: 1 })
      .lean()
      .exec();

    return { ...session, messages };
  }

  async findActiveSession(
    userId?: string,
    anonymousId?: string,
  ): Promise<ChatSession | null> {
    const query: any = { status: 'active' };

    if (userId) {
      query.visitorId = new Types.ObjectId(userId);
    } else if (anonymousId) {
      query.anonymousId = anonymousId;
    } else {
      return null;
    }

    return this.sessionModel.findOne(query).sort({ createdAt: -1 }).exec();
  }

  async sendMessage(
    sessionId: string,
    dto: SendMessageDto,
    userId?: string,
    clientDeviceId?: string,
  ): Promise<AiAssistantResponse> {
    // Check if OpenAI is configured
    if (!this.openai) {
      const locale = dto.locale || 'en';
      const errorMessage =
        locale === 'ka'
          ? 'AI ასისტენტი დროებით მიუწვდომელია. გთხოვთ სცადოთ მოგვიანებით.'
          : locale === 'ru'
            ? 'AI ассистент временно недоступен. Попробуйте позже.'
            : 'AI assistant is temporarily unavailable. Please try again later.';
      this.amplitude.track('ai_chat_error', {
        userId,
        deviceId: clientDeviceId,
        properties: { errorType: 'openai_not_configured', locale },
      });
      return { response: errorMessage };
    }

    const session = await this.sessionModel.findById(sessionId).exec();

    if (!session) {
      throw new NotFoundException('Chat session not found');
    }

    // Security check
    if (userId && session.visitorId && session.visitorId.toString() !== userId) {
      throw new NotFoundException('Chat session not found');
    }

    const locale = dto.locale || session.context?.preferredLocale || 'en';
    const startTime = Date.now();

    // Track at the very start so we capture the inbound query even if the
    // OpenAI call later times out or errors.
    this.amplitude.track('ai_chat_message_sent', {
      userId,
      deviceId: clientDeviceId,
      properties: {
        sessionId,
        locale,
        messageLength: dto.message.length,
        currentPage: dto.currentPage,
        userRole: session.context?.userRole,
        isAnonymous: !userId,
      },
    });

    // Save user message
    const userMessage = new this.messageModel({
      sessionId: new Types.ObjectId(sessionId),
      role: 'user',
      content: dto.message,
    });
    await userMessage.save();

    // Get conversation history (last 15 messages for context)
    const history = await this.messageModel
      .find({ sessionId: new Types.ObjectId(sessionId) })
      .sort({ createdAt: -1 })
      .limit(15)
      .lean()
      .exec();

    // Build messages array for OpenAI
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: this.getSystemPrompt(
          locale,
          session.context?.userRole,
          // Marketplace country flows from the request (URL segment ->
          // useCountry() on the client -> dto.country). Falls back to
          // any previously-stored session context country, then to GE
          // via getMarketContext's own default.
          dto.country ?? (session.context as { country?: string } | undefined)?.country,
        ),
      },
      ...history.reverse().map((msg) => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      })),
    ];

    // Add context about current page if provided
    if (dto.currentPage) {
      messages.push({
        role: 'system',
        content: `The user is currently on the ${dto.currentPage} page.`,
      });
    }

    try {
      // First API call with tools
      let completion = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages,
        tools: AI_TOOLS,
        tool_choice: 'auto',
        max_tokens: 1200,
        temperature: 0.6,
      });

      let assistantMessage = completion.choices[0]?.message;
      const richContent: RichContent[] = [];
      const toolContext: ToolContext = {};

      // Process tool calls if any
      const toolsUsed: string[] = [];
      if (assistantMessage?.tool_calls && assistantMessage.tool_calls.length > 0) {
        // Add assistant message with tool calls to conversation
        messages.push(assistantMessage as OpenAI.Chat.ChatCompletionMessageParam);

        // Execute each tool call
        for (const toolCall of assistantMessage.tool_calls) {
          // Type guard for function tool calls
          if (toolCall.type !== 'function') continue;

          const toolStartMs = Date.now();
          const toolResult = await this.executeToolCall(
            toolCall.function.name,
            JSON.parse(toolCall.function.arguments),
            locale as 'en' | 'ka' | 'ru',
            dto.country ?? (session.context as { country?: string } | undefined)?.country,
          );
          const toolDurationMs = Date.now() - toolStartMs;
          toolsUsed.push(toolCall.function.name);

          // Track each tool call so we can see which tools fire most, which
          // are slow, and which return empty (richContent missing) - the
          // latter is the most actionable signal for tuning the matcher.
          this.amplitude.track('ai_chat_tool_called', {
            userId,
            deviceId: clientDeviceId,
            properties: {
              sessionId,
              toolName: toolCall.function.name,
              durationMs: toolDurationMs,
              hasRichContent: Boolean(
                toolResult.richContent && toolResult.richContent.length > 0,
              ),
              locale,
            },
          });

          // Add tool result to rich content if it has data
          if (toolResult.richContent && toolResult.richContent.length > 0) {
            richContent.push(...toolResult.richContent);
          }

          if (toolResult.context) {
            if (toolResult.context.categoryQuery) toolContext.categoryQuery = toolResult.context.categoryQuery;
            if (toolResult.context.proIds) toolContext.proIds = toolResult.context.proIds;
            if (toolResult.context.proUids) toolContext.proUids = toolResult.context.proUids;
            if (toolResult.context.featureQuery) toolContext.featureQuery = toolResult.context.featureQuery;
            if (toolResult.context.helpQuery) toolContext.helpQuery = toolResult.context.helpQuery;
          }

          // Add tool response to messages
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify(toolResult.summary),
          });
        }

        // Second API call to generate final response with tool results
        completion = await this.openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages,
          max_tokens: 900,
          temperature: 0.6,
        });

        assistantMessage = completion.choices[0]?.message;
      }

      const assistantContent =
        assistantMessage?.content ||
        (locale === 'ka'
          ? 'ბოდიში, ვერ დავამუშავე თქვენი მოთხოვნა.'
          : locale === 'ru'
            ? 'Извините, не удалось обработать ваш запрос.'
            : 'Sorry, I could not process your request.');

      const processingTimeMs = Date.now() - startTime;

      // Generate suggested actions based on response content and rich content
      const suggestedActions = this.generateSuggestedActions(
        assistantContent,
        richContent,
        locale,
        toolContext,
        dto.currentPage,
      );

      // Save assistant message
      const savedAssistantMessage = new this.messageModel({
        sessionId: new Types.ObjectId(sessionId),
        role: 'assistant',
        content: assistantContent,
        metadata: {
          tokensUsed: completion.usage?.total_tokens,
          model: 'gpt-4o-mini',
          processingTimeMs,
          suggestedActions,
          richContent,
        },
      });
      await savedAssistantMessage.save();

      // Update session
      await this.sessionModel.findByIdAndUpdate(sessionId, {
        $inc: { messageCount: 2 },
        lastMessageAt: new Date(),
      });

      // Track the completed turn. Token count and processing time are
      // useful for cost and latency dashboards; toolsUsed lets us cohort
      // queries by which tools resolved them.
      this.amplitude.track('ai_chat_response_returned', {
        userId,
        deviceId: clientDeviceId,
        properties: {
          sessionId,
          locale,
          processingTimeMs,
          tokensUsed: completion.usage?.total_tokens,
          promptTokens: completion.usage?.prompt_tokens,
          completionTokens: completion.usage?.completion_tokens,
          toolsUsed: toolsUsed.length > 0 ? toolsUsed.join(',') : undefined,
          toolCount: toolsUsed.length,
          hasRichContent: richContent.length > 0,
          responseLength: assistantContent.length,
          suggestedActionCount: suggestedActions.length,
        },
      });

      return {
        response: assistantContent,
        richContent: richContent.length > 0 ? richContent : undefined,
        suggestedActions: suggestedActions.length > 0 ? suggestedActions : undefined,
      };
    } catch (error) {
      console.error('OpenAI API error:', error);

      this.amplitude.track('ai_chat_error', {
        userId,
        deviceId: clientDeviceId,
        properties: {
          sessionId,
          locale,
          errorType: 'openai_call_failed',
          errorMessage:
            error instanceof Error ? error.message.slice(0, 200) : 'unknown',
          processingTimeMs: Date.now() - startTime,
        },
      });

      const errorMessage =
        locale === 'ka'
          ? 'ბოდიში, დროებით ვერ ვპასუხობ. გთხოვთ სცადოთ მოგვიანებით.'
          : locale === 'ru'
            ? 'Извините, временно не могу ответить. Попробуйте позже.'
            : "Sorry, I'm temporarily unable to respond. Please try again later.";

      return { response: errorMessage };
    }
  }

  /**
   * Streaming variant of sendMessage. Yields typed events as work happens
   * (tool calls fire, response tokens stream in) so the client can render
   * progressive UI instead of staring at a spinner for several seconds.
   *
   * Two phases internally:
   *   1. Tool-selection completion (non-streaming, fast - ~500ms typical).
   *      We can't stream tool_calls usefully because clients need the
   *      whole tool decision before we execute anything.
   *   2. Response-generation completion (streaming). After all tool calls
   *      execute, we make a second OpenAI call with stream: true and
   *      yield text_delta per chunk.
   *
   * The MongoDB Message + Amplitude analytics fire at `done` time, after
   * we've collected the full response from the stream.
   */
  async *sendMessageStream(
    sessionId: string,
    dto: SendMessageDto,
    userId?: string,
    clientDeviceId?: string,
    abortSignal?: AbortSignal,
  ): AsyncGenerator<StreamEvent> {
    if (!this.openai) {
      yield {
        type: 'error',
        errorType: 'openai_not_configured',
        message: 'AI assistant is temporarily unavailable.',
      };
      return;
    }

    const session = await this.sessionModel.findById(sessionId).exec();
    if (!session) {
      yield { type: 'error', errorType: 'session_not_found', message: 'Chat session not found' };
      return;
    }
    if (userId && session.visitorId && session.visitorId.toString() !== userId) {
      yield { type: 'error', errorType: 'forbidden', message: 'Forbidden' };
      return;
    }

    const locale = dto.locale || session.context?.preferredLocale || 'en';
    const startTime = Date.now();

    // Save user message immediately so the chat history stays consistent
    // even if the stream is aborted partway.
    const userMessage = new this.messageModel({
      sessionId: new Types.ObjectId(sessionId),
      role: 'user',
      content: dto.message,
    });
    await userMessage.save();

    this.amplitude.track('ai_chat_message_sent', {
      userId,
      deviceId: clientDeviceId,
      properties: {
        sessionId,
        locale,
        messageLength: dto.message.length,
        currentPage: dto.currentPage,
        userRole: session.context?.userRole,
        isAnonymous: !userId,
        streaming: true,
      },
    });

    yield { type: 'started' };

    const history = await this.messageModel
      .find({ sessionId: new Types.ObjectId(sessionId) })
      .sort({ createdAt: -1 })
      .limit(15)
      .lean()
      .exec();

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: this.getSystemPrompt(locale, session.context?.userRole),
      },
      ...history.reverse().map((msg) => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      })),
    ];
    if (dto.currentPage) {
      messages.push({
        role: 'system',
        content: `The user is currently on the ${dto.currentPage} page.`,
      });
    }

    const richContent: RichContent[] = [];
    const toolContext: ToolContext = {};
    const toolsUsed: string[] = [];
    let assistantContent = '';

    try {
      // Phase 1: tool-selection (non-streaming, deterministic temp).
      const selection = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages,
        tools: AI_TOOLS,
        tool_choice: 'auto',
        max_tokens: 600,
        temperature: 0.3,
      });

      if (abortSignal?.aborted) {
        yield { type: 'error', errorType: 'aborted', message: 'Client aborted' };
        return;
      }

      const selectionMessage = selection.choices[0]?.message;

      // Execute tool calls if any.
      if (selectionMessage?.tool_calls && selectionMessage.tool_calls.length > 0) {
        messages.push(selectionMessage as OpenAI.Chat.ChatCompletionMessageParam);

        for (const toolCall of selectionMessage.tool_calls) {
          if (toolCall.type !== 'function') continue;
          if (abortSignal?.aborted) {
            yield { type: 'error', errorType: 'aborted', message: 'Client aborted' };
            return;
          }

          yield { type: 'tool_call_start', toolName: toolCall.function.name };
          const toolStartMs = Date.now();

          const toolResult = await this.executeToolCall(
            toolCall.function.name,
            JSON.parse(toolCall.function.arguments),
            locale as 'en' | 'ka' | 'ru',
            dto.country ?? (session.context as { country?: string } | undefined)?.country,
          );
          const toolDurationMs = Date.now() - toolStartMs;
          toolsUsed.push(toolCall.function.name);

          this.amplitude.track('ai_chat_tool_called', {
            userId,
            deviceId: clientDeviceId,
            properties: {
              sessionId,
              toolName: toolCall.function.name,
              durationMs: toolDurationMs,
              hasRichContent: Boolean(toolResult.richContent && toolResult.richContent.length > 0),
              locale,
              streaming: true,
            },
          });

          if (toolResult.richContent && toolResult.richContent.length > 0) {
            richContent.push(...toolResult.richContent);
            for (const block of toolResult.richContent) {
              yield { type: 'rich_content', block };
            }
          }
          if (toolResult.context) {
            if (toolResult.context.categoryQuery) toolContext.categoryQuery = toolResult.context.categoryQuery;
            if (toolResult.context.proIds) toolContext.proIds = toolResult.context.proIds;
            if (toolResult.context.proUids) toolContext.proUids = toolResult.context.proUids;
            if (toolResult.context.featureQuery) toolContext.featureQuery = toolResult.context.featureQuery;
            if (toolResult.context.helpQuery) toolContext.helpQuery = toolResult.context.helpQuery;
          }

          yield {
            type: 'tool_call_end',
            toolName: toolCall.function.name,
            durationMs: toolDurationMs,
            hasRichContent: Boolean(toolResult.richContent && toolResult.richContent.length > 0),
          };

          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify(toolResult.summary),
          });
        }

        // Phase 2: response generation with streaming. The non-streaming
        // sendMessage uses max_tokens 900 here; we cap tighter so the
        // streamed text feels concise (it streams visibly, the user can
        // see length growing). If you re-introduce a humanizer/style
        // prompt later, push it into `messages` before this call.
        const stream = await this.openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages,
          max_tokens: 400,
          temperature: 0.7,
          stream: true,
        });

        for await (const chunk of stream) {
          if (abortSignal?.aborted) break;
          const delta = chunk.choices[0]?.delta?.content;
          if (delta) {
            assistantContent += delta;
            yield { type: 'text_delta', content: delta };
          }
        }
      } else {
        // No tools fired. The selectionMessage already contains the
        // assistant's reply - just emit it as one delta. (Could stream
        // this path too in future, but it's usually short.)
        assistantContent = selectionMessage?.content ?? '';
        if (assistantContent) {
          yield { type: 'text_delta', content: assistantContent };
        }
      }

      if (!assistantContent) {
        assistantContent =
          locale === 'ka'
            ? 'ბოდიში, ვერ დავამუშავე თქვენი მოთხოვნა.'
            : locale === 'ru'
              ? 'Извините, не удалось обработать ваш запрос.'
              : 'Sorry, I could not process your request.';
        yield { type: 'text_delta', content: assistantContent };
      }

      const processingTimeMs = Date.now() - startTime;

      const suggestedActions = this.generateSuggestedActions(
        assistantContent,
        richContent,
        locale,
        toolContext,
        dto.currentPage,
      );
      if (suggestedActions.length > 0) {
        yield { type: 'suggested_actions', actions: suggestedActions };
      }

      // Persist the assistant message + bump session counters.
      const savedAssistantMessage = new this.messageModel({
        sessionId: new Types.ObjectId(sessionId),
        role: 'assistant',
        content: assistantContent,
        metadata: {
          model: 'gpt-4o-mini',
          processingTimeMs,
          suggestedActions,
          richContent,
          streamed: true,
        },
      });
      await savedAssistantMessage.save();
      await this.sessionModel.findByIdAndUpdate(sessionId, {
        $inc: { messageCount: 2 },
        lastMessageAt: new Date(),
      });

      this.amplitude.track('ai_chat_response_returned', {
        userId,
        deviceId: clientDeviceId,
        properties: {
          sessionId,
          locale,
          processingTimeMs,
          toolsUsed: toolsUsed.length > 0 ? toolsUsed.join(',') : undefined,
          toolCount: toolsUsed.length,
          hasRichContent: richContent.length > 0,
          responseLength: assistantContent.length,
          suggestedActionCount: suggestedActions.length,
          streaming: true,
        },
      });

      yield {
        type: 'done',
        messageId: String(savedAssistantMessage._id),
        processingTimeMs,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown';
      this.amplitude.track('ai_chat_error', {
        userId,
        deviceId: clientDeviceId,
        properties: {
          sessionId,
          locale,
          errorType: 'openai_call_failed',
          errorMessage: message.slice(0, 200),
          processingTimeMs: Date.now() - startTime,
          streaming: true,
        },
      });
      yield {
        type: 'error',
        errorType: 'openai_call_failed',
        message,
      };
    }
  }

  private async executeToolCall(
    toolName: string,
    args: any,
    locale: 'en' | 'ka' | 'ru',
    country?: string,
  ): Promise<{ summary: any; richContent?: RichContent[]; context?: ToolContext }> {
    try {
      switch (toolName) {
        case 'search_professionals': {
          const result = await this.aiToolsService.searchProfessionals({
            category: args.category,
            subcategory: args.subcategory,
            minRating: args.minRating,
            minPrice: args.minPrice,
            maxPrice: args.maxPrice,
            sort: args.sort || 'rating',
            limit: Math.min(args.limit || 5, 10),
            locale,
          });

          const professionals = result.data as any[];
          const originalQuery = String(args.subcategory || args.category || '').trim();

          // If we found no professionals, suggest closest matching categories (helps with locale/category mismatches)
          const categorySuggestions =
            professionals.length === 0 && originalQuery
              ? await this.aiToolsService.suggestCategories(originalQuery, locale, 8)
              : null;

          return {
            summary: {
              found: professionals.length,
              category: args.category,
              professionals: professionals.map((p) => ({
                name: p.name,
                rating: p.avgRating,
                reviews: p.totalReviews,
                price: p.priceRange,
              })),
            },
            richContent:
              professionals.length > 0
                ? [result]
                : categorySuggestions && (categorySuggestions.data as any[])?.length
                  ? [categorySuggestions]
                  : undefined,
            context: {
              categoryQuery: args.category,
              proIds: professionals.map((p) => p.id).filter(Boolean),
              proUids: professionals.map((p) => p.uid).filter(Boolean),
            },
          };
        }

        case 'get_professional_details': {
          const result = await this.aiToolsService.getProfessionalDetails(args.proId);
          if (!result) {
            return { summary: { error: 'Professional not found' } };
          }
          return {
            summary: {
              found: true,
              professional: result.data,
            },
            richContent: [result],
            context: { proIds: [(result.data as any)?.id].filter(Boolean) },
          };
        }

        case 'get_professional_reviews': {
          const result = await this.aiToolsService.getProfessionalReviews({
            proId: args.proId,
            limit: args.limit || 5,
          });

          const reviews = result.data as any[];
          return {
            summary: {
              found: reviews.length,
              reviews: reviews.map((r) => ({
                rating: r.rating,
                text: r.text?.substring(0, 100),
                client: r.clientName,
              })),
            },
            richContent: reviews.length > 0 ? [result] : undefined,
            context: { proIds: [args.proId].filter(Boolean) },
          };
        }

        case 'get_categories': {
          const result = await this.aiToolsService.getCategories(args.categoryKey);
          const categories = result.data as any[];
          return {
            summary: {
              found: categories.length,
              categories: categories.map((c) => ({
                key: c.key,
                name: locale === 'ka' ? c.nameKa : c.name,
                subcategories: c.subcategoryCount,
              })),
            },
            richContent: categories.length > 0 ? [result] : undefined,
          };
        }

        case 'get_price_ranges': {
          const result = await this.aiToolsService.getPriceRanges(args.category, country);
          const priceInfo = result.data as any;
          return {
            summary: {
              category: priceInfo.category,
              averagePrice: priceInfo.averagePrice,
              priceRanges: priceInfo.priceRanges,
              professionalCount: priceInfo.professionalCount,
            },
            richContent: [result],
            context: { categoryQuery: args.category },
          };
        }

        case 'explain_feature': {
          const result = await this.aiToolsService.explainFeature(args.feature, locale);
          if (!result) {
            return {
              summary: {
                error: 'Feature not found',
                suggestion: 'Try asking about registration, posting jobs, or finding professionals.',
              },
            };
          }
          const feature = result.data as any;
          // Important: do NOT include the internal `feature` slug in the
          // summary. The LLM was echoing it back to users as
          // "მოდელი დაბმარია: registration_pro" instead of writing a real
          // answer. Send localized content (titles + step titles) so the
          // model has something concrete to summarize.
          const localizedSteps = (feature.steps || []).map((s: any) => ({
            step: s.step,
            title:
              locale === 'ka'
                ? s.titleKa
                : locale === 'ru'
                  ? s.titleRu
                  : s.title,
          }));
          return {
            summary: {
              title:
                locale === 'ka'
                  ? feature.titleKa
                  : locale === 'ru'
                    ? feature.titleRu
                    : feature.title,
              description:
                locale === 'ka'
                  ? feature.descriptionKa
                  : locale === 'ru'
                    ? feature.descriptionRu
                    : feature.description,
              steps: localizedSteps,
              actionUrl: feature.actionUrl,
              actionLabel:
                locale === 'ka'
                  ? feature.actionLabelKa
                  : locale === 'ru'
                    ? feature.actionLabelRu
                    : feature.actionLabel,
            },
            richContent: [result],
            context: { featureQuery: args.feature },
          };
        }

        case 'search_help': {
          const query = String(args.query || '').trim();
          const limit = Math.min(Math.max(Number(args.limit || 4), 1), 6);
          if (!query) {
            return { summary: { error: 'Query is required' } };
          }

          const kb = this.aiToolsService.searchKnowledge(query, locale);
          const blocks: RichContent[] = [];

          if (kb.features?.length) {
            blocks.push({
              type: RichContentType.FEATURE_LIST,
              data: kb.features.slice(0, 5),
            });
          }

          if (kb.faqs?.length) {
            const faqItems = kb.faqs.slice(0, limit).map((f: any) => ({
              question: f.question?.en || '',
              questionKa: f.question?.ka,
              questionRu: f.question?.ru,
              answer: f.answer?.en || '',
              answerKa: f.answer?.ka,
              answerRu: f.answer?.ru,
              relatedFeature: f.relatedFeature,
            }));
            blocks.push({
              type: RichContentType.FAQ_LIST,
              data: faqItems,
            });
          }

          // Same trap as explain_feature: when we shipped only counts to the
          // LLM it had nothing to work with and parroted the raw query back
          // as "მოძებნე დახმარება: registration_pro". Send localized titles
          // for matched features and the actual FAQ Q/A text so the model
          // can summarize real content. The internal `query` arg is never
          // sent back - the model already remembers what it asked for.
          const featureSummaries = (kb.features || []).slice(0, 5).map((f: any) => ({
            title:
              locale === 'ka' ? f.titleKa : locale === 'ru' ? f.titleRu : f.title,
            description:
              locale === 'ka'
                ? f.descriptionKa
                : locale === 'ru'
                  ? f.descriptionRu
                  : f.description,
            actionUrl: f.actionUrl,
          }));
          const faqSummaries = (kb.faqs || []).slice(0, limit).map((f: any) => ({
            question:
              (locale === 'ka' ? f.question?.ka : locale === 'ru' ? f.question?.ru : f.question?.en) ||
              f.question?.en,
            answer:
              (locale === 'ka' ? f.answer?.ka : locale === 'ru' ? f.answer?.ru : f.answer?.en) ||
              f.answer?.en,
          }));
          return {
            summary: {
              features: featureSummaries,
              faqs: faqSummaries,
            },
            richContent: blocks.length ? blocks : undefined,
            context: { helpQuery: query },
          };
        }

        default:
          return { summary: { error: 'Unknown tool' } };
      }
    } catch (error) {
      console.error(`Tool execution error (${toolName}):`, error);
      return { summary: { error: 'Tool execution failed' } };
    }
  }

  private generateSuggestedActions(
    content: string,
    richContent: RichContent[],
    locale: string,
    toolContext?: ToolContext,
    currentPage?: string,
  ): SuggestedAction[] {
    const actions: SuggestedAction[] = [];
    const contentLower = content.toLowerCase();

    // Check rich content types to suggest relevant actions
    const hasProList = richContent.some(
      (rc) => rc.type === 'PROFESSIONAL_LIST' || rc.type === 'PROFESSIONAL_CARD',
    );
    const hasPriceInfo = richContent.some((rc) => rc.type === 'PRICE_INFO');
    const hasFeature = richContent.some((rc) => rc.type === 'FEATURE_EXPLANATION');
    const hasCategories = richContent.some((rc) => rc.type === 'CATEGORY_LIST');
    const hasFaqs = richContent.some((rc) => rc.type === RichContentType.FAQ_LIST);
    const hasFeatureList = richContent.some((rc) => rc.type === RichContentType.FEATURE_LIST);

    // If showing professionals, suggest browsing more or posting a job.
    // Action TEXT must never include raw slugs (e.g. "plumbing",
    // "general_construction") or numeric UIDs (e.g. "100027") because that
    // text becomes the user's next chat message, and the user sees it in
    // their own bubble. Use pronoun references ("this", "the top result")
    // and rely on the LLM's conversation history to resolve them - the
    // previous turn's tool result is right there in the messages array.
    if (hasProList) {
      if (toolContext?.categoryQuery) {
        actions.push({
          type: 'action',
          label: 'Show typical prices',
          labelKa: 'აჩვენე ტიპური ფასები',
          labelRu: 'Показать типичные цены',
          action: 'What are typical prices for this category?',
          actionKa: 'რა არის ტიპური ფასები ამ კატეგორიაში?',
          actionRu: 'Какие типичные цены в этой категории?',
        });
      }
      actions.push({
        type: 'link',
        label: 'View All Professionals',
        labelKa: 'ყველა პროფესიონალის ნახვა',
        labelRu: 'Все специалисты',
        url: '/professionals',
      });
      if (toolContext?.proUids?.length) {
        actions.unshift({
          type: 'action',
          label: 'Show reviews for top result',
          labelKa: 'იხილე საუკეთესო შედეგის შეფასებები',
          labelRu: 'Отзывы по лучшему результату',
          action: 'Show me reviews for the top professional in the list above',
          actionKa: 'მაჩვენე ზემოთ ნაჩვენები საუკეთესო პროფესიონალის შეფასებები',
          actionRu: 'Покажи отзывы лучшего специалиста из списка выше',
        });
      }
      actions.push({
        type: 'link',
        label: 'Post a Job',
        labelKa: 'განცხადების დამატება',
        labelRu: 'Разместить заказ',
        url: '/post-job',
      });
    }

    // If showing price info, suggest getting quotes
    if (hasPriceInfo) {
      if (toolContext?.categoryQuery) {
        actions.unshift({
          type: 'action',
          label: 'Show top professionals for this',
          labelKa: 'აჩვენე საუკეთესო პროფესიონალები',
          labelRu: 'Показать лучших специалистов',
          action: 'Show me the top professionals for this category',
          actionKa: 'მაჩვენე საუკეთესო პროფესიონალები ამ კატეგორიაში',
          actionRu: 'Покажи лучших специалистов в этой категории',
        });
      }
      actions.push({
        type: 'link',
        label: 'Get Quotes',
        labelKa: 'შეთავაზებების მიღება',
        labelRu: 'Получить предложения',
        url: '/post-job',
      });
    }

    // If showing feature explanation with action URL, add that action
    if (hasFeature) {
      const featureContent = richContent.find(
        (rc) => rc.type === 'FEATURE_EXPLANATION',
      );
      if (featureContent) {
        const feature = featureContent.data as any;
        if (feature.actionUrl) {
          actions.push({
            type: 'link',
            label: feature.actionLabel || 'Learn More',
            labelKa: feature.actionLabelKa,
            labelRu: feature.actionLabelRu,
            url: feature.actionUrl,
          });
        }
        // Use the localized feature TITLE in the action text, never the
        // internal slug. Previously this interpolated `feature.feature`
        // (e.g. "registration_pro") into the user message, producing
        // strings like "მოძებნე დახმარება: registration_pro" - which then
        // appeared as a literal user message and confused the LLM into
        // echoing the slug back. Also rephrased from a colon "tool: arg"
        // shape to natural prose so it reads like something a person
        // would actually type.
        const featureTitleEn = feature.title || 'this topic';
        const featureTitleKa = feature.titleKa || feature.title || 'ეს თემა';
        const featureTitleRu = feature.titleRu || feature.title || 'эта тема';
        actions.push({
          type: 'action',
          label: 'Show related FAQs',
          labelKa: 'იხილე დაკავშირებული კითხვები',
          labelRu: 'Показать связанные вопросы',
          action: `Show me FAQs about ${featureTitleEn}`,
          actionKa: `მაჩვენე ხშირი კითხვები ${featureTitleKa}-ის შესახებ`,
          actionRu: `Покажи частые вопросы о ${featureTitleRu}`,
        });
      }
    }

    // If showing categories, suggest browsing
    if (hasCategories) {
      actions.push({
        type: 'link',
        label: 'Browse Categories',
        labelKa: 'კატეგორიების ნახვა',
        labelRu: 'Просмотр категорий',
        url: '/professionals',
      });
    }

    if ((hasFaqs || hasFeatureList) && !hasProList && !hasPriceInfo) {
      actions.push({
        type: 'action',
        label: 'Ask a follow-up',
        labelKa: 'დასვი დამატებითი კითხვა',
        labelRu: 'Задать уточняющий вопрос',
        action: 'Can you tailor this to my case?',
        actionKa: 'შეგიძლია ეს ჩემს შემთხვევას მოარგო?',
        actionRu: 'Можешь адаптировать это под мой случай?',
      });
    }

    // Light page-aware navigation helpers
    if (currentPage?.startsWith('/professionals/')) {
      actions.push({
        type: 'link',
        label: 'Browse Similar Pros',
        labelKa: 'მსგავსი პროფესიონალები',
        labelRu: 'Похожие специалисты',
        url: '/professionals',
      });
    }

    // Fallback: detect mentions in content
    if (actions.length === 0) {
      if (
        contentLower.includes('professional') ||
        contentLower.includes('პროფესიონალ') ||
        contentLower.includes('специалист')
      ) {
        actions.push({
          type: 'link',
          label: 'Browse Professionals',
          labelKa: 'პროფესიონალების ნახვა',
          labelRu: 'Найти специалистов',
          url: '/professionals',
        });
      }

      if (
        contentLower.includes('post a job') ||
        contentLower.includes('განცხადება') ||
        contentLower.includes('разместить заказ')
      ) {
        actions.push({
          type: 'link',
          label: 'Post a Job',
          labelKa: 'განცხადების დამატება',
          labelRu: 'Разместить заказ',
          url: '/post-job',
        });
      }

      if (
        contentLower.includes('register') ||
        contentLower.includes('რეგისტრაცია') ||
        contentLower.includes('регистрац')
      ) {
        actions.push({
          type: 'link',
          label: 'Register Now',
          labelKa: 'რეგისტრაცია',
          labelRu: 'Регистрация',
          url: '/register',
        });
      }
    }

    return actions.slice(0, 3); // Max 3 actions
  }

  async closeSession(sessionId: string, userId?: string): Promise<void> {
    const session = await this.sessionModel.findById(sessionId).exec();

    if (!session) {
      throw new NotFoundException('Chat session not found');
    }

    if (userId && session.visitorId && session.visitorId.toString() !== userId) {
      throw new NotFoundException('Chat session not found');
    }

    await this.sessionModel.findByIdAndUpdate(sessionId, { status: 'closed' });
  }
}
