import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsEnum, IsOptional, IsBoolean, Matches, Length } from 'class-validator';

export class AddCardPaymentMethodDto {
  @ApiProperty({ example: 'card' })
  @IsEnum(['card'])
  type: 'card';

  @ApiProperty({ example: '4242424242424242', description: 'Full card number (will be masked before storage)' })
  @IsString()
  @Length(13, 19)
  cardNumber: string;

  @ApiProperty({ example: '12/25', description: 'Card expiry in MM/YY format' })
  @IsString()
  @Matches(/^(0[1-9]|1[0-2])\/\d{2}$/, { message: 'Expiry must be in MM/YY format' })
  cardExpiry: string;

  @ApiProperty({ example: 'John Doe' })
  @IsString()
  @Length(2, 100)
  cardholderName: string;

  @ApiPropertyOptional({ example: true, default: false })
  @IsOptional()
  @IsBoolean()
  setAsDefault?: boolean;
}

export class AddBankPaymentMethodDto {
  @ApiProperty({ example: 'bank' })
  @IsEnum(['bank'])
  type: 'bank';

  @ApiProperty({ example: 'TBC Bank' })
  @IsString()
  bankName: string;

  @ApiProperty({ example: 'GE00TB0000000000000000' })
  @IsString()
  iban: string;

  @ApiPropertyOptional({ example: true, default: false })
  @IsOptional()
  @IsBoolean()
  setAsDefault?: boolean;
}

export class PaymentMethodResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ enum: ['card', 'bank'] })
  type: 'card' | 'bank';

  @ApiPropertyOptional({ example: '4242' })
  cardLast4?: string;

  @ApiPropertyOptional({ example: 'Visa' })
  cardBrand?: string;

  @ApiPropertyOptional({ example: '12/25' })
  cardExpiry?: string;

  @ApiPropertyOptional({ example: 'John Doe' })
  cardholderName?: string;

  @ApiPropertyOptional({ example: 'TBC Bank' })
  bankName?: string;

  @ApiPropertyOptional({ example: 'GE00****0000' })
  maskedIban?: string;

  @ApiProperty()
  isDefault: boolean;

  @ApiProperty()
  createdAt: Date;
}

export class SetDefaultPaymentMethodDto {
  @ApiProperty({ description: 'Payment method ID to set as default' })
  @IsString()
  paymentMethodId: string;
}
