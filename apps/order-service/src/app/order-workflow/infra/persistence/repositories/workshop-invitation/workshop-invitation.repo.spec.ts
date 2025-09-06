import { randomUUID } from 'crypto';

import { Test } from '@nestjs/testing';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { Order } from 'apps/order-service/src/app/order-workflow/domain/entities/order/order.entity';
import { makeOrder } from 'apps/order-service/src/app/order-workflow/domain/entities/order/order.entity.mock-factory';
import { RequestEntity } from 'apps/order-service/src/app/order-workflow/domain/entities/request/request.entity';
import { Stage } from 'apps/order-service/src/app/order-workflow/domain/entities/stage/stage.entity';
import { WorkshopInvitation } from 'apps/order-service/src/app/order-workflow/domain/entities/workshop-invitation/workshop-invitation.entity';
import { makeWorkshopInvitation } from 'apps/order-service/src/app/order-workflow/domain/entities/workshop-invitation/workshop-invitation.entity.mock-factory';
import { WorkshopInvitationStatus } from 'apps/order-service/src/app/order-workflow/domain/entities/workshop-invitation/workshop-invitation.enum';
import { OrderRepo } from 'apps/order-service/src/app/order-workflow/infra/persistence/repositories/order/order.repo';
import { makeRequest } from 'apps/order-service/src/app/order-workflow/infra/persistence/repositories/request/request.mock-factory';
import { RequestRepo } from 'apps/order-service/src/app/order-workflow/infra/persistence/repositories/request/request.repo';
import { WorkshopInvitationRepo } from 'apps/order-service/src/app/order-workflow/infra/persistence/repositories/workshop-invitation/workshop-invitation.repo';
import { InfraError } from 'error-handling/error-core';
import { TypeOrmUoW, inRollbackedTestTx } from 'persistence';
import { DataSource } from 'typeorm';

import type { TestingModule } from '@nestjs/testing';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { OutboxService } from 'persistence';

describe('WorkshopInvitationRepo (integration)', () => {
  let moduleRef: TestingModule;
  let ds: DataSource;
  let orderRepo: OrderRepo;
  let requestRepo: RequestRepo;
  let repo: WorkshopInvitationRepo;
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

    const outboxMock = {
      enqueuePublish: jest.fn().mockResolvedValue(undefined),
    } as unknown as OutboxService;

    moduleRef = await Test.createTestingModule({
      providers: [
        OrderRepo,
        RequestRepo,
        WorkshopInvitationRepo,
        { provide: DataSource, useValue: ds },
        { provide: OutboxService, useValue: outboxMock },
        {
          provide: TypeOrmUoW,
          useFactory: (dataSource: DataSource, outbox: OutboxService) =>
            new TypeOrmUoW(dataSource, outbox),
          inject: [DataSource, OutboxService],
        },
      ],
    }).compile();

    orderRepo = moduleRef.get(OrderRepo);
    requestRepo = moduleRef.get(RequestRepo);
    repo = moduleRef.get(WorkshopInvitationRepo);
    uow = moduleRef.get(TypeOrmUoW);
  });

  afterAll(async () => {
    await ds.destroy();
    await container.stop();
  });
  describe('insertMany', () => {
    it('persists v=1 and returns all', async () => {
      await inRollbackedTestTx(ds, async () => {
        const order = makeOrder({ commissionerId: randomUUID(), version: 1 });
        const req = makeRequest({ orderId: order.orderId, version: 1 });
        const i1 = makeWorkshopInvitation({
          orderId: order.orderId,
          workshopId: randomUUID(),
          version: 1,
        });
        const i2 = makeWorkshopInvitation({
          orderId: order.orderId,
          workshopId: randomUUID(),
          version: 1,
        });

        await uow.run({}, async () => {
          await orderRepo.insert(order);
          await requestRepo.insert(req);
          await repo.insertMany([i1, i2]);
        });

        expect(i1.version).toBe(1);
        expect(i2.version).toBe(1);

        const all = await repo.findAllByOrderId(order.orderId);
        expect(all).not.toBeNull();
        expect(all!.length).toBe(2);
        for (const inv of all!) {
          expect(inv.version).toBe(1);
          expect(inv.status).toBe(WorkshopInvitationStatus.Pending);
        }
      });
    });
  });

  describe('update', () => {
    it('accept: transitions to Accepted, saves payload, bumps version', async () => {
      await inRollbackedTestTx(ds, async () => {
        const order = makeOrder({ commissionerId: randomUUID(), version: 1 });
        const req = makeRequest({ orderId: order.orderId, version: 1 });
        const inv = makeWorkshopInvitation({
          orderId: order.orderId,
          workshopId: randomUUID(),
          version: 1,
        });

        await uow.run({}, async () => {
          await orderRepo.insert(order);
          await requestRepo.insert(req);
          await repo.insert(inv);
        });

        inv.accept({
          description: 'desc',
          deadline: new Date().toISOString(),
          budget: '200',
        });

        await uow.run({}, async () => {
          await repo.update(inv);
        });

        const found = await repo.findById(order.orderId, inv.workshopId);
        expect(found!.status).toBe(WorkshopInvitationStatus.Accepted);
        expect(found!.description).toBe('desc');
        expect(found!.budget).toBe('200');
        expect(found!.version).toBe(inv.version);
        expect(inv.version).toBe(2);
      });
    });

    it('decline: transitions to Declined, payload null, bumps version', async () => {
      await inRollbackedTestTx(ds, async () => {
        const order = makeOrder({ commissionerId: randomUUID(), version: 1 });
        const req = makeRequest({ orderId: order.orderId, version: 1 });
        const inv = makeWorkshopInvitation({
          orderId: order.orderId,
          workshopId: randomUUID(),
          version: 1,
        });

        await uow.run({}, async () => {
          await orderRepo.insert(order);
          await requestRepo.insert(req);
          await repo.insert(inv);
        });

        inv.decline();
        await uow.run({}, async () => {
          await repo.update(inv);
        });

        const found = await repo.findById(order.orderId, inv.workshopId);
        expect(found!.status).toBe(WorkshopInvitationStatus.Declined);
        expect(found!.description).toBeNull();
        expect(found!.deadline).toBeNull();
        expect(found!.budget).toBeNull();
        expect(found!.version).toBe(inv.version);
        expect(inv.version).toBe(2);
      });
    });

    it('DB unique constraint prevents accepting more than one workshop for an order', async () => {
      await inRollbackedTestTx(ds, async () => {
        // Domain logic already ensures only one invitation can be accepted.
        // This test bypasses that rule to verify the database constraint directly.
        const order = makeOrder({ commissionerId: randomUUID(), version: 1 });
        const req = makeRequest({ orderId: order.orderId, version: 1 });
        const inv1 = makeWorkshopInvitation({
          orderId: order.orderId,
          workshopId: randomUUID(),
          version: 1,
        });
        const inv2 = makeWorkshopInvitation({
          orderId: order.orderId,
          workshopId: randomUUID(),
          version: 1,
        });

        await uow.run({}, async () => {
          await orderRepo.insert(order);
          await requestRepo.insert(req);
          await repo.insertMany([inv1, inv2]);
        });

        inv1.accept({
          description: 'desc1',
          deadline: new Date().toISOString(),
          budget: '100',
        });

        await uow.run({}, async () => {
          await repo.update(inv1);
        });

        inv2.accept({
          description: 'desc2',
          deadline: new Date().toISOString(),
          budget: '200',
        });

        await expect(
          uow.run({}, async () => {
            await repo.update(inv2);
          }),
        ).rejects.toThrow(InfraError);
      });
    });

    it('optimistic lock: stale update fails', async () => {
      await inRollbackedTestTx(ds, async () => {
        const order = makeOrder({ commissionerId: randomUUID(), version: 1 });
        const req = makeRequest({ orderId: order.orderId, version: 1 });
        const inv = makeWorkshopInvitation({
          orderId: order.orderId,
          workshopId: randomUUID(),
          version: 1,
        });

        await uow.run({}, async () => {
          await orderRepo.insert(order);
          await requestRepo.insert(req);
          await repo.insert(inv);
        });

        inv.accept({
          description: 'First',
          deadline: new Date().toISOString(),
          budget: '111',
        });
        await uow.run({}, async () => {
          await repo.update(inv);
        });

        const cur = inv.version;
        const stale = makeWorkshopInvitation({
          orderId: order.orderId,
          workshopId: inv.workshopId,
          version: 1,
        });
        stale.accept({
          description: 'Stale',
          deadline: new Date().toISOString(),
          budget: '222',
        });

        await expect(
          uow.run({}, async () => {
            await repo.update(stale);
          }),
        ).rejects.toThrow(InfraError);

        const latest = await repo.findById(order.orderId, inv.workshopId);
        expect(latest!.description).toBe('First');
        expect(latest!.version).toBe(cur);
      });
    });
  });
});
