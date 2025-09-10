import { randomUUID } from 'crypto';

import { Injectable } from '@nestjs/common';
import { WorkshopInvitationTrackerPort } from 'apps/order-service/src/app/order-workflow/application/ports/initialize-tracker.port';
import { WorkshopPort } from 'apps/order-service/src/app/order-workflow/application/ports/workshop.port';
import { OrderInitCommand } from 'apps/order-service/src/app/order-workflow/application/services/order/order-init.command';
import { Order } from 'apps/order-service/src/app/order-workflow/domain/entities/order/order.entity';
import { RequestEntity } from 'apps/order-service/src/app/order-workflow/domain/entities/request/request.entity';
import { WorkshopInvitation } from 'apps/order-service/src/app/order-workflow/domain/entities/workshop-invitation/workshop-invitation.entity';
import { OrderRepo } from 'apps/order-service/src/app/order-workflow/infra/persistence/repositories/order/order.repo';
import { RequestRepo } from 'apps/order-service/src/app/order-workflow/infra/persistence/repositories/request/request.repo';
import { WorkshopInvitationRepo } from 'apps/order-service/src/app/order-workflow/infra/persistence/repositories/workshop-invitation/workshop-invitation.repo';
import { OrderInitResultDto, OrderPlacedEventV1 } from 'contracts';
import { TypeOrmUoW, enqueueOutbox } from 'persistence';
import { isoNow } from 'shared-kernel';

@Injectable()
export class OrderInitService {
  constructor(
    public readonly uow: TypeOrmUoW,
    private readonly orderRepo: OrderRepo,
    private readonly requestsRepo: RequestRepo,
    private readonly workshopInvitationRepo: WorkshopInvitationRepo,
    private readonly workshopPort: WorkshopPort,
    private readonly workshopTrackerPort: WorkshopInvitationTrackerPort,
  ) {}
  async orderInit(cmd: OrderInitCommand): Promise<OrderInitResultDto> {
    return this.uow.runWithRetry({}, async () => {
      const payload = cmd.payload;

      await this.workshopPort.checkWorkshopExistsMany(
        payload.selectedWorkshops,
      );

      const order = new Order({
        commissionerId: payload.commissionerId,
      });

      const request = new RequestEntity({
        orderId: order.orderId,
        title: payload.request.title,
        budget: payload.request.budget,
        deadline: payload.request.deadline,
        description: payload.request.description,
      });

      const workshopInvitations: WorkshopInvitation[] = [];
      for (const workshopId of payload.selectedWorkshops) {
        const invitation = new WorkshopInvitation({
          orderId: order.orderId,
          workshopId: workshopId,
        });
        workshopInvitations.push(invitation);
      }

      const amountOfInvitations = workshopInvitations.length;
      await this.workshopTrackerPort.initializeTracker(
        order.orderId,
        cmd.payload.commissionerId,
        amountOfInvitations,
      );

      await this.orderRepo.insert(order);
      await this.requestsRepo.insert(request);
      await this.workshopInvitationRepo.insertMany(workshopInvitations);

      const eventPayload: OrderPlacedEventV1 = {
        eventId: randomUUID(),
        eventName: 'OrderPlaced',
        commissionerId: cmd.payload.commissionerId,
        orderId: order.orderId,
        placedAt: order.createdAt,
        request: {
          title: request.title,
          description: request.description,
          deadline: request.deadline,
          budget: request.budget,
        },
        aggregateVersion: order.version,
        schemaV: 1,
        selectedWorkshops: cmd.payload.selectedWorkshops,
      };
      enqueueOutbox({
        id: randomUUID(),
        createdAt: isoNow(),
        payload: {
          ...eventPayload,
        },
      });
      return { orderId: order.orderId };
    });
  }
}
