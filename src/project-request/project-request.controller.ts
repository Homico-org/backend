import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ProjectRequestService } from './project-request.service';
import { CreateProjectRequestDto } from './dto/create-project-request.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ProjectStatus } from './schemas/project-request.schema';

@Controller('project-requests')
@UseGuards(JwtAuthGuard)
export class ProjectRequestController {
  constructor(private readonly projectRequestService: ProjectRequestService) {}

  @Post()
  create(
    @CurrentUser() user: any,
    @Body() createProjectRequestDto: CreateProjectRequestDto,
  ) {
    return this.projectRequestService.create(user.userId, createProjectRequestDto);
  }

  @Get()
  findAll(
    @CurrentUser() user: any,
    @Query('category') category?: string,
    @Query('status') status?: ProjectStatus,
  ) {
    const filters: any = {};
    if (user.role === 'client') filters.clientId = user.userId;
    if (user.role === 'pro') filters.proId = user.userId;
    if (category) filters.category = category;
    if (status) filters.status = status;

    return this.projectRequestService.findAll(filters);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.projectRequestService.findOne(id);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body('status') status: ProjectStatus,
  ) {
    return this.projectRequestService.updateStatus(id, status);
  }

  @Patch(':id/assign')
  assignToPro(
    @Param('id') id: string,
    @Body('proId') proId: string,
  ) {
    return this.projectRequestService.assignToPro(id, proId);
  }
}
