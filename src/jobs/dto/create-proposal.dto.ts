import { IsString, IsNotEmpty, IsNumber, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateProposalDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  coverLetter: string;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  proposedPrice?: number;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  estimatedDuration?: number;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  estimatedDurationUnit?: string;
}
