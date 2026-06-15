import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';

/**
 * Protects GET /metrics with a static bearer token (METRICS_TOKEN env var).
 * Grafana Cloud's "Metrics Endpoint" integration sends it as
 * `Authorization: Bearer <token>`. If METRICS_TOKEN is unset, the endpoint
 * is closed - locked by default rather than open by default.
 */
@Injectable()
export class MetricsTokenGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.configService.get<string>('METRICS_TOKEN');
    if (!expected) {
      throw new UnauthorizedException('Metrics endpoint is not configured');
    }

    const request = context.switchToHttp().getRequest();
    const header: string = request.headers.authorization ?? '';
    const provided = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';

    const expectedBuf = Buffer.from(expected);
    const providedBuf = Buffer.from(provided);
    const matches =
      expectedBuf.length === providedBuf.length && timingSafeEqual(expectedBuf, providedBuf);
    if (!matches) {
      throw new UnauthorizedException('Invalid metrics token');
    }
    return true;
  }
}
