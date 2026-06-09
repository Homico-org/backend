import { ArrayMaxSize, IsArray, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

export class CreateBookingDto {
  @IsString()
  professionalId: string;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be in YYYY-MM-DD format' })
  date: string;

  @IsNumber()
  @Min(0)
  @Max(23)
  startHour: number;

  @IsNumber()
  @Min(0)
  @Max(23)
  endHour: number;

  // Caps so a paste attack on the note field doesn't bloat the booking
  // doc or break the rendered booking detail view.
  @IsString()
  @IsOptional()
  @MaxLength(2000)
  note?: string;

  // Cap services per booking - the UI doesn't let you pick more than a
  // handful and the totalAmount/escrow computations iterate this array.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  services?: {
    serviceKey: string;
    name: string;
    nameKa: string;
    quantity: number;
    unitPrice: number;
    unit: string;
    discount?: number;
  }[];

  @IsOptional()
  @IsNumber()
  totalAmount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  // === Project umbrella linkage (2026-05) ===
  // When booking a pro into a Project role, the dashboard passes these so
  // the booking links back to the engagement (and completes it on finish).
  @IsOptional()
  @IsString()
  projectId?: string;

  @IsOptional()
  @IsString()
  engagementId?: string;
}
