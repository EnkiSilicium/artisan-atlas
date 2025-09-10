import { randomUUID } from 'crypto';

import { Test } from '@nestjs/testing';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { Order } from 'apps/order-service/src/app/order-workflow/domain/entities/order/order.entity';
import { makeOrder } from 'apps/order-service/src/app/order-workflow/domain/entities/order/order.entity.mock-factory';
import { RequestEntity } from 'apps/order-service/src/app/order-workflow/domain/entities/request/request.entity';
import { Stage } from 'apps/order-service/src/app/order-workflow/domain/entities/stage/stage.entity';
import { WorkshopInvitation } from 'apps/order-service/src/app/order-workflow/domain/entities/workshop-invitation/workshop-invitation.entity';
import { makeWorkshopInvitation } from 'apps/order-service/src/app/order-workflow/domain/entities/workshop-invitation/workshop-invitation.entity.mock-factory';
import { OrderRepo } from 'apps/order-service/src/app/order-workflow/infra/persistence/repositories/order/order.repo';
import { makeRequest } from 'apps/order-service/src/app/order-workflow/infra/persistence/repositories/request/request.mock-factory';
import { RequestRepo } from 'apps/order-service/src/app/order-workflow/infra/persistence/repositories/request/request.repo';
import { WorkshopInvitationRepo } from 'apps/order-service/src/app/order-workflow/infra/persistence/repositories/workshop-invitation/workshop-invitation.repo';
import { InfraError } from 'error-handling/error-core';
import { OutboxService, TypeOrmUoW, inRollbackedTestTx } from 'persistence';
import { DataSource } from 'typeorm';

import type { TestingModule } from '@nestjs/testing';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { MessageProducerPort } from 'adapter';

describe('RequestRepo (integration)', () => {
  let moduleRef: TestingModule;
  let ds: DataSource;
  let orderRepo: OrderRepo;
  let requestRepo: RequestRepo;
  let invitationRepo: WorkshopInvitationRepo;
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
        RequestRepo,
        WorkshopInvitationRepo,
        { provide: DataSource, useValue: ds },
        { provide: 'KAFKA_PUBLISHER', useValue: kafkaMock },
        {
          provide: TypeOrmUoW,
          useFactory: (dataSource: DataSource, kafka: any) =>
            new TypeOrmUoW(ds, {} as OutboxService, kafka),
          inject: [DataSource, 'KAFKA_PUBLISHER'],
        },
      ],
    }).compile();

    orderRepo = moduleRef.get(OrderRepo);
    requestRepo = moduleRef.get(RequestRepo);
    invitationRepo = moduleRef.get(WorkshopInvitationRepo);
    uow = moduleRef.get(TypeOrmUoW);
  });

  afterAll(async () => {
    await ds.destroy();
    await container.stop();
  });
  describe('insert', () => {
    it('sets version=1 and links to order', async () => {
      await inRollbackedTestTx(ds, async () => {
        const order = makeOrder({ commissionerId: randomUUID(), version: 1 });
        const req = makeRequest({
          orderId: order.orderId,
          version: 1,
        });

        await uow.run({}, async () => {
          await orderRepo.insert(order);
          await requestRepo.insert(req);
        });

        const found = await requestRepo.findById(order.orderId);
        expect(found).not.toBeNull();
        expect(found!.version).toBe(1);
        expect(req.version).toBe(1);
        expect(found!.orderId).toBe(order.orderId);
      });
    });
  });

  describe('findById', () => {
    it('loads all workshop invitations', async () => {
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
          await invitationRepo.insertMany([i1, i2]);
        });

        const found = await requestRepo.findById(order.orderId);
        expect(found).not.toBeNull();
        expect(found!.workshopInvitations).toHaveLength(2);
        const ids = found!.workshopInvitations.map((i) => i.workshopId).sort();
        expect(ids).toEqual([i1.workshopId, i2.workshopId].sort());
      });
    });
  });

  describe('update', () => {
    it('bumps version and persists changes', async () => {
      await inRollbackedTestTx(ds, async () => {
        const order = makeOrder({ commissionerId: randomUUID(), version: 1 });
        const req = makeRequest({
          orderId: order.orderId,
          title: 'A',
          description: 'B',
          budget: '50',
          version: 1,
        });

        await uow.run({}, async () => {
          await orderRepo.insert(order);
          await requestRepo.insert(req);
        });

        const v1 = req.version;
        req.title = 'A2';
        req.budget = '60';

        await uow.run({}, async () => {
          await requestRepo.update(req);
        });

        const found = await requestRepo.findById(order.orderId);
        expect(found!.title).toBe('A2');
        expect(found!.budget).toBe('60');
        expect(found!.version).toBe(v1 + 1);
        expect(req.version).toBe(v1 + 1);
      });
    });

    it('optimistic lock: stale update fails', async () => {
      await inRollbackedTestTx(ds, async () => {
        const order = makeOrder({ commissionerId: randomUUID(), version: 1 });
        const req = makeRequest({
          orderId: order.orderId,
          title: 'C',
          description: 'D',
          budget: '77',
          version: 1,
        });

        await uow.run({}, async () => {
          await orderRepo.insert(order);
          await requestRepo.insert(req);
        });

        req.description = 'First';
        await uow.run({}, async () => {
          await requestRepo.update(req);
        });
        const cur = req.version;

        const stale = makeRequest({
          orderId: req.orderId,
          title: req.title,
          description: 'Stale',
          deadline: req.deadline,
          budget: req.budget,
          version: cur - 1,
        });

        await expect(
          uow.run({}, async () => {
            await requestRepo.update(stale);
          }),
        ).rejects.toThrow(InfraError);

        const latest = await requestRepo.findById(order.orderId);
        expect(latest!.description).toBe('First');
        expect(latest!.version).toBe(cur);
      });
    });
  });
});
