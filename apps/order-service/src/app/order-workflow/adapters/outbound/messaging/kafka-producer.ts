// bonus-event-dispatcher.clientkafka.ts
import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';
import { KAFKA_PRODUCER } from 'adapter'; // token bound to ClientKafka
import { KafkaProducerPort } from 'adapter';
import { OrderServiceTopicMap } from 'apps/order-service/src/app/order-workflow/adapters/outbound/messaging/kafka.topic-map';
import { OrderEventInstanceUnion } from 'contracts';
import { assertTopicMappingDefined } from 'adapter';
import { lastValueFrom } from 'rxjs';
import { defaultIfEmpty } from 'rxjs/operators';
import { assertIsObject } from 'shared-kernel';

@Injectable()
export class OrderEventDispatcher
  implements
    KafkaProducerPort<OrderEventInstanceUnion>,
    OnModuleInit,
    OnModuleDestroy
{
  private readonly logger = new Logger(OrderEventDispatcher.name);

  constructor(@Inject(KAFKA_PRODUCER) private readonly client: ClientKafka) {}

  async onModuleInit() {
    // ClientKafka needs an explicit connect in app code (Nest won't auto-connect producers)
    await this.client.connect();
    this.logger.log('ClientKafka connected');
  }

  async onModuleDestroy() {
    try {
      await this.client.close();
    } catch (e) {
      this.logger.warn({
        message: `ClientKafka close error: ${(e as Error).message}`,
      });
    }
  }

  async dispatch(events: OrderEventInstanceUnion[]): Promise<void> {
    if (!events.length) return;

    // Emit each event. ClientKafka expects: emit(topic: string, data: { key, value, headers? })
    // It returns an Observable we must subscribe to (convert to Promise).
    const ops = events.map(async (evt) => {
      const topic = this.topicFor(evt); // validated string topic
      const key = this.keyFor(evt); // stable key => ordered per key

      const record = {
        key, // string | Buffer
        value: evt, // your BaseEvent payload (plus any extra fields)
        headers: { 'x-event-name': evt.eventName }, // strings are fine; Buffers also OK
        // partition: 0,                               // optional: force a partition (not recommended in prod)
        // timestamp: Date.now().toString(),           // optional
      };

      const obs = this.client.emit(topic, record);
      await lastValueFrom(obs.pipe(defaultIfEmpty(undefined)));
    });

    await Promise.all(ops);
    this.logger.log({
      message: `Emitted ${events.length} event(s) via ClientKafka`,
    });
  }

  private topicFor(evt: OrderEventInstanceUnion): string {
    // Make bad mappings fail fast and loudly
    const topic = OrderServiceTopicMap[evt.eventName];
    assertTopicMappingDefined({
      topic,
      eventName: evt.eventName,
      known: Object.keys(OrderServiceTopicMap),
    });
    return String(topic); // ensure string pattern
  }

  private keyFor(evt: unknown): string | undefined {
    // Tolerate old casings so partitioning doesn't silently degrade

    assertIsObject(evt);
    return (
      (evt['orderId'] as string | undefined) ??
      (evt['orderID'] as string | undefined) ??
      (evt['commissionerId'] as string | undefined) ??
      (evt['commissionerID'] as string | undefined) ??
      (evt['workshopId'] as string | undefined) ??
      (evt['workshopID'] as string | undefined) ??
      (evt['eventId'] as string | undefined) ??
      (evt['eventID'] as string | undefined) ??
      undefined
    );
  }
}
