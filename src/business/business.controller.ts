import { Controller, Post, Get, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { BusinessService } from './business.service';
import { CreateQuoteRequestDto, UpdateQuoteStatusDto } from './dto/create-quote-request.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../users/schemas/user.schema';

@Controller('business')
export class BusinessController {
  constructor(private readonly businessService: BusinessService) {}

  @Post('quote-request')
  createQuoteRequest(@Body() dto: CreateQuoteRequestDto) {
    return this.businessService.createQuoteRequest(dto);
  }

  @Get('quote-requests')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  getQuoteRequests() {
    return this.businessService.getQuoteRequests();
  }

  @Get('quote-requests/stats')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  getQuoteRequestStats() {
    return this.businessService.getQuoteRequestStats();
  }

  @Patch('quote-requests/:id/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  updateQuoteStatus(@Param('id') id: string, @Body() dto: UpdateQuoteStatusDto) {
    return this.businessService.updateQuoteStatus(id, dto);
  }

  @Delete('quote-requests/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  deleteQuoteRequest(@Param('id') id: string) {
    return this.businessService.deleteQuoteRequest(id);
  }
}
