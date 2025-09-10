import { randomUUID } from 'crypto';

import { Injectable } from '@nestjs/common';
import { assertIsFound } from 'apps/order-service/src/app/order-workflow/domain/entities/common/assert-is-found.assertion';
import { Order } from 'apps/order-service/src/app/order-workflow/domain/entities/order/order.entity';
import { OrderRepo } from 'apps/order-service/src/app/order-workflow/infra/persistence/repositories/order/order.repo';
import { OrderCompletedV1 } from 'contracts';
import { TypeOrmUoW, enqueueOutbox } from 'persistence';
import { isoNow } from 'shared-kernel';

export class OrderConfirmCompletionCommand {
  orderId: string;
  commissionerId: string;
  workshopId: string;
  order?: Order;
}

@Injectable()
export class OrderComfirmCompletionService {
  constructor(
    private readonly uow: TypeOrmUoW,
    private readonly orderRepo: OrderRepo,
  ) {}
  async confirmCompletion(cmd: OrderConfirmCompletionCommand) {
    return this.uow.runWithRetry({}, async () => {
      const order = cmd.order ?? (await this.orderRepo.findById(cmd.orderId));

      assertIsFound(order, Order, {
        orderId: cmd.orderId,
      });

      order.complete();

      await this.orderRepo.update(order);

      const eventPayload: OrderCompletedV1 = {
        eventId: randomUUID(),
        eventName: 'OrderCompleted',
        orderId: order.orderId,
        schemaV: 1,
        aggregateVersion: order.version,
        commissionerId: order.commissionerId,
        confirmedAt: isoNow(),
        workshopId: cmd.workshopId,
      };
      enqueueOutbox({
        id: randomUUID(),
        createdAt: isoNow(),
        payload: {
          ...eventPayload,
        },
      });
    });
  }
}
