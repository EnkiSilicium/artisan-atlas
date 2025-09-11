import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrderHistoryController } from 'apps/order-service/src/app/read-model/adapters/http/order-history.controller';
import { OrderStagesReadService } from 'apps/order-service/src/app/read-model/application/query-handlers/history.query-handler';
import { OrderReadTypeOrmOptions } from 'apps/order-service/src/app/read-model/infra/config/typeorm-config';
import { orderReadWinstonConfig } from 'apps/order-service/src/app/read-model/infra/config/winston.config';
import { OrderHistoryProjection } from 'apps/order-service/src/app/read-model/infra/persistence/projections/order-histrory.projection';
import { OrderStageFlatRepo } from 'apps/order-service/src/app/read-model/infra/persistence/repositories/order-history.repository';
import { ORDER_HISTORY_REFRESH_QUEUE } from 'apps/order-service/src/app/read-model/infra/workers/order-history-refresh.token';
import { OrderHistoryRefreshWorker } from 'apps/order-service/src/app/read-model/infra/workers/order-history-refresh.worker';
import {
  HttpErrorInterceptor,
  HttpErrorInterceptorOptions,
} from 'error-handling/interceptor';
import { WinstonModule } from 'nest-winston';
import { OpenTelemetryModule } from 'nestjs-otel';
import { LoggingInterceptor } from 'observability';

@Module({
  imports: [
    TypeOrmModule.forRoot(OrderReadTypeOrmOptions),

    OpenTelemetryModule.forRoot({
      metrics: {
        apiMetrics: {
          enable: true, // Includes api metrics
          defaultAttributes: {
            // You can set default labels for api metrics
            service: 'order-read',
          },
          ignoreUndefinedRoutes: false, //Records metrics for all URLs, even undefined ones
          prefix: 'metrics', // Add a custom prefix to all API metrics
        },
      },
    }),

    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: Number(process.env.REDIS_PORT || 6379),
      },
    }),
    BullModule.registerQueue({
      name: ORDER_HISTORY_REFRESH_QUEUE,
    }),

    WinstonModule.forRoot({
      transports: [orderReadWinstonConfig.transports.consoleTransport],
    }),
  ],
  controllers: [OrderHistoryController],
  providers: [
    OrderStageFlatRepo,
    OrderStagesReadService,
    OrderHistoryProjection,
    OrderHistoryRefreshWorker,

    LoggingInterceptor,
    HttpErrorInterceptor,

    {
      provide: HttpErrorInterceptorOptions,
      useValue: {
        includeTupleInBody: false,
        retryAfterSeconds: 1,
        addNoStoreHeaders: true,
      },
    },
  ],
})
export class OrderReadModule {}
