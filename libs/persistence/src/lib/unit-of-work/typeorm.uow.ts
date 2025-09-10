import { Injectable, Logger } from '@nestjs/common';
import { ClientKafka, ClientProxy } from '@nestjs/microservices';
import { MessageProducerPort } from 'adapter';
import { InfraError } from 'error-handling/error-core';
import { remapTypeOrmPgErrorToInfra } from 'error-handling/remapper/typeorm-postgres';
import { BaseEvent } from 'libs/contracts/src/_common/base-event.event';
import { OutboxMessage } from 'libs/persistence/src/lib/entities/outbox-message.entity';
import {
  getAmbient,
  als,
} from 'libs/persistence/src/lib/helpers/transaction.helper';
import {
  Ambient,
  Propagation,
} from 'libs/persistence/src/lib/interfaces/transaction-context.type';
import { OutboxService } from 'libs/persistence/src/lib/services/schedule-outbox-publish.service';
import { DataSource, In, QueryRunner } from 'typeorm';
import { IsolationLevel } from 'typeorm/driver/types/IsolationLevel';

/**
 * Custom UoW supporting after/before commit hooks. Manages outbox as well:
 * call `enqueueOutbox` function to schedule events for dispatch if commited.
 */
@Injectable()
export class TypeOrmUoW {
  constructor(
    private readonly ds: DataSource,
    private readonly publishJob: OutboxService,
    private readonly producer: MessageProducerPort<BaseEvent<string>>,
  ) { }

  async run<T>(
    context: Partial<
      Pick<Ambient, 'actorId' | 'correlationId' | 'nowIso'>
    > = {},
    fn: () => Promise<T>,
    opts?: { isolation?: IsolationLevel; propagation?: Propagation },
  ): Promise<T> {
    const parent: Ambient | undefined = getAmbient();
    const propagation: Propagation = opts?.propagation ?? 'REQUIRED';

    // If we already have a tx in ALS and propagation is REQUIRED, reuse it.
    if (parent?.manager && propagation === 'REQUIRED') {
      // Shallow-merge context into existing store; reuse arrays so hooks/outbox accumulate on the outer tx.
      const merged: Ambient = {
        ...parent,
        ...context,
        manager: parent.manager,
        beforeCommit: parent.beforeCommit ?? [],
        afterCommit: parent.afterCommit ?? [],
        outboxBuffer: parent.outboxBuffer ?? [],
      };
      return await als.run(merged, fn);
    }

    // Otherwise, open a new transaction (outermost or REQUIRES_NEW)
    let qr: QueryRunner;
    try {
      //connection
      qr = this.ds.createQueryRunner();
      await qr.connect();
      await qr.startTransaction(opts?.isolation ?? 'READ COMMITTED');
    } catch (error: any) {
      remapTypeOrmPgErrorToInfra(error);
    }

    const store: Ambient = {
      ...(parent ?? {}),
      ...context,
      manager: qr.manager,
      beforeCommit: [],
      afterCommit: [],
      outboxBuffer: [],
    };

    try {
      //happy path
      const result = await als.run(store, async () => {
        return await fn();
      });

      //  beforeCommit hooks
      for (const cb of store.beforeCommit!) await cb();

      // persist staged outbox messages inside the tx
      let rows: OutboxMessage<BaseEvent<string>>[] = [];
      if (store.outboxBuffer!.length) {
        rows = store.outboxBuffer!.map((message) => ({
          id: message.id,
          payload: message.payload,
          createdAt: message.createdAt,
        }));

        await qr.manager.insert(OutboxMessage, rows); // typeORM types broken
      }

      await qr.commitTransaction();

      //  afterCommit hooks (publish staged messages)
      if (store.outboxBuffer!.length) {
        const messageIds: string[] = store.outboxBuffer!.map((e) => e.id);
        this.producer
          .dispatch(rows.map((e) => e.payload))
          .then((v) => {

            // delete the events after they have been sent.
            // if crashes before that, the startup sequence will try to publish-delete
            // all unpublished
            return this.ds.manager.delete(OutboxMessage, {
              id: In(messageIds),
            });
          })
          .catch(async (error) => {
            //success of kafka publish should not be coupled to the success of transaction.
            Logger.warn({
              message: `Publish failed: ${error?.message ?? 'unknown reason'}, scheduling retry...`,
              meta: { error, producer: (this.producer as any)?.name ?? 'unspecified' },
            });

            try {
              await this.publishJob.enqueuePublish({
                events: rows.map(r => r.payload),
                outboxIds: messageIds
              })
            } catch (error) {
              Logger.error({
                message: `Backup bullMQ publisher failed: ${(error as Error)?.message ?? 'unknown reason'}. Outbox messages will be dispatched on next restart or by the in-process job`,
                meta: { error },
              });

            }

          });
      }

      for (const cb of store.afterCommit!) await cb();

      return result;
    } catch (error) {
      //unhappy path
      await qr.rollbackTransaction().catch(() => {
        Logger.warn({ message: `Transaction rollback failed!` });
      });
      remapTypeOrmPgErrorToInfra(error as Error);
    } finally {
      // todo: should consider restart mechanism for the service, or at least datasource.
      await qr.release().catch(() => {
        Logger.warn({ message: `Transaction release failed!` });
      });
    }
  }

  /**
   * Run and retry once on retriable InfraError by reopening a fresh transaction.
   * If the second attempt fails, let the caller/Kafka retry.
   */
  async runWithRetry<T>(
    context: Partial<
      Pick<Ambient, 'actorId' | 'correlationId' | 'nowIso'>
    > = {},
    fn: () => Promise<T>,
    opts?: { isolation?: IsolationLevel },
  ): Promise<T> {

    return await this.run(context, fn, opts)
      .catch(async (error) => {
        if (error instanceof InfraError && error.retryable === true) {
          Logger.warn({
            message: `Retryable infra error during UoW: ${error.name ?? 'unspecified'}. Retrying...`,
            cause: { ...error }
          })
          return await this.run(context, fn, opts);
        } else {
          throw error

        }
      })
      .catch((error) => {
        remapTypeOrmPgErrorToInfra(error as Error);
      })
  }
}
