import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { MQ_PRODUCER, MessageProducerPort } from 'adapter';
import { BonusServiceTopicMap } from 'apps/bonus-service/src/app/modules/bonus-processor/adapters/outbound/messaging/kafka.topic-map';
import { BonusEventInstanceUnion } from 'contracts';
import { ProgrammerError } from 'error-handling/error-core';
import { ProgrammerErrorRegistry } from 'error-handling/registries/common';
import { lastValueFrom } from 'rxjs';
import { defaultIfEmpty } from 'rxjs/operators';

@Injectable()
export class BonusEventRedisDispatcher
  implements
    MessageProducerPort<BonusEventInstanceUnion>,
    OnModuleInit,
    OnModuleDestroy
{
  private readonly logger = new Logger(BonusEventRedisDispatcher.name);

  constructor(@Inject(MQ_PRODUCER) private readonly client: ClientProxy) {}

  async onModuleInit() {
    await this.client.connect();
    this.logger.log('Redis client connected');
  }

  async onModuleDestroy() {
    try {
      await this.client.close();
    } catch (e) {
      this.logger.warn({
        message: `Redis client close error: ${(e as Error).message}`,
      });
    }
  }

  async dispatch(events: BonusEventInstanceUnion[]): Promise<void> {
    if (!events.length) return;

    const ops = events.map(async (evt) => {
      const topic = this.topicFor(evt);
      const obs = this.client.emit(topic, evt);
      await lastValueFrom(obs.pipe(defaultIfEmpty(undefined)));
    });

    await Promise.all(ops);
    this.logger.log({ message: `Emitted ${events.length} event(s) via Redis` });
  }

  private topicFor(evt: BonusEventInstanceUnion): string {
    const topic = BonusServiceTopicMap[evt.eventName];
    if (!topic) {
      const known = Object.keys(BonusServiceTopicMap).join(', ');
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
