import { IsIn } from 'class-validator';

export class SendAssistedJobLinkDto {
  @IsIn(['sms', 'email'])
  channel: 'sms' | 'email';
}
