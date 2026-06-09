import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { BookingStatus } from '../schemas/booking.schema';

export class UpdateBookingStatusDto {
  @IsEnum(BookingStatus)
  status: BookingStatus;

  // 500 chars is more than enough for a cancellation reason and prevents
  // a paste-attack on the audit log / notification body.
  @IsString()
  @IsOptional()
  @MaxLength(500)
  cancelReason?: string;
}
