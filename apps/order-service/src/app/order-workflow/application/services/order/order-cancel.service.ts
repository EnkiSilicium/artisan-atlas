import { randomUUID } from 'crypto';

import { Injectable } from '@nestjs/common';
import { assertIsFound } from 'apps/order-service/src/app/order-workflow/domain/entities/common/assert-is-found.assertion';
import { Order } from 'apps/order-service/src/app/order-workflow/domain/entities/order/order.entity';
import { OrderRepo } from 'apps/order-service/src/app/order-workflow/infra/persistence/repositories/order/order.repo';
import { OrderCancelledEventV1 } from 'contracts';
import { TypeOrmUoW, enqueueOutbox } from 'persistence';
import { isoNow } from 'shared-kernel';

export class OrderCancelCommand {
  orderId: string;
  cancelledBy: string;
  reason: string;
  order?: Order;
}

@Injectable()
export class OrderCancelService {
  constructor(
    public readonly uow: TypeOrmUoW,
    private readonly orderRepo: OrderRepo,
  ) {}
  async orderCancel(cmd: OrderCancelCommand) {
    return this.uow.runWithRetry({}, async () => {
      const order = cmd.order ?? (await this.orderRepo.findById(cmd.orderId));

      assertIsFound(order, Order, {
        orderId: cmd.orderId,
      });

      order.cancelOrder();

      await this.orderRepo.update(order);

      const eventPayload: OrderCancelledEventV1 = {
        eventId: randomUUID(),
        eventName: 'OrderCancelled',
        orderId: order.orderId,
        cancelledBy: order.createdAt,
        schemaV: 1,
        reason: cmd.reason || 'No reason provided',
        cancelledAt: isoNow(),
        aggregateVersion: order.version,
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
