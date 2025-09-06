import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { KafkaProducerPort } from 'adapter';
import { Job } from 'bullmq';
import { BaseEvent } from 'libs/contracts/src/_common/base-event.event';
import { OutboxMessage } from 'libs/persistence/src/lib/entities/outbox-message.entity';
import {
  OUTBOX_JOB_PUBLISH,
  OUTBOX_QUEUE,
} from 'libs/persistence/src/lib/tokens/outbox.tokens';
import { assertIsObject } from 'shared-kernel';
import { In, DataSource } from 'typeorm';

interface PublishJobData {
  events: EventPayload[];
  outboxIds: string[];
}

export type EventPayload = OutboxMessage<BaseEvent<string>>['payload'];

@Processor(OUTBOX_QUEUE)
export class OutboxProcessor extends WorkerHost {
  constructor(
    private readonly ds: DataSource,
    // bind your concrete implementation somewhere in a module provider
    private readonly producer: KafkaProducerPort<EventPayload>,
  ) {
    super();
  }

  // This method name is fixed by WorkerHost; route by job name
  async process(job: Job<PublishJobData, void, string>): Promise<void> {
    if (job.name !== OUTBOX_JOB_PUBLISH) return;

    Logger.verbose({
      message: `Processing the ${OUTBOX_JOB_PUBLISH} job`,
      meta: { attempts: job.attemptsMade, delay: job.delay },
    });

    const inputEvents = job.data.events ?? [];
    const idsFromPayload = (job.data.outboxIds ?? []).filter(Boolean);

    let events: EventPayload[] = inputEvents;
    let idsToDelete: string[] = idsFromPayload;

    // If caller didn’t supply events but provided ids, load from DB
    if (events.length === 0 && idsToDelete.length > 0) {
      const outboxMessages = await this.ds.manager.find(OutboxMessage, {
        where: { id: In(idsToDelete) },
      });
      events = outboxMessages.map((m) => m.payload);
    }

    // If neither provided, nothing to do
    if (events.length === 0) {
      Logger.verbose({
        message: `No events provided - job cancelled`,
        meta: {
          outboxIds: idsFromPayload,
          attempts: job.attemptsMade,
          delay: job.delay,
        },
      });
      return;
    }

    // Publish to Kafka (your concrete KafkaProducerPort handles routing)
    try {
      Logger.verbose({
        message: `Attempting producer dispatch for events ${events.map((e) => e.eventName).join(` ,`)}`,
        meta: {
          outboxIds: idsFromPayload,
          attempts: job.attemptsMade,
          delay: job.delay,
        },
      });
      await this.producer.dispatch(events);
    } catch (err) {
      Logger.warn({
        message: `Prdoducer dispatch failed, restarting the job...`,
        meta: {
          outboxIds: idsFromPayload,
          attempts: job.attemptsMade,
          delay: job.delay,
        },
      });
      Logger.error(err);
      // Reset job
      throw err;
    }

    Logger.verbose({
      message: `Dispatch SUCCESS, deleting from outbox...`,
      meta: { outboxIds: idsFromPayload },
    });
    // Delete outbox rows if we know their ids
    if (idsToDelete.length === 0) {
      // try extracting ids from events if they carry "outboxId"
      idsToDelete = events
        .map((e): unknown => {
          assertIsObject(e);
          return e['outboxId'];
        })
        .filter((v: unknown): v is string => typeof v === 'string');
    }

    if (idsToDelete.length > 0) {
      await this.ds.manager.delete(OutboxMessage, { id: In(idsToDelete) });
    }
    Logger.verbose({
      message: `${OUTBOX_JOB_PUBLISH} job done!`,
      meta: {
        outboxIds: idsFromPayload,
        attempts: job.attemptsMade,
        delay: job.delay,
      },
    });
  }
}
