import { Controller, Get, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { PrometheusController } from '@willsoto/nestjs-prometheus';
import { SkipThrottle } from '@nestjs/throttler';
import { MetricsTokenGuard } from './metrics-token.guard';

// The controller prefix (/metrics) comes from PrometheusModule.register's
// `path` option, which it stamps onto this class - hence the bare @Get().
// @SkipThrottle so the Grafana scraper (every 15-60s from fixed IPs) never
// trips the global rate limits and punches a hole in the monitoring itself.
@Controller()
@SkipThrottle()
@UseGuards(MetricsTokenGuard)
export class MetricsController extends PrometheusController {
  @Get()
  async index(@Res({ passthrough: true }) response: Response) {
    return super.index(response);
  }
}
