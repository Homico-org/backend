import { IsEnum, IsOptional, IsString } from 'class-validator';
import { BookingStatus } from '../schemas/booking.schema';

export class UpdateBookingStatusDto {
  @IsEnum(BookingStatus)
  status: BookingStatus;

  @IsString()
  @IsOptional()
  cancelReason?: string;
}
