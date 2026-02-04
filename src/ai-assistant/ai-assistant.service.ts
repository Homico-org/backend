import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Model, Types } from 'mongoose';
import OpenAI from 'openai';
import { ChatSession } from './schemas/chat-session.schema';
import { ChatMessage } from './schemas/chat-message.schema';
import { CreateSessionDto, SendMessageDto } from './dto/ai-assistant.dto';
import { AiToolsService } from './ai-tools.service';
import {
  RichContent,
  AiAssistantResponse,
  SuggestedAction,
} from './dto/rich-content.dto';

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
              'The category key to search in (e.g., "plumbing", "electrical", "interior-design", "construction", "painting", "flooring"). Use lowercase with hyphens.',
          },
          subcategory: {
            type: 'string',
            description: 'Optional subcategory to narrow the search.',
          },
          minRating: {
            type: 'number',
            description:
              'Minimum rating (0-5). Use 4 or 4.5 for "best" or "top rated" requests.',
          },
          minPrice: {
            type: 'number',
            description: 'Minimum price in GEL.',
          },
          maxPrice: {
            type: 'number',
            description: 'Maximum price in GEL for budget searches.',
          },
          sort: {
            type: 'string',
            enum: ['rating', 'reviews', 'price-low', 'price-high', 'newest'],
            description:
              'How to sort results. Use "rating" for best/top requests, "reviews" for most reviewed, "price-low" for budget options.',
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
        'Explain a Homico platform feature. Use this when users ask how to do something on Homico, like registering, posting jobs, or finding professionals.',
      parameters: {
        type: 'object',
        properties: {
          feature: {
            type: 'string',
            description:
              'The feature to explain. Examples: "registration", "register professional", "post job", "find professionals", "verification", "messaging", "proposals", "reviews", "portfolio", "how it works".',
          },
        },
        required: ['feature'],
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
  ) {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    if (apiKey) {
      this.openai = new OpenAI({ apiKey });
    } else {
      console.warn('[AiAssistantService] OPENAI_API_KEY not configured. AI chat will be disabled.');
    }
  }

  private getSystemPrompt(locale: string = 'en', userRole?: string): string {
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

IMPORTANT GUIDELINES:
1. When users ask about professionals, ALWAYS use search_professionals to show real data
2. When users ask about prices/costs, use get_price_ranges for real pricing data
3. When users ask "how do I" questions, use explain_feature to provide step-by-step guidance
4. When users ask about services/categories, use get_categories to show available options
5. After calling a tool, provide a helpful summary of the results
6. If a tool returns no results, suggest alternative approaches`;

    const prompts = {
      en: `You are Homi, the intelligent AI assistant for Homico - Georgia's leading platform connecting homeowners with renovation professionals.

${roleContext}

${toolInstructions}

Your personality:
- Warm, helpful, and knowledgeable about home renovation
- You speak concisely but informatively
- You use occasional friendly emojis sparingly (1-2 per message max)
- You're an expert on Georgian renovation market, pricing, and best practices

You can help with:
1. **Finding Professionals**: Search our database to find the best pros for any job
2. **Cost Estimation**: Show real price ranges from professionals on the platform
3. **Platform Help**: Explain how to register, post jobs, contact pros, etc.
4. **Renovation Advice**: Planning projects, choosing materials, understanding timelines

Keep responses concise (2-4 sentences typically, unless showing detailed information).
When showing professionals or prices, let the rich content speak for itself - don't repeat all the details in text.`,

      ka: `შენ ხარ ჰომი - Homico-ს ინტელექტუალური AI ასისტენტი. Homico არის საქართველოს წამყვანი პლატფორმა, რომელიც აკავშირებს სახლის მფლობელებს რემონტის პროფესიონალებთან.

${roleContext}

${toolInstructions}

შენი პიროვნება:
- თბილი, დამხმარე და რემონტის საკითხებში მცოდნე
- საუბრობ მოკლედ, მაგრამ ინფორმატიულად
- იშვიათად იყენებ მეგობრულ emoji-ებს (მაქსიმუმ 1-2 შეტყობინებაში)
- ექსპერტი ხარ ქართულ სარემონტო ბაზარზე, ფასებსა და საუკეთესო პრაქტიკაში

შეგიძლია დაეხმარო:
1. **პროფესიონალების პოვნა**: მოძებნე საუკეთესო სპეციალისტები ნებისმიერი სამუშაოსთვის
2. **ღირებულების შეფასება**: აჩვენე რეალური ფასები პლატფორმის პროფესიონალებისგან
3. **პლატფორმის დახმარება**: ახსენი როგორ დარეგისტრირდნენ, განათავსონ განცხადება და ა.შ.
4. **რემონტის რჩევები**: პროექტების დაგეგმვა, მასალების შერჩევა

პასუხები იყოს მოკლე (ჩვეულებრივ 2-4 წინადადება).`,

      ru: `Ты Homi - интеллектуальный AI-ассистент Homico, ведущей платформы Грузии, соединяющей домовладельцев с профессионалами по ремонту.

${roleContext}

${toolInstructions}

Твоя личность:
- Тёплый, отзывчивый и знающий в вопросах ремонта
- Говоришь кратко, но информативно
- Редко используешь дружелюбные эмодзи (максимум 1-2 на сообщение)
- Эксперт по грузинскому рынку ремонта, ценам и лучшим практикам

Ты можешь помочь с:
1. **Поиск профессионалов**: Найти лучших специалистов для любой работы
2. **Оценка стоимости**: Показать реальные цены от специалистов на платформе
3. **Помощь с платформой**: Объяснить как регистрироваться, размещать заказы и т.д.
4. **Советы по ремонту**: Планирование проектов, выбор материалов

Ответы должны быть краткими (обычно 2-4 предложения).`,
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

    // Save user message
    const userMessage = new this.messageModel({
      sessionId: new Types.ObjectId(sessionId),
      role: 'user',
      content: dto.message,
    });
    await userMessage.save();

    // Get conversation history (last 10 messages for context)
    const history = await this.messageModel
      .find({ sessionId: new Types.ObjectId(sessionId) })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean()
      .exec();

    // Build messages array for OpenAI
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
        max_tokens: 1000,
        temperature: 0.7,
      });

      let assistantMessage = completion.choices[0]?.message;
      const richContent: RichContent[] = [];

      // Process tool calls if any
      if (assistantMessage?.tool_calls && assistantMessage.tool_calls.length > 0) {
        // Add assistant message with tool calls to conversation
        messages.push(assistantMessage as OpenAI.Chat.ChatCompletionMessageParam);

        // Execute each tool call
        for (const toolCall of assistantMessage.tool_calls) {
          // Type guard for function tool calls
          if (toolCall.type !== 'function') continue;

          const toolResult = await this.executeToolCall(
            toolCall.function.name,
            JSON.parse(toolCall.function.arguments),
            locale as 'en' | 'ka' | 'ru',
          );

          // Add tool result to rich content if it has data
          if (toolResult.richContent) {
            richContent.push(toolResult.richContent);
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
          max_tokens: 500,
          temperature: 0.7,
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

      return {
        response: assistantContent,
        richContent: richContent.length > 0 ? richContent : undefined,
        suggestedActions: suggestedActions.length > 0 ? suggestedActions : undefined,
      };
    } catch (error) {
      console.error('OpenAI API error:', error);

      const errorMessage =
        locale === 'ka'
          ? 'ბოდიში, დროებით ვერ ვპასუხობ. გთხოვთ სცადოთ მოგვიანებით.'
          : locale === 'ru'
            ? 'Извините, временно не могу ответить. Попробуйте позже.'
            : "Sorry, I'm temporarily unable to respond. Please try again later.";

      return { response: errorMessage };
    }
  }

  private async executeToolCall(
    toolName: string,
    args: any,
    locale: 'en' | 'ka' | 'ru',
  ): Promise<{ summary: any; richContent?: RichContent }> {
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
          });

          const professionals = result.data as any[];
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
            richContent: professionals.length > 0 ? result : undefined,
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
            richContent: result,
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
            richContent: reviews.length > 0 ? result : undefined,
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
            richContent: categories.length > 0 ? result : undefined,
          };
        }

        case 'get_price_ranges': {
          const result = await this.aiToolsService.getPriceRanges(args.category);
          const priceInfo = result.data as any;
          return {
            summary: {
              category: priceInfo.category,
              averagePrice: priceInfo.averagePrice,
              priceRanges: priceInfo.priceRanges,
              professionalCount: priceInfo.professionalCount,
            },
            richContent: result,
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
          return {
            summary: {
              feature: feature.feature,
              title: locale === 'ka' ? feature.titleKa : locale === 'ru' ? feature.titleRu : feature.title,
              steps: feature.steps?.length || 0,
              actionUrl: feature.actionUrl,
            },
            richContent: result,
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

    // If showing professionals, suggest browsing more or posting a job
    if (hasProList) {
      actions.push({
        type: 'link',
        label: 'View All Professionals',
        labelKa: 'ყველა პროფესიონალის ნახვა',
        labelRu: 'Все специалисты',
        url: '/browse/professionals',
      });
      actions.push({
        type: 'link',
        label: 'Post a Job',
        labelKa: 'განცხადების დამატება',
        labelRu: 'Разместить заказ',
        url: '/jobs/create',
      });
    }

    // If showing price info, suggest getting quotes
    if (hasPriceInfo) {
      actions.push({
        type: 'link',
        label: 'Get Quotes',
        labelKa: 'შეთავაზებების მიღება',
        labelRu: 'Получить предложения',
        url: '/jobs/create',
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
      }
    }

    // If showing categories, suggest browsing
    if (hasCategories) {
      actions.push({
        type: 'link',
        label: 'Browse Categories',
        labelKa: 'კატეგორიების ნახვა',
        labelRu: 'Просмотр категорий',
        url: '/browse/professionals',
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
          url: '/browse/professionals',
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
          url: '/jobs/create',
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
          url: '/auth/signup',
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
