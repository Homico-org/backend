import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Offer, OfferStatus } from './schemas/offer.schema';
import { CreateOfferDto } from './dto/create-offer.dto';
import { ProjectRequest } from '../project-request/schemas/project-request.schema';
import { UserRole } from '../users/schemas/user.schema';

type Requester = { userId: string; role?: UserRole | string };

@Injectable()
export class OfferService {
  constructor(
    @InjectModel(Offer.name) private offerModel: Model<Offer>,
    @InjectModel(ProjectRequest.name) private projectRequestModel: Model<ProjectRequest>,
  ) {}

  async create(proId: string, createOfferDto: CreateOfferDto): Promise<Offer> {
    const offer = new this.offerModel({
      proId,
      ...createOfferDto,
    });
    return offer.save();
  }

  /**
   * Access control:
   * - admin: all offers for the project request
   * - client/company (owner): all offers for the project request
   * - pro: only their own offer(s) for the project request
   */
  async findByProjectRequest(projectRequestId: string, requester: Requester): Promise<Offer[]> {
    const pr = await this.projectRequestModel.findById(projectRequestId).exec();
    if (!pr) {
      throw new NotFoundException('Project request not found');
    }

    const role = requester.role as UserRole | string | undefined;
    if (role === UserRole.ADMIN) {
      return this.offerModel
        .find({ projectRequestId })
        .populate('proId')
        .sort({ createdAt: -1 })
        .exec();
    }

    if (role === UserRole.PRO) {
      return this.offerModel
        .find({ projectRequestId, proId: requester.userId })
        .populate('proId')
        .sort({ createdAt: -1 })
        .exec();
    }

    // Client / Company: must own the project request
    if (pr.clientId?.toString() !== requester.userId) {
      throw new ForbiddenException('You do not have access to these offers');
    }

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

  async findOne(id: string, requester: Requester): Promise<Offer> {
    const offer = await this.offerModel
      .findById(id)
      .populate('proId')
      .populate('projectRequestId')
      .exec();

    if (!offer) {
      throw new NotFoundException('Offer not found');
    }

    const role = requester.role as UserRole | string | undefined;
    if (role === UserRole.ADMIN) {
      return offer;
    }

    // Pro can only see their own offers
    if (role === UserRole.PRO) {
      if (offer.proId?.toString() !== requester.userId) {
        throw new ForbiddenException('You do not have access to this offer');
      }
      return offer;
    }

    // Client/Company can see offers for their own project request
    const prId = (offer.projectRequestId as any)?._id?.toString?.() ?? offer.projectRequestId?.toString?.();
    const pr = prId ? await this.projectRequestModel.findById(prId).exec() : null;
    if (!pr || pr.clientId?.toString() !== requester.userId) {
      throw new ForbiddenException('You do not have access to this offer');
    }

    return offer;
  }

  /**
   * Access control:
   * - admin: can update any offer
   * - client/company (owner of project request): can update offer status
   *
   * Note: pros are intentionally NOT allowed to update status to avoid tampering.
   */
  async updateStatus(id: string, status: OfferStatus, requester: Requester): Promise<Offer> {
    const existing = await this.offerModel.findById(id).exec();
    if (!existing) {
      throw new NotFoundException('Offer not found');
    }

    const role = requester.role as UserRole | string | undefined;
    if (role !== UserRole.ADMIN) {
      // Must own the project request to mutate offer status
      const pr = await this.projectRequestModel.findById(existing.projectRequestId).exec();
      if (!pr || pr.clientId?.toString() !== requester.userId) {
        throw new ForbiddenException('You do not have permission to update this offer');
      }
    }

    const offer = await this.offerModel
      .findByIdAndUpdate(id, { status }, { new: true })
      .exec();

    if (!offer) {
      throw new NotFoundException('Offer not found');
    }

    return offer;
  }
}
