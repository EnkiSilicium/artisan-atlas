import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { INestApplication } from '@nestjs/common';
import { Transport, MicroserviceOptions } from '@nestjs/microservices';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { OrderWorkflowModule } from 'apps/order-service/src/app/order-workflow/infra/di/order-workflow.module';
import { orderWorkflowKafkaConfig } from 'apps/order-service/src/app/order-workflow/infra/config/kafka.config';
import { OrderReadModule } from 'apps/order-service/src/app/read-model/infra/di/order-read.module';
import { HttpErrorInterceptor, KafkaErrorInterceptor } from 'error-handling/interceptor';
import { LoggingInterceptor } from 'observability';
import { ApiPaths } from 'contracts';



function setupSwagger(app: INestApplication, {
  title,
  version = '1.0.0',
  path = '../docs',
}: { title: string; version?: string; path?: string; }) {
  const config = new DocumentBuilder()
    .setTitle(title)
    .setVersion(version)
    .build();
  const doc = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup(path, app, doc, { customSiteTitle: title });
}


async function startOrderWorkflowApp() {
  const httpPort = Number(process.env.ORDER_WRKFLOW_HTTP_PORT ?? 3001);

  const app = await NestFactory.create(OrderWorkflowModule, { bufferLogs: true });
  app.useLogger(app.get(WINSTON_MODULE_NEST_PROVIDER));
  app.enableShutdownHooks();
  app.setGlobalPrefix(process.env.HTTP_PREFIX ?? ApiPaths.Root);
  app.useGlobalInterceptors(
    app.get(KafkaErrorInterceptor),
    app.get(HttpErrorInterceptor),
    app.get(LoggingInterceptor),
  );



  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.KAFKA,
    options: {
      client: orderWorkflowKafkaConfig.client,
      consumer: orderWorkflowKafkaConfig.consumer,
      producer: orderWorkflowKafkaConfig.producer,
      run: orderWorkflowKafkaConfig.run,
    },
  });

  await app.startAllMicroservices();

  setupSwagger(app, { title: 'Order workflow API', path: 'docs', version: '1.0' });


  await app.listen(httpPort);
  const url = await app.getUrl();
  console.log(`[OrderWorkflowApp] HTTP listening: ${url}  |  Swagger: ${url}/docs`);
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
  console.log(`[OrderWorkflowApp] HTTP listening: ${url}  |  Swagger: ${url}/docs`);

}


async function bootstrap() {
  //await otelSDK.start();



  await startOrderWorkflowApp()
  //read assumes entities defined in DB
  await startOrderReadApp()

  // Graceful shutdown on signals
  const shutdown = async (signal: string) => {

    console.log(`\nReceived ${signal}. Shutting down...`)
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal on bootstrap:', err);
  process.exit(1);
});
