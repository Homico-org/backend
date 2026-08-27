import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CancelJobDto {
  @ApiPropertyOptional({ description: 'Why the client is cancelling' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
