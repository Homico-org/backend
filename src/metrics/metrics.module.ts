import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { PrometheusModule, makeHistogramProvider } from '@willsoto/nestjs-prometheus';
import { MetricsController } from './metrics.controller';
import { HttpMetricsMiddleware } from './http-metrics.middleware';
import { HTTP_REQUEST_DURATION_SECONDS } from './metrics.constants';

@Module({
  imports: [
    PrometheusModule.register({
      controller: MetricsController,
      // Node.js process metrics (event loop lag, memory, CPU) for free
      defaultMetrics: { enabled: true },
    }),
  ],
  providers: [
    // One histogram covers both questions: request RATE per route/status
    // (via _count) and LATENCY percentiles (via _bucket). No separate counter.
    makeHistogramProvider({
      name: HTTP_REQUEST_DURATION_SECONDS,
      help: 'HTTP request duration in seconds, by method, route pattern and status code',
      labelNames: ['method', 'route', 'status'],
      buckets: [0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    }),
  ],
})
export class MetricsModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(HttpMetricsMiddleware).forRoutes('*');
  }
}
