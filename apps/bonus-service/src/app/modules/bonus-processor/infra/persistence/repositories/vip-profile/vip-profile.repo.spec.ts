import 'reflect-metadata';
import { randomUUID } from 'crypto';

import { Test } from '@nestjs/testing';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { AdditiveBonus } from 'apps/bonus-service/src/app/modules/bonus-processor/domain/aggregates/additive-bonus/additive-bonus.entity';
import { makeAdditiveBonus } from 'apps/bonus-service/src/app/modules/bonus-processor/domain/aggregates/additive-bonus/additive-bonus.entity.mock-factory';
import { BonusEventEntity } from 'apps/bonus-service/src/app/modules/bonus-processor/domain/aggregates/common/bonus-event.entity';
import { makeBonusEvent } from 'apps/bonus-service/src/app/modules/bonus-processor/domain/aggregates/common/bonus-event.entity.mock-factory';
import { LastMonthEventSet } from 'apps/bonus-service/src/app/modules/bonus-processor/domain/aggregates/vip-profile/last-month-event-set.entity';
import { VipProfile } from 'apps/bonus-service/src/app/modules/bonus-processor/domain/aggregates/vip-profile/vip-profile.entity';
import {
  makeVipProfile,
  makeLMEvent,
} from 'apps/bonus-service/src/app/modules/bonus-processor/domain/aggregates/vip-profile/vip-profile.entity.mock-factory';
import { inRollbackedTestTx, requireTxManager, TypeOrmUoW } from 'persistence';
import { isoNow } from 'shared-kernel';
import { DataSource } from 'typeorm';

import { VipProfileRepo } from './vip-profile.repo';

import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { MessageProducerPort } from 'adapter';
import type { OutboxService } from 'persistence';

const kafkaMock = {
  dispatch: jest.fn().mockResolvedValue(undefined),
} as MessageProducerPort<any>;

jest.setTimeout(60_000);

/**
 * Pairs LMES with corresponding BonusEventEntity records and persists required parents:
 *   - AdditiveBonus(commissionerId)
 *   - BonusEventEntity(eventId, commissionerId)
 * so repo.update can insert LMES without FK violations.
 */
async function seedBonusParentsAndEvents(
  ds: DataSource,
  uow: TypeOrmUoW,
  commissionerId: string,
  lmes: LastMonthEventSet[],
): Promise<
  Array<{
    bonusEventEntity: BonusEventEntity;
    lastMonthEvent: LastMonthEventSet;
  }>
> {
  const pairs = lmes.map((ev) => {
    const be = makeBonusEvent({
      eventId: ev.eventId,
      commissionerId,
      eventName: ev.eventName,
      injestedAt: isoNow(),
      version: 1,
    });
    return { bonusEventEntity: be, lastMonthEvent: ev };
  });

  await uow.run({}, async () => {
    await ds
      .createQueryBuilder()
      .insert()
      .into(AdditiveBonus)
      .values(makeAdditiveBonus({ commissionerId, version: 1 }))
      .orIgnore()
      .execute();

    for (const { bonusEventEntity } of pairs) {
      await ds
        .createQueryBuilder()
        .insert()
        .into(BonusEventEntity)
        .values(bonusEventEntity)
        .orIgnore()
        .execute();
    }
  });

  return pairs;
}

describe('VipProfileRepo (integration) — save semantics with rollback isolation', () => {
  let container: StartedPostgreSqlContainer;
  let ds: DataSource;
  let uow: TypeOrmUoW;
  let repo: VipProfileRepo;

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
      entities: [
        VipProfile,
        LastMonthEventSet,
        AdditiveBonus,
        BonusEventEntity,
      ],
      synchronize: true,
      entitySkipConstructor: true,
    });
    await ds.initialize();

    const moduleRef = await Test.createTestingModule({
      providers: [
        VipProfileRepo,
        { provide: DataSource, useValue: ds },
        {
          provide: TypeOrmUoW,
          useFactory: () => new TypeOrmUoW(ds, {} as OutboxService, kafkaMock),
        },
      ],
    }).compile();

    repo = moduleRef.get(VipProfileRepo);
    uow = moduleRef.get(TypeOrmUoW);
  });

  afterAll(async () => {
    if (ds.isInitialized) await ds.destroy();
    await container.stop();
  });

  describe('findByCommissionerId', () => {
    it('loads all the LastMonthEvents', async () => {
      await inRollbackedTestTx(ds, async () => {
        const commissionerId = randomUUID();

        const event1 = makeLMEvent({ commissionerId });
        const event2 = makeLMEvent({ commissionerId, bucket: 1 });
        const vp = makeVipProfile({
          commissionerId,
          lastMonthEvents: [event1, event2],
        });

        await uow.run({}, async () => {
          await repo.insert(vp);
        });

        await seedBonusParentsAndEvents(ds, uow, commissionerId, [
          event1,
          event2,
        ]);

        await uow.run({}, async () => {
          await repo.update(vp);
        });

        const found = await repo.findByCommissionerId(commissionerId);
        expect(found).not.toBeNull();
        expect(found!.lastMonthEvents).toHaveLength(2);
        const ids = found!.lastMonthEvents.map((e) => e.eventId).sort();
        expect(ids).toEqual([event1.eventId, event2.eventId].sort());
      });
    });
  });
  describe('update', () => {
    it('inserts missing events', async () => {
      await inRollbackedTestTx(ds, async () => {
        const commissionerId = randomUUID();

        const event1 = makeLMEvent({ commissionerId });
        const event2 = makeLMEvent({ commissionerId, bucket: 1 });
        const vp = makeVipProfile({
          commissionerId,
          lastMonthEvents: [event1, event2],
        });

        await uow.run({}, async () => {
          await repo.insert(vp);
        });

        await seedBonusParentsAndEvents(ds, uow, commissionerId, [
          event1,
          event2,
        ]);

        await uow.run({}, async () => {
          await repo.update(vp);
        });

        const manager = requireTxManager(ds);
        const rows = await manager.find(LastMonthEventSet, {
          where: { commissionerId },
        });

        expect(rows.map((r) => r.eventId).sort()).toEqual(
          [event1.eventId, event2.eventId].sort(),
        );
        expect(rows.every((r) => r.version === 1)).toBe(true);
      });
    });

    it('removes rows not present in aggregate', async () => {
      await inRollbackedTestTx(ds, async () => {
        const commissionerId = randomUUID();
        const event1 = makeLMEvent({ commissionerId, bucket: 0 });
        const event2 = makeLMEvent({ commissionerId, bucket: 1 });
        const vp = makeVipProfile({
          commissionerId,
          lastMonthEvents: [event1, event2],
        });

        await uow.run({}, async () => {
          await repo.insert(vp);
        });
        await seedBonusParentsAndEvents(ds, uow, commissionerId, [
          event1,
          event2,
        ]);

        await uow.run({}, async () => {
          await repo.update(vp);
        });

        vp.lastMonthEvents = [event2];

        await uow.run({}, async () => {
          await repo.update(vp);
        });

        const manager = requireTxManager(ds);
        const rows = await manager.find(LastMonthEventSet, {
          where: { commissionerId },
        });
        expect(rows).toHaveLength(1);
        expect(rows[0].eventId).toBe(event2.eventId);
      });
    });

    it('is idempotent for same set', async () => {
      await inRollbackedTestTx(ds, async () => {
        const commissionerId = randomUUID();
        const event1 = makeLMEvent({ commissionerId, bucket: 2 });
        const event2 = makeLMEvent({ commissionerId, bucket: 3 });
        const vp = makeVipProfile({
          commissionerId,
          lastMonthEvents: [event1, event2],
        });

        await uow.run({}, async () => {
          await repo.insert(vp);
        });
        await seedBonusParentsAndEvents(ds, uow, commissionerId, [
          event1,
          event2,
        ]);

        await uow.run({}, async () => {
          await repo.update(vp);
          await repo.update(vp);
        });

        const manager = requireTxManager(ds);
        const rows = await manager.find(LastMonthEventSet, {
          where: { commissionerId },
        });
        expect(rows.map((r) => r.eventId).sort()).toEqual(
          [event1.eventId, event2.eventId].sort(),
        );
      });
    });

    it('empty events => delete all', async () => {
      await inRollbackedTestTx(ds, async () => {
        const commissionerId = randomUUID();
        const event1 = makeLMEvent({ commissionerId });
        const event2 = makeLMEvent({ commissionerId });
        const vp = makeVipProfile({
          commissionerId,
          lastMonthEvents: [event1, event2],
        });

        await uow.run({}, async () => {
          await repo.insert(vp);
        });
        await seedBonusParentsAndEvents(ds, uow, commissionerId, [
          event1,
          event2,
        ]);

        await uow.run({}, async () => {
          await repo.update(vp);
        });

        vp.lastMonthEvents = [];

        await uow.run({}, async () => {
          await repo.update(vp);
        });

        const manager = requireTxManager(ds);
        const rows = await manager.find(LastMonthEventSet, {
          where: { commissionerId },
        });
        expect(rows).toHaveLength(0);
      });
    });
  });
});
