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
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ProProfileService } from './pro-profile.service';
import { CreateProProfileDto } from './dto/create-pro-profile.dto';
import { UpdateProProfileDto } from './dto/update-pro-profile.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '../users/schemas/user.schema';

@ApiTags('Pro Profiles')
@Controller('pro-profiles')
export class ProProfileController {
  constructor(private readonly proProfileService: ProProfileService) {}

  @Post()
  @ApiOperation({ summary: 'Create professional profile' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 201, description: 'Profile created successfully' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PRO)
  create(
    @CurrentUser() user: any,
    @Body() createProProfileDto: CreateProProfileDto,
  ) {
    return this.proProfileService.create(user.userId, createProProfileDto);
  }

  @Get('categories')
  @ApiOperation({ summary: 'Get all available categories' })
  @ApiResponse({ status: 200, description: 'List of categories' })
  getCategories() {
    return this.proProfileService.getCategories();
  }

  @Get('locations')
  @ApiOperation({ summary: 'Get location data by country' })
  @ApiQuery({ name: 'country', required: false })
  @ApiResponse({ status: 200, description: 'Location data for country' })
  getLocations(@Query('country') country?: string) {
    return this.proProfileService.getLocations(country);
  }

  @Get()
  @ApiOperation({ summary: 'Get all pro profiles with optional filters and pagination' })
  @ApiQuery({ name: 'category', required: false })
  @ApiQuery({ name: 'subcategory', required: false })
  @ApiQuery({ name: 'serviceArea', required: false })
  @ApiQuery({ name: 'minRating', required: false })
  @ApiQuery({ name: 'minPrice', required: false })
  @ApiQuery({ name: 'maxPrice', required: false })
  @ApiQuery({ name: 'search', required: false, description: 'Search by name, category, title, or description' })
  @ApiQuery({ name: 'sort', required: false })
  @ApiQuery({ name: 'page', required: false, description: 'Page number (1-indexed)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page' })
  @ApiQuery({ name: 'companyIds', required: false, description: 'Comma-separated company IDs to filter by' })
  @ApiResponse({ status: 200, description: 'Paginated list of pro profiles' })
  findAll(
    @Query('category') category?: string,
    @Query('subcategory') subcategory?: string,
    @Query('serviceArea') serviceArea?: string,
    @Query('minRating') minRating?: string,
    @Query('minPrice') minPrice?: string,
    @Query('maxPrice') maxPrice?: string,
    @Query('search') search?: string,
    @Query('sort') sort?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('companyIds') companyIds?: string,
  ) {
    return this.proProfileService.findAll({
      category,
      subcategory,
      serviceArea,
      minRating: minRating ? parseFloat(minRating) : undefined,
      minPrice: minPrice ? parseFloat(minPrice) : undefined,
      maxPrice: maxPrice ? parseFloat(maxPrice) : undefined,
      search,
      sort,
      page: page ? parseInt(page) : undefined,
      limit: limit ? parseInt(limit) : undefined,
      companyIds: companyIds ? companyIds.split(',').filter(id => id.trim()) : undefined,
    });
  }

  @Get('my-profile')
  @ApiOperation({ summary: 'Get current user pro profile' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 200, description: 'Pro profile' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PRO)
  getMyProfile(@CurrentUser() user: any) {
    return this.proProfileService.findByUserId(user.userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get pro profile by ID' })
  @ApiResponse({ status: 200, description: 'Pro profile' })
  @ApiResponse({ status: 404, description: 'Profile not found' })
  findOne(@Param('id') id: string) {
    return this.proProfileService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update pro profile' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 200, description: 'Profile updated successfully' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PRO)
  update(
    @Param('id') id: string,
    @Body() updateProProfileDto: UpdateProProfileDto,
  ) {
    return this.proProfileService.update(id, updateProProfileDto);
  }
}
