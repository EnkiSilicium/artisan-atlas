import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Transport } from '@nestjs/microservices';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { orderWorkflowKafkaConfig } from 'apps/order-service/src/app/order-workflow/infra/config/kafka.config';
import { redisConfig } from 'apps/order-service/src/app/order-workflow/infra/config/redis.config';
import { OrderWorkflowModule } from 'apps/order-service/src/app/order-workflow/infra/di/order-workflow.module';
import { OrderReadModule } from 'apps/order-service/src/app/read-model/infra/di/order-read.module';
import { ApiPaths } from 'contracts';
import {
  HttpErrorInterceptor,
  KafkaErrorInterceptor,
} from 'error-handling/interceptor';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { LoggingInterceptor, printEnvs } from 'observability';
import { otelSDK } from 'observability';
import { extractBoolEnv } from 'shared-kernel';

import { Logger, type INestApplication } from '@nestjs/common';
import type { MicroserviceOptions } from '@nestjs/microservices';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { setupSwagger } from 'adapter';


export function printOrderServiceEnvs(): void {
  printEnvs("order-service", [
    { env: process.env.ORDER_WRKFLOW_HTTP_PORT, description: "ORDER_WRKFLOW_HTTP_PORT: workflow HTTP port" },
    { env: process.env.ORDER_READ_HTTP_PORT,   description: "ORDER_READ_HTTP_PORT: read HTTP port" },

    { env: process.env.JWT_PUBLIC_KEY, description: "JWT_PUBLIC_KEY: PEM for verifying JWTs" },
    { env: process.env.JWT_AUD,        description: "JWT_AUD: expected JWT audience" },
    { env: process.env.JWT_ISS,        description: "JWT_ISS: expected JWT issuer" },
    { env: process.env.DISABLE_AUTH,   description: "DISABLE_AUTH: disable auth (true/false)" },
  ]);
}


async function startOrderWorkflowApp() {
  const httpPort = Number(process.env.ORDER_WRKFLOW_HTTP_PORT ?? 3001);

  const app = await NestFactory.create(OrderWorkflowModule, {
    bufferLogs: true,
  });
  app.useLogger(app.get(WINSTON_MODULE_NEST_PROVIDER));
  app.enableShutdownHooks();
  app.setGlobalPrefix(process.env.HTTP_PREFIX ?? ApiPaths.Root);
  const useRedisMq = extractBoolEnv(process.env.USE_REDIS_MQ);
  app.useGlobalInterceptors(
    ...(useRedisMq ? [] : [app.get(KafkaErrorInterceptor)]),
    app.get(HttpErrorInterceptor),
    app.get(LoggingInterceptor),
  );

  const microserviceOptions: MicroserviceOptions = useRedisMq
    ? { transport: Transport.REDIS, options: redisConfig() }
    : {
      transport: Transport.KAFKA,
      options: {
        client: orderWorkflowKafkaConfig.client,
        consumer: orderWorkflowKafkaConfig.consumer,
        producer: orderWorkflowKafkaConfig.producer,
        run: orderWorkflowKafkaConfig.run,
      },
    };
  const microservice = app.connectMicroservice<MicroserviceOptions>(microserviceOptions);
  if (!useRedisMq) {
    microservice.useGlobalInterceptors(app.get(KafkaErrorInterceptor), app.get(LoggingInterceptor));
  } else {
    microservice.useGlobalInterceptors(app.get(LoggingInterceptor));
  }

  await app.startAllMicroservices();

  setupSwagger(app, {
    title: 'Order workflow API',
    path: 'docs',
    version: '1.0',
  });

  await app.listen(httpPort);
  const url = await app.getUrl();
  console.log(
    `[OrderWorkflowApp] HTTP listening: ${url}  |  Swagger: ${url}/docs`,
  );
}

async function startOrderReadApp() {
  const httpPort = Number(process.env.ORDER_READ_HTTP_PORT ?? 3002);

  const app = await NestFactory.create(OrderReadModule, { bufferLogs: true });
  app.useLogger(app.get(WINSTON_MODULE_NEST_PROVIDER));
  app.enableShutdownHooks();
  app.setGlobalPrefix(process.env.HTTP_PREFIX ?? ApiPaths.Root);
  app.useGlobalInterceptors(
    app.get(HttpErrorInterceptor),
    app.get(LoggingInterceptor),
  );

  setupSwagger(app, { title: 'Order Read API', path: 'docs', version: '1.0' });

  await app.listen(httpPort);
  const url = await app.getUrl();
  console.log(
    `[OrderWorkflowApp] HTTP listening: ${url}  |  Swagger: ${url}/docs`,
  );
}

async function bootstrap() {
  
  if(true) printOrderServiceEnvs()

  otelSDK.start();

  await startOrderWorkflowApp();
  //read assumes entities defined in DB
  await startOrderReadApp();

  // Graceful shutdown on signals
  const shutdown = async (signal: string) => {
    console.warn({ message: `\nReceived ${signal}. Shutting down...}` });
    process.exit(0);
  };

  process.on('uncaughtException', (error) => {
    Logger.error({
      message: `Uncaught exception: ${error?.message ?? "unknown error"}`,
      cause: { ...error }
    })
  })

  process.on('unhandledRejection', (reason, promise) => {
    Logger.error({
      message: `Uncaught promise rejection: ${reason}"}`,
      cause: { reason, promise }
    })

  });


  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

bootstrap().catch((err) => {
  console.error({ message: 'Fatal on bootstrap:', err });
  process.exit(1);
});
