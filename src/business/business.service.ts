import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { QuoteRequest } from './schemas/quote-request.schema';
import { CreateQuoteRequestDto, UpdateQuoteStatusDto } from './dto/create-quote-request.dto';

@Injectable()
export class BusinessService {
  constructor(
    @InjectModel(QuoteRequest.name) private quoteRequestModel: Model<QuoteRequest>,
  ) {}

  async createQuoteRequest(dto: CreateQuoteRequestDto): Promise<{ success: boolean; id: string }> {
    const quoteRequest = new this.quoteRequestModel(dto);
    const saved = await quoteRequest.save();
    return { success: true, id: saved._id.toString() };
  }

  async getQuoteRequests(): Promise<QuoteRequest[]> {
    return this.quoteRequestModel.find().sort({ createdAt: -1 }).exec();
  }

  async getQuoteRequestStats(): Promise<{
    total: number;
    new: number;
    contacted: number;
    converted: number;
    closed: number;
  }> {
    const [total, newCount, contacted, converted, closed] = await Promise.all([
      this.quoteRequestModel.countDocuments(),
      this.quoteRequestModel.countDocuments({ status: 'new' }),
      this.quoteRequestModel.countDocuments({ status: 'contacted' }),
      this.quoteRequestModel.countDocuments({ status: 'converted' }),
      this.quoteRequestModel.countDocuments({ status: 'closed' }),
    ]);
    return { total, new: newCount, contacted, converted, closed };
  }

  async updateQuoteStatus(id: string, dto: UpdateQuoteStatusDto): Promise<QuoteRequest> {
    const quote = await this.quoteRequestModel.findByIdAndUpdate(
      id,
      { status: dto.status },
      { new: true },
    );
    if (!quote) throw new NotFoundException('Quote request not found');
    return quote;
  }

  async deleteQuoteRequest(id: string): Promise<{ success: boolean }> {
    const result = await this.quoteRequestModel.findByIdAndDelete(id);
    if (!result) throw new NotFoundException('Quote request not found');
    return { success: true };
  }
}
