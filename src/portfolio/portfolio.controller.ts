import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Query,
} from '@nestjs/common';
import { PortfolioService } from './portfolio.service';
import { CreatePortfolioItemDto } from './dto/create-portfolio-item.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../users/schemas/user.schema';

@Controller('portfolio')
export class PortfolioController {
  constructor(private readonly portfolioService: PortfolioService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PRO)
  create(
    @Query('proId') proId: string,
    @Body() createPortfolioItemDto: CreatePortfolioItemDto,
  ) {
    return this.portfolioService.create(proId, createPortfolioItemDto);
  }

  @Get('pro/:proId')
  findByProId(@Param('proId') proId: string) {
    return this.portfolioService.findByProId(proId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.portfolioService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PRO)
  update(
    @Param('id') id: string,
    @Body() updateDto: Partial<CreatePortfolioItemDto>,
  ) {
    return this.portfolioService.update(id, updateDto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PRO)
  remove(@Param('id') id: string) {
    return this.portfolioService.remove(id);
  }
}
