import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Transport } from '@nestjs/microservices';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { bonusProcessorKafkaConfig } from 'apps/bonus-service/src/app/modules/bonus-processor/infra/config/kafka.config';
import { redisConfig } from 'apps/order-service/src/infra/config/redis.config';
import { BonusProcessorModule } from 'apps/bonus-service/src/app/modules/bonus-processor/infra/di/bonus-processor.module';
import { BonusReadModule } from 'apps/bonus-service/src/app/modules/read-projection/infra/di/bonus-read.module';
import { ApiPaths } from 'contracts';
import {
  HttpErrorInterceptor,
  KafkaErrorInterceptor,
} from 'error-handling/interceptor';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { LoggingInterceptor } from 'observability';
import { otelSDK } from 'observability';
import { extractBoolEnv } from 'shared-kernel';

import type { INestApplication } from '@nestjs/common';
import type { MicroserviceOptions } from '@nestjs/microservices';

function setupSwagger(
  app: INestApplication,
  {
    title,
    version = '1.0.0',
    path = '../docs',
  }: { title: string; version?: string; path?: string },
) {
  const config = new DocumentBuilder()
    .setTitle(title)
    .setVersion(version)
    .build();
  const doc = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup(path, app, doc, { customSiteTitle: title });
}

async function startBonusProcessorApp() {
  const httpPort = Number(process.env.BONUS_PROC_HTTP_PORT ?? 3001);

  const app = await NestFactory.create(BonusProcessorModule, {
    bufferLogs: true,
  });
  //app.useLogger(app.get(WINSTON_MODULE_NEST_PROVIDER));
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
          client: bonusProcessorKafkaConfig.client,
          consumer: bonusProcessorKafkaConfig.consumer,
          producer: bonusProcessorKafkaConfig.producer,
          run: bonusProcessorKafkaConfig.run,
        },
      };
  const microservice = app.connectMicroservice<MicroserviceOptions>(microserviceOptions);
  microservice.useGlobalInterceptors(
    ...(useRedisMq ? [] : [app.get(KafkaErrorInterceptor)]),
    app.get(LoggingInterceptor),
  );

  await app.startAllMicroservices();

  setupSwagger(app, {
    title: 'Bonus Processor API',
    path: 'docs',
    version: '1.0',
  });

  await app.listen(httpPort);
  const url = await app.getUrl();
  console.log(
    `[BonusReadModule] HTTP listening: ${url}  |  Swagger: ${url}/docs`,
  );
}

async function startBonusReadApp() {
  const httpPort = Number(process.env.BONUS_READ_HTTP_PORT ?? 3002);

  const app = await NestFactory.create(BonusReadModule, { bufferLogs: true });
  app.useLogger(app.get(WINSTON_MODULE_NEST_PROVIDER));
  app.enableShutdownHooks();
  app.setGlobalPrefix(process.env.HTTP_PREFIX ?? ApiPaths.Root);
  app.useGlobalInterceptors(
    app.get(HttpErrorInterceptor),
    app.get(LoggingInterceptor),
  );

  setupSwagger(app, { title: 'Bonus Read API', path: 'docs', version: '1.0' });

  await app.listen(httpPort);
  const url = await app.getUrl();

  console.log(
    `[BonusReadModule] HTTP listening: ${url}  |  Swagger: ${url}/docs`,
  );
}

async function bootstrap() {
  await otelSDK.start();

  await startBonusProcessorApp();
  //read depends on processor
  await startBonusReadApp();

  // Graceful shutdown on signals
  const shutdown = async (signal: string) => {
    console.warn({message: `\nReceived ${signal}. Shutting down...}`});
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

bootstrap().catch((err) => {
  console.error({ message: 'Fatal on bootstrap:', err });
  process.exit(1);
});
