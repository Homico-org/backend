import {
  Controller,
  Post,
  Get,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { BookingsService } from './bookings.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { UpdateBookingStatusDto } from './dto/update-booking-status.dto';

@ApiTags('Bookings')
@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a booking' })
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  async create(
    @CurrentUser() user: any,
    @Body() dto: CreateBookingDto,
  ) {
    return this.bookingsService.create(user.userId, dto);
  }

  @Get('my')
  @ApiOperation({ summary: 'List my bookings (as client or pro)' })
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  async getMyBookings(
    @CurrentUser() user: any,
    @Query('status') status?: string,
    @Query('upcoming') upcoming?: string,
  ) {
    return this.bookingsService.findUserBookings(user.userId, {
      status,
      upcoming: upcoming === 'true',
    });
  }

  @Get('pro/:proId/availability')
  @ApiOperation({ summary: 'Get available slots for a pro on a date' })
  @ApiResponse({ status: 200, description: 'Array of time slots' })
  async getAvailability(
    @Param('proId') proId: string,
    @Query('date') date: string,
  ) {
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return { error: 'date query param required in YYYY-MM-DD format' };
    }
    return this.bookingsService.getAvailability(proId, date);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get booking detail' })
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  async getBooking(
    @CurrentUser() user: any,
    @Param('id') id: string,
  ) {
    return this.bookingsService.findById(id, user.userId);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Update booking status (confirm/cancel/complete)' })
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  async updateStatus(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: UpdateBookingStatusDto,
  ) {
    return this.bookingsService.updateStatus(id, user.userId, dto);
  }
}
