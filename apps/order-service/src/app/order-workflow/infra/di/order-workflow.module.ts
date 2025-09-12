import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MQ_PRODUCER, MessageProducerPort } from 'adapter';
import { OrderComfirmCompletionController } from 'apps/order-service/src/app/order-workflow/adapters/inbound/http/order-confirm-completion.controller';
import { OrderInitController } from 'apps/order-service/src/app/order-workflow/adapters/inbound/http/order-init.controller';
import { OrderCancelController } from 'apps/order-service/src/app/order-workflow/adapters/inbound/http/order.cancel.controller';
import { StageCompletionController } from 'apps/order-service/src/app/order-workflow/adapters/inbound/http/stage-completion.controller';
import { WorkshopInvitationResponseController } from 'apps/order-service/src/app/order-workflow/adapters/inbound/http/workshop-invitation-response.controller';
import { WorkshopInvitationTrackerConsumer } from 'apps/order-service/src/app/order-workflow/adapters/inbound/messaging/workshop-invitation-tracker.consumer';
import { WorkshopMockAdapter } from 'apps/order-service/src/app/order-workflow/adapters/outbound/http-clients/workshop.adapter';
import { WorkshopInvitationTrackerAdapter } from 'apps/order-service/src/app/order-workflow/adapters/outbound/internal/workshop-invitation-tracker.adapter';
import { OrderEventDispatcher } from 'apps/order-service/src/app/order-workflow/adapters/outbound/messaging/kafka-producer';
import { OrderEventRedisDispatcher } from 'apps/order-service/src/app/order-workflow/adapters/outbound/messaging/redis-producer';
import { WorkshopInvitationTrackerPort } from 'apps/order-service/src/app/order-workflow/application/ports/initialize-tracker.port';
import { WorkshopPort } from 'apps/order-service/src/app/order-workflow/application/ports/workshop.port';
import { OrderCancelService } from 'apps/order-service/src/app/order-workflow/application/services/order/order-cancel.service';
import { OrderComfirmCompletionService } from 'apps/order-service/src/app/order-workflow/application/services/order/order-confirm-completion.service';
import { OrderInitService } from 'apps/order-service/src/app/order-workflow/application/services/order/order-init.service';
import { RequestEditService } from 'apps/order-service/src/app/order-workflow/application/services/request/request-edit.service';
import { StageCompletionService } from 'apps/order-service/src/app/order-workflow/application/services/stage/stage-completion.service';
import { WorkshopInvitationEditService } from 'apps/order-service/src/app/order-workflow/application/services/invitation/workshop-invitation-edit.service';
import { WorkshopInvitationResponseService } from 'apps/order-service/src/app/order-workflow/application/services/invitation/workshop-invitation-response.service';
import { MockAuthGuard } from 'apps/order-service/src/app/order-workflow/infra/auth/guards/mock-auth.guard';
import { OrderHttpJwtGuard } from 'apps/order-service/src/app/order-workflow/infra/auth/guards/order-http-jwt.guard';
import { OrderAuthGuardProxy } from 'apps/order-service/src/app/order-workflow/infra/auth/proxy/auth-token-proxy';
import { JwtStrategy } from 'apps/order-service/src/app/order-workflow/infra/auth/strategies/jwt.strategy';
import { orderWorkflowKafkaConfig } from 'apps/order-service/src/app/order-workflow/infra/config/kafka.config';
import { redisConfig } from 'apps/order-service/src/app/order-workflow/infra/config/redis.config';
import { OrderWorkflowTypeOrmOptions } from 'apps/order-service/src/app/order-workflow/infra/config/typeorm-config';
import { orderWorkflowWinstonConfig } from 'apps/order-service/src/app/order-workflow/infra/config/winston.config';
import { OrderRepo } from 'apps/order-service/src/app/order-workflow/infra/persistence/repositories/order/order.repo';
import { RequestRepo } from 'apps/order-service/src/app/order-workflow/infra/persistence/repositories/request/request.repo';
import { StagesAggregateRepo } from 'apps/order-service/src/app/order-workflow/infra/persistence/repositories/stage/stage.repo';
import { WorkshopInvitationRepo } from 'apps/order-service/src/app/order-workflow/infra/persistence/repositories/workshop-invitation/workshop-invitation.repo';
import { WorkshopInvitationTracker } from 'apps/order-service/src/app/order-workflow/infra/workshop-invitation-tracker/workshop-invitation-tracker.service';
import { AUTH_GUARD } from 'auth';
import {
  HttpErrorInterceptor,
  HttpErrorInterceptorOptions,
  KafkaErrorDlqInterceptor,
  KafkaErrorDlqInterceptorOptions,
} from 'error-handling/interceptor';
import { WinstonModule } from 'nest-winston';
import { OpenTelemetryModule } from 'nestjs-otel';
import { LoggingInterceptor } from 'observability';
import {
  outboxBullMqConfigFactory,
  OutboxProcessor,
  OutboxService,
  TypeOrmUoW,
} from 'persistence';
import { extractBoolEnv } from 'shared-kernel';

import { RedisModule } from './redis.module';
import { RequestCooldownGuard } from '../auth/guards/request-cooldown.guard';
import {
  InMemoryRequestControlRepository,
  RequestControlRepository,
} from '../auth/request-cooldown/request-control.repository';
import { REQUEST_COOLDOWN_CONFIG } from '../auth/request-cooldown/request-cooldown-config.token';
import { requestCooldownConfig } from '../config/request-cooldown.config';

@Module({
  imports: [
    TypeOrmModule.forRoot(OrderWorkflowTypeOrmOptions),
    BullModule.registerQueue(outboxBullMqConfigFactory()),

    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: Number(process.env.REDIS_PORT || 6379),
      },
    }),

    OpenTelemetryModule.forRoot({
      metrics: {
        apiMetrics: {
          enable: true, // Includes api metrics
          defaultAttributes: {
            // You can set default labels for api metrics
            service: 'order-workflow',
          },
          ignoreUndefinedRoutes: false, //Records metrics for all URLs, even undefined ones
          prefix: 'metrics', // Add a custom prefix to all API metrics
        },
      },
    }),
    ClientsModule.register([
      extractBoolEnv(process.env.USE_REDIS_MQ)
        ? {
          name: MQ_PRODUCER,
          transport: Transport.REDIS,
          options: redisConfig(),
        }
        : {
          name: MQ_PRODUCER,
          transport: Transport.KAFKA,
          options: {
            client: orderWorkflowKafkaConfig.client,
            producer: orderWorkflowKafkaConfig.producer,
            run: orderWorkflowKafkaConfig.run,
            consumer: orderWorkflowKafkaConfig.consumer,
          },
        },
    ]),

    ...(extractBoolEnv(process.env.DISABLE_AUTH)
      ? []
      : [PassportModule.register({ defaultStrategy: 'jwt', session: false })]),

    WinstonModule.forRoot({
      transports: [orderWorkflowWinstonConfig.transports.consoleTransport],
    }),
    RedisModule,
  ],
  controllers: [
    OrderInitController,
    WorkshopInvitationResponseController,
    StageCompletionController,
    WorkshopInvitationTrackerConsumer,
    OrderComfirmCompletionController,
    OrderCancelController,
  ],

  providers: [
    OrderInitService,
    OrderComfirmCompletionService,
    RequestEditService,
    StageCompletionService,
    WorkshopInvitationEditService,
    WorkshopInvitationResponseService,
    OrderCancelService,

    RequestControlRepository,
    InMemoryRequestControlRepository,
    RequestCooldownGuard,
    {
      provide: REQUEST_COOLDOWN_CONFIG,
      useValue: requestCooldownConfig(),
    },

    OutboxProcessor,
    OutboxService,
    TypeOrmUoW,

    KafkaErrorDlqInterceptor,
    {
      provide: KafkaErrorDlqInterceptorOptions,
      useValue: {
        maxRetries: 5,
      },
    },

    RequestRepo,
    OrderRepo,
    StagesAggregateRepo,
    WorkshopInvitationRepo,

    WorkshopInvitationTracker,
    {
      provide: WorkshopInvitationTrackerPort,
      useClass: WorkshopInvitationTrackerAdapter,
    },
    {
      provide: MessageProducerPort,
      useClass: extractBoolEnv(process.env.USE_REDIS_MQ)
        ? OrderEventRedisDispatcher
        : OrderEventDispatcher,
    },
    { provide: WorkshopPort, useClass: WorkshopMockAdapter },

    LoggingInterceptor,
    HttpErrorInterceptor,
    ...(extractBoolEnv(process.env.USE_REDIS_MQ)
      ? []
      : [KafkaErrorDlqInterceptor]),

    ...(extractBoolEnv(process.env.DISABLE_AUTH) ? [] : [JwtStrategy]),
    //JwtStrategy,

    {
      provide: AUTH_GUARD,
      useClass: extractBoolEnv(process.env.DISABLE_AUTH)
        ? MockAuthGuard
        : OrderHttpJwtGuard,
    },
    OrderAuthGuardProxy,

    {
      provide: HttpErrorInterceptorOptions,
      useValue: {
        includeTupleInBody: false,
        retryAfterSeconds: 1,
        addNoStoreHeaders: true,
      },
    },
    ...(extractBoolEnv(process.env.USE_REDIS_MQ)
      ? []
      : [
        {
          provide: KafkaErrorDlqInterceptorOptions,
          useValue: {
            maxRetries: 5,
          },
        },
      ]),
  ],
})
export class OrderWorkflowModule { }
