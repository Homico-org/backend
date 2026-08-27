import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";

import { CurrentUser } from "../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { BookingSeriesService } from "./booking-series.service";
import { CreateBookingSeriesDto } from "./dto/create-booking-series.dto";
import {
  CancelBookingSeriesDto,
  PauseBookingSeriesDto,
} from "./dto/update-booking-series.dto";

@ApiTags("Booking Series")
@Controller("booking-series")
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class BookingSeriesController {
  constructor(private readonly seriesService: BookingSeriesService) {}

  @Post()
  @ApiOperation({ summary: "Create a recurring cleaning booking" })
  @ApiResponse({ status: 201, description: "Series created with its first visits" })
  async create(
    @Body() dto: CreateBookingSeriesDto,
    @CurrentUser() user: { userId: string },
  ) {
    return this.seriesService.create(user.userId, dto);
  }

  @Get()
  @ApiOperation({ summary: "List my recurring bookings" })
  async findMine(@CurrentUser() user: { userId: string }) {
    return this.seriesService.findMine(user.userId);
  }

  @Patch(":id/pause")
  @ApiOperation({ summary: "Pause or resume a recurring booking" })
  async setPaused(
    @Param("id") id: string,
    @Body() dto: PauseBookingSeriesDto,
    @CurrentUser() user: { userId: string },
  ) {
    return this.seriesService.setPaused(id, user.userId, dto.paused);
  }

  @Post(":id/cancel")
  @ApiOperation({
    summary: "Cancel a recurring booking and drop its future visits",
  })
  async cancel(
    @Param("id") id: string,
    @Body() dto: CancelBookingSeriesDto,
    @CurrentUser() user: { userId: string },
  ) {
    return this.seriesService.cancelSeries(id, user.userId, dto?.reason);
  }
}
