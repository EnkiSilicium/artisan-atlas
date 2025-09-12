import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BonusReadController } from 'apps/bonus-service/src/app/modules/read-projection/adapters/inbound/http/bonus-read.controller';
import { BonusReadHandler } from 'apps/bonus-service/src/app/modules/read-projection/application/bonus-read/bonus-read.query-handler';
import { bonusReadTypeOrmOptions } from 'apps/bonus-service/src/app/modules/read-projection/infra/config/typeorm-config';
import { bonusReadWinstonConfig } from 'apps/bonus-service/src/app/modules/read-projection/infra/config/winston.config';
import { BonusReadProjection } from 'apps/bonus-service/src/app/modules/read-projection/infra/persistence/projections/bonus-read.projection';
import { BonusReadRepo } from 'apps/bonus-service/src/app/modules/read-projection/infra/persistence/repositories/bonus-read.repository';
import { BONUS_READ_REFRESH_QUEUE } from 'apps/bonus-service/src/app/modules/read-projection/infra/workers/bonus-read-refresh.token';
import { BonusReadRefreshWorker } from 'apps/bonus-service/src/app/modules/read-projection/infra/workers/bonus-read-refresh.worker';
import {
  HttpErrorInterceptor,
  HttpErrorInterceptorOptions,
} from 'error-handling/interceptor';
import { WinstonModule } from 'nest-winston';
import { OpenTelemetryModule } from 'nestjs-otel';
import { LoggingInterceptor } from 'observability';

@Module({
  imports: [
    TypeOrmModule.forRoot(bonusReadTypeOrmOptions),

    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: Number(process.env.REDIS_PORT || 6379),
      },
    }),

    BullModule.registerQueue({
      name: BONUS_READ_REFRESH_QUEUE,
    }),

    OpenTelemetryModule.forRoot({
      metrics: {
        apiMetrics: {
          enable: true, // Includes api metrics
          defaultAttributes: {
            // You can set default labels for api metrics
            service: 'bonus-read',
          },
          ignoreUndefinedRoutes: false, //Records metrics for all URLs, even undefined ones
          prefix: 'metrics', // Add a custom prefix to all API metrics
        },
      },
    }),

    // ClientsModule.register([
    //     {
    //         name: MQ_PRODUCER,
    //         transport: Transport.KAFKA,
    //         options: {
    //             client: bonusReadKafkaConfig.client,
    //             producer: bonusReadKafkaConfig.producer,
    //             run: bonusReadKafkaConfig.run,
    //             consumer: bonusReadKafkaConfig.consumer
    //         },
    //     },
    // ]),

    WinstonModule.forRoot({
      transports: [bonusReadWinstonConfig.transports.consoleTransport],
    }),
  ],
  controllers: [BonusReadController],
  providers: [
    BonusReadHandler,
    BonusReadProjection,
    BonusReadRepo,
    BonusReadRefreshWorker,

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
export class BonusReadModule {}
