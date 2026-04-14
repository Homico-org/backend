import { IsString, IsNumber, IsOptional, IsArray, Min, Max, Matches } from 'class-validator';

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

  @IsString()
  @IsOptional()
  note?: string;

  @IsOptional()
  @IsArray()
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
  address?: string;
}
