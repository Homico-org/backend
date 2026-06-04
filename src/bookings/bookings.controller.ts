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
import { StartWorkDto } from './dto/start-work.dto';
import { CompleteWorkDto } from './dto/complete-work.dto';

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

  @Get('my/pending-count')
  @ApiOperation({ summary: 'Count pending/confirmed bookings for current user' })
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  async getPendingCount(@CurrentUser() user: { userId: string }) {
    return this.bookingsService.getPendingCount(user.userId);
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

  @Get('pro/:proId/availability/range')
  @ApiOperation({
    summary:
      'Bulk per-day availability summary so the booking modal can pre-mark unavailable days without 14 round-trips',
  })
  @ApiResponse({
    status: 200,
    description: 'Array of { date, hasSlots } for the requested range',
  })
  async getAvailabilityRange(
    @Param('proId') proId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    const iso = /^\d{4}-\d{2}-\d{2}$/;
    if (!from || !to || !iso.test(from) || !iso.test(to)) {
      return {
        error: 'from and to query params required in YYYY-MM-DD format',
      };
    }
    return this.bookingsService.getAvailabilityRange(proId, from, to);
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

  @Patch(':id/start')
  @ApiOperation({ summary: 'Start work on a confirmed booking (pro only)' })
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  async startWork(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: StartWorkDto,
  ) {
    return this.bookingsService.startWork(id, user.userId, dto);
  }

  @Patch(':id/complete')
  @ApiOperation({ summary: 'Complete work on an in-progress booking (pro only)' })
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  async completeWork(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: CompleteWorkDto,
  ) {
    return this.bookingsService.completeWork(id, user.userId, dto);
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

  // ===== Payment-aware endpoints (added 2026-05) =====

  /**
   * Payment summary for the pay page. Returns provider, status, amount,
   * and redirectUrl - enough for the page to render "Pay X with [provider]".
   */
  @Get(':id/payment')
  @ApiOperation({ summary: 'Get payment status + redirect URL for a booking' })
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  async getPayment(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
  ) {
    return this.bookingsService.getPaymentSummary(id, user.userId);
  }

  /**
   * Create a fresh payment intent for an AWAITING_PAYMENT booking whose
   * previous intent failed, was cancelled, or timed out.
   */
  @Post(':id/retry-payment')
  @ApiOperation({ summary: 'Create a fresh payment intent for retry' })
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  async retryPayment(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
  ) {
    return this.bookingsService.retryPayment(id, user.userId);
  }

  /**
   * Force a status refresh from the payment provider. Frontend calls this
   * from the /bookings/[id]/pay/return page after the user comes back
   * from the provider's hosted page, so the UI doesn't have to wait for
   * the webhook to land.
   */
  @Post(':id/reconcile-payment')
  @ApiOperation({ summary: 'Re-fetch payment status from provider' })
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  async reconcilePayment(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
  ) {
    return this.bookingsService.reconcilePayment(id, user.userId);
  }

  /**
   * Client confirms work was completed. Releases escrow to PENDING_RELEASE.
   * Only the client can call this.
   */
  @Post(':id/confirm-completion')
  @ApiOperation({ summary: 'Client confirms work completion (escrow to release)' })
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  async confirmCompletion(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
  ) {
    return this.bookingsService.clientConfirm(id, user.userId);
  }

  /**
   * Cancellation quote. Returns the refund/payout split that would apply
   * if the user cancelled right now. Frontend calls this when the user
   * clicks "Cancel" to render the preview before they confirm.
   */
  @Get(':id/cancellation-quote')
  @ApiOperation({ summary: 'Refund + payout preview for cancellation' })
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  async getCancellationQuote(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
  ) {
    return this.bookingsService.getCancellationQuote(id, user.userId);
  }

  /**
   * Either party cancels. Refund + pro payout split follows the
   * time-based policy (see BookingsService.computeCancellationQuote).
   */
  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancel a booking (either party)' })
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  async cancelBooking(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() body: { reason?: string },
  ) {
    return this.bookingsService.cancel(id, user.userId, body.reason);
  }

  /**
   * Raise a dispute. Freezes the escrow until admin resolves.
   */
  @Post(':id/dispute')
  @ApiOperation({ summary: 'Raise a dispute on a booking' })
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  async raiseDispute(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body()
    body: {
      type: 'pro_noshow' | 'client_noshow' | 'quality' | 'other';
      description: string;
      evidenceUrls?: string[];
    },
  ) {
    return this.bookingsService.raiseDispute(id, user.userId, body);
  }
}
