import { randomUUID } from 'crypto';

import { Test } from '@nestjs/testing';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { Order } from 'apps/order-service/src/app/order-workflow/domain/entities/order/order.entity';
import { makeOrder } from 'apps/order-service/src/app/order-workflow/domain/entities/order/order.entity.mock-factory';
import { RequestEntity } from 'apps/order-service/src/app/order-workflow/domain/entities/request/request.entity';
import { Stage } from 'apps/order-service/src/app/order-workflow/domain/entities/stage/stage.entity';
import { WorkshopInvitation } from 'apps/order-service/src/app/order-workflow/domain/entities/workshop-invitation/workshop-invitation.entity';
import { OrderRepo } from 'apps/order-service/src/app/order-workflow/infra/persistence/repositories/order/order.repo';
import { InfraError, ProgrammerError } from 'error-handling/error-core';
import { TypeOrmUoW, inRollbackedTestTx } from 'persistence';
import { DataSource } from 'typeorm';

import type { TestingModule } from '@nestjs/testing';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { MessageProducerPort } from 'adapter';

describe('OrderRepo (integration)', () => {
  let moduleRef: TestingModule;
  let ds: DataSource;
  let repo: OrderRepo;
  let uow: TypeOrmUoW;
  let container: StartedPostgreSqlContainer;

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
      entities: [Order, RequestEntity, Stage, WorkshopInvitation],
      synchronize: true,
    });
    await ds.initialize();

    const kafkaMock = {
      dispatch: jest.fn().mockResolvedValue(undefined),
    } as MessageProducerPort<any>;

    moduleRef = await Test.createTestingModule({
      providers: [
        OrderRepo,
        { provide: DataSource, useValue: ds },
        { provide: 'KAFKA_PUBLISHER', useValue: kafkaMock },
        {
          provide: TypeOrmUoW,
          useFactory: (dataSource: DataSource, kafka: any) =>
            new TypeOrmUoW(dataSource, kafka),
          inject: [DataSource, 'KAFKA_PUBLISHER'],
        },
      ],
    }).compile();

    repo = moduleRef.get(OrderRepo);
    uow = moduleRef.get(TypeOrmUoW);
  });

  afterAll(async () => {
    await ds.destroy();
    await container.stop();
  });

  describe('insert', () => {
    it('sets version=1 and timestamps (DB + memory) inside UoW', async () => {
      await inRollbackedTestTx(ds, async () => {
        const order = makeOrder({ commissionerId: randomUUID(), version: 1 });
        await uow.run({}, async () => {
          await repo.insert(order);
        });
        const found = await repo.findById(order.orderId);
        expect(found).not.toBeNull();
        expect(found!.version).toBe(1);
        expect(order.version).toBe(1);
        expect(found!.createdAt).toBeTruthy();
        expect(found!.lastUpdatedAt).toBeTruthy();
      });
    });
  });

  describe('update', () => {
    it('bumps version and persists fields', async () => {
      await inRollbackedTestTx(ds, async () => {
        const order = makeOrder({ commissionerId: randomUUID(), version: 1 });
        await uow.run({}, async () => {
          await repo.insert(order);
        });
        const v1 = order.version;

        order.commissionerId = randomUUID();
        await uow.run({}, async () => {
          await repo.update(order);
        });

        const found = await repo.findById(order.orderId);
        expect(found!.commissionerId).toBe(order.commissionerId);
        expect(found!.version).toBe(v1 + 1);
        expect(order.version).toBe(v1 + 1);
      });
    });

    it('optimistic lock: stale update fails with InfraError:TX_CONFLICT', async () => {
      await inRollbackedTestTx(ds, async () => {
        const order = makeOrder({ commissionerId: randomUUID(), version: 1 });
        await uow.run({}, async () => {
          await repo.insert(order);
        });

        // first legit update
        order.commissionerId = randomUUID();
        await uow.run({}, async () => {
          await repo.update(order);
        });
        const current = order.version;

        // stale copy with old version
        const stale = makeOrder({
          orderId: order.orderId,
          commissionerId: randomUUID(),
          state: order.state,
          isTerminated: order.isTerminated,
          createdAt: order.createdAt,
          lastUpdatedAt: order.lastUpdatedAt,
          version: current - 1,
        });

        await expect(
          uow.run({}, async () => {
            await repo.update(stale);
          }),
        ).rejects.toThrow(InfraError);

        const found = await repo.findById(order.orderId);
        expect(found!.version).toBe(current);
        expect(found!.commissionerId).toBe(order.commissionerId);
      });
    });
  });

  describe('guards', () => {
    it('writing outside UoW throws (requireTxManager guard)', async () => {
      const order = makeOrder({ commissionerId: randomUUID(), version: 1 });
      await expect(repo.insert(order)).rejects.toThrow(ProgrammerError);
    });
  });
});
