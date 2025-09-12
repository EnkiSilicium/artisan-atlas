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
import { inRollbackedTestTx, requireTxManager, TypeOrmUoW } from 'persistence';
import { DataSource } from 'typeorm';

import { BonusEventRepo } from './bonus-event.repo';

import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { MessageProducerPort } from 'adapter';
import type { OutboxService } from 'persistence';

const kafkaMock = {
  dispatch: jest.fn().mockResolvedValue(undefined),
} as MessageProducerPort<any>;

jest.setTimeout(60_000);

describe('BonusEventRepo (integration)', () => {
  let container: StartedPostgreSqlContainer;
  let ds: DataSource;
  let uow: TypeOrmUoW;
  let repo: BonusEventRepo;

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
        BonusEventRepo,
        { provide: DataSource, useValue: ds },
        {
          provide: TypeOrmUoW,
          useFactory: () => new TypeOrmUoW(ds, {} as OutboxService, kafkaMock),
        },
      ],
    }).compile();

    repo = moduleRef.get(BonusEventRepo);
    uow = moduleRef.get(TypeOrmUoW);
  });

  afterAll(async () => {
    if (ds.isInitialized) await ds.destroy();
    await container.stop();
  });

  describe('insert', () => {
    it('then findByEventId and findByCommissionerId work', async () => {
      await inRollbackedTestTx(ds, async () => {
        const event = makeBonusEvent();
        const additiveEntity = makeAdditiveBonus({
          commissionerId: event.commissionerId,
        });
        const manager = requireTxManager(ds);
        await manager.insert(AdditiveBonus, additiveEntity);

        await uow.run({}, async () => {
          await repo.insert(event);
        });

        const byEvent = await repo.findByEventId(event.eventId);
        expect(byEvent).not.toBeNull();

        const byComm = await repo.findByCommissionerId(event.commissionerId);
        expect(byComm).not.toBeNull();
      });
    });
  });

  describe('constraints', () => {
    it('composite unique (event_id, commissioner_id) enforced', async () => {
      await inRollbackedTestTx(ds, async () => {
        const commissionerId = randomUUID();
        const event1 = makeBonusEvent({ commissionerId });
        const event2 = makeBonusEvent({
          eventId: event1.eventId,
          commissionerId,
        });
        const additiveEntity = makeAdditiveBonus({ commissionerId });
        const manager = requireTxManager(ds);
        await manager.insert(AdditiveBonus, additiveEntity);

        await uow.run({}, async () => {
          await repo.insert(event1);
        });

        await expect(
          uow.run({}, async () => {
            await repo.insert(event2);
          }),
        ).rejects.toThrow();
      });
    });
  });
});
