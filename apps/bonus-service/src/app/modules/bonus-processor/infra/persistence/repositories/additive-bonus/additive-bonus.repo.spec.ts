import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { AdditiveBonus } from 'apps/bonus-service/src/app/modules/bonus-processor/domain/aggregates/additive-bonus/additive-bonus.entity';
import { makeAdditiveBonus } from 'apps/bonus-service/src/app/modules/bonus-processor/domain/aggregates/additive-bonus/additive-bonus.entity.mock-factory';
import { BonusEventEntity } from 'apps/bonus-service/src/app/modules/bonus-processor/domain/aggregates/common/bonus-event.entity';
import { makeBonusEvent } from 'apps/bonus-service/src/app/modules/bonus-processor/domain/aggregates/common/bonus-event.entity.mock-factory';
import { LastMonthEventSet } from 'apps/bonus-service/src/app/modules/bonus-processor/domain/aggregates/vip-profile/last-month-event-set.entity';
import { VipProfile } from 'apps/bonus-service/src/app/modules/bonus-processor/domain/aggregates/vip-profile/vip-profile.entity';
import { TypeOrmUoW, inRollbackedTestTx, requireTxManager } from 'persistence';
import { DataSource } from 'typeorm';

import { AdditiveBonusRepo } from './additive-bonus.repo';

import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';

class KafkaMock {
  published: any[] = [];
  async publishBatch(x: any) {
    this.published.push(x);
  }
}

jest.setTimeout(60_000);

describe('AdditiveBonusRepo (integration)', () => {
  let container: StartedPostgreSqlContainer;
  let ds: DataSource;
  let uow: TypeOrmUoW;
  let repo: AdditiveBonusRepo;

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
        AdditiveBonus,
        BonusEventEntity,
        VipProfile,
        LastMonthEventSet,
      ],
      synchronize: true,
      entitySkipConstructor: true,
    });
    await ds.initialize();

    const moduleRef = await Test.createTestingModule({
      providers: [
        AdditiveBonusRepo,
        { provide: DataSource, useValue: ds },
        {
          provide: TypeOrmUoW,
          useFactory: () => new TypeOrmUoW(ds, new KafkaMock() as any, {} as any),
        },
      ],
    }).compile();

    repo = moduleRef.get(AdditiveBonusRepo);
    uow = moduleRef.get(TypeOrmUoW);
  });

  afterAll(async () => {
    if (ds.isInitialized) await ds.destroy();
    await container.stop();
  });

  describe('insert', () => {
    it('persists with v=1 and findByCommissionerId works', async () => {
      await inRollbackedTestTx(ds, async () => {
        const ab = makeAdditiveBonus({ version: 1 });

        await uow.run({}, async () => {
          await repo.insert(ab);
        });

        const found = await repo.findByCommissionerId(ab.commissionerId);
        expect(found).not.toBeNull();
        expect(found!.commissionerId).toBe(ab.commissionerId);
        expect(found!.version).toBe(1);
      });
    });
  });

  describe('findByCommissionerId', () => {
    it('loads all events', async () => {
      await inRollbackedTestTx(ds, async () => {
        const ab = makeAdditiveBonus({ version: 1 });
        const e1 = makeBonusEvent({ commissionerId: ab.commissionerId });
        const e2 = makeBonusEvent({ commissionerId: ab.commissionerId });

        await uow.run({}, async () => {
          await repo.insert(ab);
          const manager = requireTxManager(ds);
          await manager.insert(BonusEventEntity, e1);
          await manager.insert(BonusEventEntity, e2);
        });

        const found = await repo.findByCommissionerId(ab.commissionerId);
        expect(found).not.toBeNull();
        expect(found!.events).toHaveLength(2);
        const ids = found!.events.map((e) => e.eventId).sort();
        expect(ids).toEqual([e1.eventId, e2.eventId].sort());
      });
    });
  });

  describe('update', () => {
    it('bumps version', async () => {
      await inRollbackedTestTx(ds, async () => {
        const ab = makeAdditiveBonus({ totalPoints: 5, version: 1 });

        await uow.run({}, async () => {
          await repo.insert(ab);
        });

        ab.totalPoints = 10;
        await uow.run({}, async () => {
          await repo.update(ab);
        });

        const row = await repo.findByCommissionerId(ab.commissionerId);
        expect(row!.version).toBe(2);
      });
    });

    it('stale version rejects (optimistic concurrency enforced)', async () => {
      await inRollbackedTestTx(ds, async () => {
        const ab = makeAdditiveBonus({ totalPoints: 5, version: 1 });

        await uow.run({}, async () => {
          await repo.insert(ab);
        });

        const manager = requireTxManager(ds);
        await manager
          .createQueryBuilder()
          .update(AdditiveBonus)
          .set({
            totalPoints: () => `"total_points" + 1`,
            version: () => `"version" + 1`,
          })
          .where(`"commissioner_id" = :id AND "version" = :v`, {
            id: ab.commissionerId,
            v: 1,
          })
          .execute();

        ab.totalPoints = 10;
        await expect(
          uow.run({}, async () => {
            await repo.update(ab);
          }),
        ).rejects.toThrow();

        const row = await repo.findByCommissionerId(ab.commissionerId);
        expect(row!.version).toBe(2);
      });
    });
  });
});
