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
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '../users/schemas/user.schema';

@Controller('portfolio')
export class PortfolioController {
  constructor(private readonly portfolioService: PortfolioService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PRO, UserRole.ADMIN)
  create(
    @CurrentUser() user: { userId: string; role: string },
    @Query('proId') proId: string,
    @Body() createPortfolioItemDto: CreatePortfolioItemDto,
  ) {
    // A pro can only create items under their OWN id; the ?proId query is
    // honoured only for admins (who legitimately edit other pros' portfolios).
    const ownerId =
      user.role === UserRole.ADMIN && proId ? proId : user.userId;
    return this.portfolioService.create(ownerId, createPortfolioItemDto);
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
  @Roles(UserRole.PRO, UserRole.ADMIN)
  update(
    @CurrentUser() user: { userId: string; role: string },
    @Param('id') id: string,
    @Body() updateDto: Partial<CreatePortfolioItemDto>,
  ) {
    // Non-admins may only mutate items they own.
    const ownerId = user.role === UserRole.ADMIN ? undefined : user.userId;
    return this.portfolioService.update(id, updateDto, ownerId);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PRO, UserRole.ADMIN)
  remove(
    @CurrentUser() user: { userId: string; role: string },
    @Param('id') id: string,
  ) {
    const ownerId = user.role === UserRole.ADMIN ? undefined : user.userId;
    return this.portfolioService.remove(id, ownerId);
  }
}
