// libs/persistence/src/lib/unit-of-work/typeorm.uow.baseevent.spec.ts
import 'reflect-metadata';
import { randomUUID } from 'crypto';

import { PostgreSqlContainer } from '@testcontainers/postgresql';

// UoW + helpers under test (your real code)
import { InfraError } from 'error-handling/error-core';
import { InfraErrorRegistry } from 'error-handling/registries/common';
import {
  getAmbient,
  currentManager,
  requireTxManager,
  enqueueOutbox,
} from 'libs/persistence/src/lib/helpers/transaction.helper';
import { TypeOrmUoW, inRollbackedTestTx } from 'persistence';
import { OutboxMessage } from 'persistence';
import { isoNow } from 'shared-kernel';
import { DataSource } from 'typeorm';

import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { BaseEvent } from 'contracts';
import type { OutboxService } from 'persistence';

type MessageProducerPort<T> = { enqueuePublish(messages: T[]): Promise<void> };

// Now the producer publishes BaseEvent payloads, not OutboxMessage rows
const publishMock: OutboxService = <OutboxService>(<unknown>{
  enqueuePublish: jest.fn().mockResolvedValue(undefined),
});

jest.setTimeout(60_000);

describe('TypeOrmUoW (integration) — enqueuePublishes BaseEvent payloads', () => {
  let container: StartedPostgreSqlContainer;
  let ds: DataSource;
  let uow: TypeOrmUoW;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine')
      .withDatabase('testdb')
      .withUsername('testuser')
      .withPassword('testpw')
      .start();

    ds = new DataSource({
      type: 'postgres',
      host: container.getHost(),
      port: container.getPort(),
      username: container.getUsername(),
      password: container.getPassword(),
      database: container.getDatabase(),
      entities: [OutboxMessage],
      entitySkipConstructor: true,
      synchronize: true,
    });
    await ds.initialize();

    // TypeOrmUoW should be constructed with a Kafka port of BaseEvent<string>
    uow = new TypeOrmUoW(ds, publishMock, {} as any);
  });

  afterAll(async () => {
    if (ds?.isInitialized) await ds.destroy();
    await container.stop();
  });

  beforeEach(() => {
    (publishMock.enqueuePublish as jest.Mock).mockClear();
  });

  it('writing outside UoW throws for requireTxManager and enqueueOutbox', async () => {
    expect(() => requireTxManager(ds)).toThrow();

    const msg: OutboxMessage<BaseEvent<string>> = {
      id: randomUUID(),
      payload: { eventName: 'test' as const, schemaV: 1 },
      createdAt: isoNow(),
    } as any;

    expect(() => enqueueOutbox(msg)).toThrow();
  });

  it('commit path: persists outbox within tx, publishes BaseEvent after commit, then deletes', async () => {
    const id = randomUUID();
    const payload: BaseEvent<'orderUpdated'> = {
      eventName: 'orderUpdated',
      schemaV: 1,
    };

    let seenInsideTx = 0;

    await uow.run({}, async () => {
      // stage one message in the outbox
      const msg: OutboxMessage<BaseEvent<string>> = {
        id,
        payload,
        createdAt: isoNow(),
      };
      enqueueOutbox(msg);

      // Not persisted yet before the UoW does its insert.
      const em = currentManager(ds);
      const before = await em.find(OutboxMessage);
      expect(before.length).toBe(0);

      // verify in beforeCommit it’s actually in the DB
      const s = getAmbient()!;
      s.beforeCommit!.push(async () => {
        const rows = await currentManager(ds).find(OutboxMessage);
        seenInsideTx = rows.length;
        expect(rows.map((r) => r.id)).toContain(id);
      });
    });

    // published exactly once with our BaseEvent payload
    expect(publishMock.enqueuePublish).toHaveBeenCalledTimes(1);
    const enqueuePublished: BaseEvent<string>[] = (
      publishMock.enqueuePublish as jest.Mock
    ).mock.calls[0][0];
    expect(enqueuePublished).toEqual([
      { eventName: 'orderUpdated', schemaV: 1 },
    ]);

    // we saw exactly one persisted row before commit
    expect(seenInsideTx).toBe(1);

    // table cleanup happened after publish
    const rows = await ds.manager.find(OutboxMessage);
    expect(rows.length).toBe(0);
  });

  it('rollback path: no rows remain, nothing published', async () => {
    const payload: BaseEvent<'rollbackMe'> = {
      eventName: 'rollbackMe',
      schemaV: 1,
    };
    const id = randomUUID();

    await inRollbackedTestTx(ds, async () => {
      await uow.run({}, async () => {
        enqueueOutbox({
          id,
          payload,
          createdAt: isoNow(),
        });
      });
      // outer wrapper rolls back
    });

    expect(publishMock.enqueuePublish).not.toHaveBeenCalled();
    const rows = await ds.manager.find(OutboxMessage);
    expect(rows.length).toBe(0);
  });

  it('nested REQUIRED propagation: inner run reuses outer tx; single commit & publish (two BaseEvents)', async () => {
    const id1 = randomUUID();
    const id2 = randomUUID();

    const evA: BaseEvent<'batchA'> = { eventName: 'batchA', schemaV: 1 };
    const evB: BaseEvent<'batchB'> = { eventName: 'batchB', schemaV: 1 };

    await uow.run({}, async () => {
      enqueueOutbox({ id: id1, payload: evA, createdAt: isoNow() });

      await uow.run({}, async () => {
        enqueueOutbox({ id: id2, payload: evB, createdAt: isoNow() });
      });
    });

    expect(publishMock.enqueuePublish).toHaveBeenCalledTimes(1);
    const batch: BaseEvent<string>[] = (publishMock.enqueuePublish as jest.Mock)
      .mock.calls[0][0];

    // order isn’t guaranteed; assert by set of eventNames and schemaV presence
    const names = new Set(batch.map((b) => b.eventName));
    expect(names).toEqual(new Set(['batchA', 'batchB']));
    batch.forEach((b) => expect(b.schemaV).toBe(1));

    const rows = await ds.manager.find(OutboxMessage);
    expect(rows.length).toBe(0);
  });

  it('runWithRetry retries exactly once on InfraError:TX_CONFLICT and then publishes BaseEvent', async () => {
    const id = randomUUID();
    const ev: BaseEvent<'afterRetry'> = { eventName: 'afterRetry', schemaV: 1 };

    let attempts = 0;

    await uow.runWithRetry({}, async () => {
      attempts++;
      if (attempts === 1) {
        throw new InfraError({
          errorObject: InfraErrorRegistry.byCode.TX_CONFLICT,
        });
      }
      enqueueOutbox({ id, payload: ev, createdAt: isoNow() });
    });

    expect(attempts).toBe(2);
    expect(publishMock.enqueuePublish).toHaveBeenCalledTimes(1);
    const sent: BaseEvent<string>[] = (publishMock.enqueuePublish as jest.Mock)
      .mock.calls[0][0];
    expect(sent).toEqual([{ eventName: 'afterRetry', schemaV: 1 }]);

    const rows = await ds.manager.find(OutboxMessage);
    expect(rows.length).toBe(0);
  });
});
