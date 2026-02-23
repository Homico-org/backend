import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsString, IsEnum, IsOptional, IsBoolean, IsNumber } from 'class-validator';

export class AddServiceAddressDto {
  @ApiProperty({ enum: ['home', 'work', 'custom'] })
  @IsEnum(['home', 'work', 'custom'])
  label: 'home' | 'work' | 'custom';

  @ApiPropertyOptional({ description: 'Custom label when label is "custom"' })
  @IsString()
  @IsOptional()
  customLabel?: string;

  @ApiProperty({ example: '12 Rustaveli Ave, Tbilisi, Georgia' })
  @IsString()
  formattedAddress: string;

  @ApiProperty({ example: 41.7151 })
  @IsNumber()
  lat: number;

  @ApiProperty({ example: 44.8271 })
  @IsNumber()
  lng: number;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  apartment?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  floor?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  entrance?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiPropertyOptional({ default: false })
  @IsBoolean()
  @IsOptional()
  setAsDefault?: boolean;
}

export class UpdateServiceAddressDto extends PartialType(AddServiceAddressDto) {}

export class SetDefaultAddressDto {
  @ApiProperty({ description: 'Address ID to set as default' })
  @IsString()
  addressId: string;
}
