import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { OfferService } from './offer.service';
import { CreateOfferDto } from './dto/create-offer.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '../users/schemas/user.schema';
import { OfferStatus } from './schemas/offer.schema';

@Controller('offers')
@UseGuards(JwtAuthGuard)
export class OfferController {
  constructor(private readonly offerService: OfferService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.PRO)
  create(
    @CurrentUser() user: any,
    @Body() createOfferDto: CreateOfferDto,
  ) {
    return this.offerService.create(user.userId, createOfferDto);
  }

  @Get('project/:projectRequestId')
  findByProjectRequest(
    @CurrentUser() user: any,
    @Param('projectRequestId') projectRequestId: string,
  ) {
    return this.offerService.findByProjectRequest(projectRequestId, user);
  }

  @Get('my-offers')
  @UseGuards(RolesGuard)
  @Roles(UserRole.PRO)
  findByPro(@CurrentUser() user: any) {
    return this.offerService.findByPro(user.userId);
  }

  @Get(':id')
  findOne(@CurrentUser() user: any, @Param('id') id: string) {
    return this.offerService.findOne(id, user);
  }

  @Patch(':id/status')
  updateStatus(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body('status') status: OfferStatus,
  ) {
    return this.offerService.updateStatus(id, status, user);
  }
}
