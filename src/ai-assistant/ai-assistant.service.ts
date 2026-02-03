import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Model, Types } from 'mongoose';
import OpenAI from 'openai';
import { ChatSession } from './schemas/chat-session.schema';
import { ChatMessage } from './schemas/chat-message.schema';
import { CreateSessionDto, SendMessageDto } from './dto/ai-assistant.dto';

@Injectable()
export class AiAssistantService {
  private openai: OpenAI;

  constructor(
    @InjectModel(ChatSession.name) private sessionModel: Model<ChatSession>,
    @InjectModel(ChatMessage.name) private messageModel: Model<ChatMessage>,
    private configService: ConfigService,
  ) {
    this.openai = new OpenAI({
      apiKey: this.configService.get<string>('OPENAI_API_KEY'),
    });
  }

  private getSystemPrompt(locale: string = 'en', userRole?: string): string {
    const roleContext = userRole === 'pro'
      ? 'The user is a professional/contractor on Homico.'
      : userRole === 'client'
      ? 'The user is a homeowner looking for renovation services.'
      : 'The user is browsing Homico.';

    const prompts = {
      en: `You are Homi, the friendly AI assistant for Homico - Georgia's leading platform connecting homeowners with renovation professionals.

${roleContext}

Your personality:
- Warm, helpful, and knowledgeable about home renovation
- You speak concisely but informatively
- You use occasional friendly emojis sparingly (1-2 per message max)
- You're an expert on Georgian renovation market, pricing, and best practices

You can help with:
1. **Renovation Advice**: Planning projects, choosing materials, understanding timelines
2. **Cost Estimation**: Rough price ranges for different types of work (use Georgian Lari ₾)
3. **Finding Professionals**: Guide users to find the right pro for their needs
4. **Platform Help**: How to post jobs, contact pros, leave reviews
5. **Market Insights**: Typical costs in Tbilisi and Georgia for various renovation work

Key Homico features to mention when relevant:
- Browse verified professionals by category
- Post a job and receive quotes from multiple pros
- View portfolios with before/after photos
- Read genuine reviews from other homeowners
- Free to use for homeowners

Price ranges you know (Tbilisi market, 2024):
- Full apartment renovation: ₾400-800 per m²
- Bathroom renovation: ₾3,000-15,000
- Kitchen renovation: ₾5,000-25,000
- Painting (per m²): ₾8-25
- Flooring installation: ₾15-60 per m²
- Electrical work: ₾300-1,500 per room
- Plumbing work: ₾200-1,000 per fixture

Always be helpful and guide users toward taking action on Homico when appropriate.
If you don't know something specific, suggest they contact a professional through the platform.

Keep responses concise (2-4 sentences typically, unless detailed explanation is needed).`,

      ka: `შენ ხარ ჰომი - Homico-ს მეგობრული AI ასისტენტი. Homico არის საქართველოს წამყვანი პლატფორმა, რომელიც აკავშირებს სახლის მფლობელებს რემონტის პროფესიონალებთან.

${roleContext}

შენი პიროვნება:
- თბილი, დამხმარე და რემონტის საკითხებში მცოდნე
- საუბრობ მოკლედ, მაგრამ ინფორმატიულად
- იშვიათად იყენებ მეგობრულ emoji-ებს (მაქსიმუმ 1-2 შეტყობინებაში)
- ექსპერტი ხარ ქართულ სარემონტო ბაზარზე, ფასებსა და საუკეთესო პრაქტიკაში

შეგიძლია დაეხმარო:
1. **რემონტის რჩევები**: პროექტების დაგეგმვა, მასალების შერჩევა, ვადების გაგება
2. **ღირებულების შეფასება**: სხვადასხვა ტიპის სამუშაოს სავარაუდო ფასები (ლარში ₾)
3. **პროფესიონალების პოვნა**: მომხმარებლების მიმართვა შესაფერისი სპეციალისტისკენ
4. **პლატფორმის დახმარება**: როგორ განათავსონ განცხადება, დაუკავშირდნენ პროფესიონალებს
5. **საბაზრო ინფორმაცია**: ტიპიური ფასები თბილისსა და საქართველოში

Homico-ს მთავარი ფუნქციები:
- ვერიფიცირებული პროფესიონალების დათვალიერება კატეგორიების მიხედვით
- განცხადების განთავსება და რამდენიმე სპეციალისტისგან შეთავაზების მიღება
- პორტფოლიოების ნახვა "მანამდე და შემდეგ" ფოტოებით
- ნამდვილი შეფასებების წაკითხვა სხვა მომხმარებლებისგან
- უფასო მომხმარებლებისთვის

პასუხები იყოს მოკლე (ჩვეულებრივ 2-4 წინადადება, თუ დეტალური ახსნა არ არის საჭირო).`,

      ru: `Ты Homi - дружелюбный AI-ассистент Homico, ведущей платформы Грузии, соединяющей домовладельцев с профессионалами по ремонту.

${roleContext}

Твоя личность:
- Тёплый, отзывчивый и знающий в вопросах ремонта
- Говоришь кратко, но информативно
- Редко используешь дружелюбные эмодзи (максимум 1-2 на сообщение)
- Эксперт по грузинскому рынку ремонта, ценам и лучшим практикам

Ты можешь помочь с:
1. **Советы по ремонту**: Планирование проектов, выбор материалов, понимание сроков
2. **Оценка стоимости**: Примерные цены на разные виды работ (в лари ₾)
3. **Поиск профессионалов**: Направить к нужному специалисту
4. **Помощь с платформой**: Как разместить заказ, связаться с мастерами
5. **Информация о рынке**: Типичные цены в Тбилиси и Грузии

Основные функции Homico:
- Просмотр верифицированных профессионалов по категориям
- Размещение заказа и получение предложений от нескольких мастеров
- Просмотр портфолио с фото "до и после"
- Чтение настоящих отзывов от других клиентов
- Бесплатно для домовладельцев

Ответы должны быть краткими (обычно 2-4 предложения, если не нужно детальное объяснение).`
    };

    return prompts[locale] || prompts.en;
  }

  async createSession(userId: string | null, dto: CreateSessionDto): Promise<ChatSession> {
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

  async findActiveSession(userId?: string, anonymousId?: string): Promise<ChatSession | null> {
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
  ): Promise<{ response: string; suggestedActions?: any[] }> {
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
      { role: 'system', content: this.getSystemPrompt(locale, session.context?.userRole) },
      ...history.reverse().map(msg => ({
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
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages,
        max_tokens: 500,
        temperature: 0.7,
      });

      const assistantContent = completion.choices[0]?.message?.content ||
        (locale === 'ka' ? 'ბოდიში, ვერ დავამუშავე თქვენი მოთხოვნა.' :
         locale === 'ru' ? 'Извините, не удалось обработать ваш запрос.' :
         'Sorry, I could not process your request.');

      const processingTimeMs = Date.now() - startTime;

      // Generate suggested actions based on response content
      const suggestedActions = this.generateSuggestedActions(assistantContent, locale);

      // Save assistant message
      const assistantMessage = new this.messageModel({
        sessionId: new Types.ObjectId(sessionId),
        role: 'assistant',
        content: assistantContent,
        metadata: {
          tokensUsed: completion.usage?.total_tokens,
          model: 'gpt-4o-mini',
          processingTimeMs,
          suggestedActions,
        },
      });
      await assistantMessage.save();

      // Update session
      await this.sessionModel.findByIdAndUpdate(sessionId, {
        $inc: { messageCount: 2 },
        lastMessageAt: new Date(),
      });

      return { response: assistantContent, suggestedActions };
    } catch (error) {
      console.error('OpenAI API error:', error);

      const errorMessage = locale === 'ka'
        ? 'ბოდიში, დროებით ვერ ვპასუხობ. გთხოვთ სცადოთ მოგვიანებით.'
        : locale === 'ru'
        ? 'Извините, временно не могу ответить. Попробуйте позже.'
        : 'Sorry, I\'m temporarily unable to respond. Please try again later.';

      return { response: errorMessage };
    }
  }

  private generateSuggestedActions(content: string, locale: string): any[] {
    const actions: any[] = [];
    const contentLower = content.toLowerCase();

    // Detect if response mentions finding professionals
    if (contentLower.includes('professional') || contentLower.includes('პროფესიონალ') ||
        contentLower.includes('специалист') || contentLower.includes('browse')) {
      actions.push({
        type: 'link',
        label: locale === 'ka' ? 'პროფესიონალების ნახვა' : locale === 'ru' ? 'Найти специалистов' : 'Browse Professionals',
        url: '/browse/professionals',
      });
    }

    // Detect if response mentions posting a job
    if (contentLower.includes('post a job') || contentLower.includes('განცხადება') ||
        contentLower.includes('разместить заказ') || contentLower.includes('quote')) {
      actions.push({
        type: 'link',
        label: locale === 'ka' ? 'განცხადების დამატება' : locale === 'ru' ? 'Разместить заказ' : 'Post a Job',
        url: '/jobs/create',
      });
    }

    // Detect pricing/estimation mentions
    if (contentLower.includes('estimate') || contentLower.includes('შეფასება') ||
        contentLower.includes('калькулятор') || contentLower.includes('calculator')) {
      actions.push({
        type: 'link',
        label: locale === 'ka' ? 'ფასის კალკულატორი' : locale === 'ru' ? 'Калькулятор цен' : 'Price Calculator',
        url: '/calculator',
      });
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
