import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { Histogram } from 'prom-client';
import { HTTP_REQUEST_DURATION_SECONDS } from './metrics.constants';

/**
 * Records every HTTP request into a Prometheus histogram labeled by
 * method / route / status. Runs as middleware (before guards) so requests
 * rejected by the ThrottlerGuard (429) are counted too - those are exactly
 * the abuse signals this monitoring exists to surface.
 */
@Injectable()
export class HttpMetricsMiddleware implements NestMiddleware {
  constructor(
    @InjectMetric(HTTP_REQUEST_DURATION_SECONDS)
    private readonly httpRequestDuration: Histogram<string>,
  ) {}

  use(req: Request, res: Response, next: NextFunction) {
    const start = process.hrtime.bigint();

    res.on('finish', () => {
      // Use the matched route PATTERN (/users/:id), never the raw URL - raw
      // URLs contain ids and would explode the metric's label cardinality.
      const route = req.route?.path ?? 'unmatched';
      if (route === '/metrics') return;

      const seconds = Number(process.hrtime.bigint() - start) / 1e9;
      this.httpRequestDuration.observe(
        { method: req.method, route, status: String(res.statusCode) },
        seconds,
      );
    });

    next();
  }
}
