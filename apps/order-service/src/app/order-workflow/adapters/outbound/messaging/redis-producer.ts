import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { MQ_CLIENT, MessageProducerPort } from 'adapter';
import { OrderServiceTopicMap } from 'apps/order-service/src/app/order-workflow/adapters/outbound/messaging/kafka.topic-map';
import { OrderEventInstanceUnion } from 'contracts';
import { ProgrammerError } from 'error-handling/error-core';
import { ProgrammerErrorRegistry } from 'error-handling/registries/common';
import { lastValueFrom } from 'rxjs';
import { defaultIfEmpty } from 'rxjs/operators';

@Injectable()
export class OrderEventRedisDispatcher
  implements MessageProducerPort<OrderEventInstanceUnion>, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(OrderEventRedisDispatcher.name);

  constructor(@Inject(MQ_CLIENT) private readonly client: ClientProxy) {}

  async onModuleInit() {
    await this.client.connect();
    this.logger.log('Redis client connected');
  }

  async onModuleDestroy() {
    try {
      await this.client.close();
    } catch (e) {
      this.logger.warn({ message: `Redis client close error: ${(e as Error).message}` });
    }
  }

  async dispatch(events: OrderEventInstanceUnion[]): Promise<void> {
    if (!events.length) return;

    const ops = events.map(async (evt) => {
      const topic = this.topicFor(evt);
      const obs = this.client.emit(topic, evt);
      await lastValueFrom(obs.pipe(defaultIfEmpty(undefined)));
    });

    await Promise.all(ops);
    this.logger.log({ message: `Emitted ${events.length} event(s) via Redis` });
  }

  private topicFor(evt: OrderEventInstanceUnion): string {
    const topic = OrderServiceTopicMap[evt.eventName];
    if (!topic) {
      const known = Object.keys(OrderServiceTopicMap).join(', ');
      throw new ProgrammerError({
        errorObject: ProgrammerErrorRegistry.byCode.BUG,
        details: {
          message: `No topic mapping for eventName="${evt.eventName}". Known: [${known}]`,
          event: { ...evt },
        },
      });
    }
    return String(topic);
  }
}
