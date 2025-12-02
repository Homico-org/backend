import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Offer, OfferStatus } from './schemas/offer.schema';
import { CreateOfferDto } from './dto/create-offer.dto';

@Injectable()
export class OfferService {
  constructor(
    @InjectModel(Offer.name) private offerModel: Model<Offer>,
  ) {}

  async create(proId: string, createOfferDto: CreateOfferDto): Promise<Offer> {
    const offer = new this.offerModel({
      proId,
      ...createOfferDto,
    });
    return offer.save();
  }

  async findByProjectRequest(projectRequestId: string): Promise<Offer[]> {
    return this.offerModel
      .find({ projectRequestId })
      .populate('proId')
      .sort({ createdAt: -1 })
      .exec();
  }

  async findByPro(proId: string): Promise<Offer[]> {
    return this.offerModel
      .find({ proId })
      .populate('projectRequestId')
      .sort({ createdAt: -1 })
      .exec();
  }

  async findOne(id: string): Promise<Offer> {
    const offer = await this.offerModel
      .findById(id)
      .populate('proId')
      .populate('projectRequestId')
      .exec();

    if (!offer) {
      throw new NotFoundException('Offer not found');
    }

    return offer;
  }

  async updateStatus(id: string, status: OfferStatus): Promise<Offer> {
    const offer = await this.offerModel
      .findByIdAndUpdate(id, { status }, { new: true })
      .exec();

    if (!offer) {
      throw new NotFoundException('Offer not found');
    }

    return offer;
  }
}
