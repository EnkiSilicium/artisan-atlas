import { randomUUID } from 'crypto';

import { Injectable } from '@nestjs/common';
import {
  AcceptWorkshopInvitationCommand,
  DeclineWorkshopInvitationCommand,
  ConfirmWorkshopInvitationCommand,
} from 'apps/order-service/src/app/order-workflow/application/services/workshop/workshop-invitation-response.command';
import { assertIsFound } from 'apps/order-service/src/app/order-workflow/domain/entities/common/assert-is-found.assertion';
import { Order } from 'apps/order-service/src/app/order-workflow/domain/entities/order/order.entity';
import { stagesTemplateFactory } from 'apps/order-service/src/app/order-workflow/domain/entities/stage/stage-defaults.factory';
import {
  constructStageData,
  StagesAggregate,
} from 'apps/order-service/src/app/order-workflow/domain/entities/stage/stage.entity';
import { WorkshopInvitation } from 'apps/order-service/src/app/order-workflow/domain/entities/workshop-invitation/workshop-invitation.entity';
import { OrderRepo } from 'apps/order-service/src/app/order-workflow/infra/persistence/repositories/order/order.repo';
import { StagesAggregateRepo } from 'apps/order-service/src/app/order-workflow/infra/persistence/repositories/stage/stage.repo';
import { WorkshopInvitationRepo } from 'apps/order-service/src/app/order-workflow/infra/persistence/repositories/workshop-invitation/workshop-invitation.repo';
import {
  WorkshopInvitationAcceptResultDto,
  WorkshopInvitationDeclineResultDto,
  WorkshopInvitationConfirmResultDto,
  InvitationAcceptedEventV1,
  InvitationDeclinedEventV1,
  InvitationConfirmedEventV1,
} from 'contracts';
import { TypeOrmUoW, enqueueOutbox } from 'persistence';
import { isoNow } from 'shared-kernel';

@Injectable()
export class WorkshopInvitationResponseService {
  constructor(
    public readonly uow: TypeOrmUoW,
    private readonly orderRepo: OrderRepo,
    private readonly workshopInvitationsRepo: WorkshopInvitationRepo,
    private readonly stagesAggregateRepo: StagesAggregateRepo,
  ) {}

  async acceptWorkshopInvitation(
    cmd: AcceptWorkshopInvitationCommand,
  ): Promise<WorkshopInvitationAcceptResultDto> {
    return this.uow.runWithRetry({}, async () => {
      const order = cmd.order ?? (await this.orderRepo.findById(cmd.orderId));

      assertIsFound(order, Order, {
        orderId: cmd.orderId,
      });

      const workshopInvitation = await this.workshopInvitationsRepo.findById(
        cmd.orderId,
        cmd.workshopId,
      );
      assertIsFound(workshopInvitation, WorkshopInvitation, {
        orderId: cmd.orderId,
        workshopId: cmd.workshopId,
      });

      const stageDefault: constructStageData =
        stagesTemplateFactory.produceDefault(cmd.orderId, cmd.workshopId);
      const stages = cmd.payload.stages
        ? new StagesAggregate(cmd.payload.stages)
        : new StagesAggregate([stageDefault]);

      workshopInvitation.accept(cmd.payload);

      await this.stagesAggregateRepo.save(stages);
      await this.workshopInvitationsRepo.update(workshopInvitation);

      const eventPayload: InvitationAcceptedEventV1 = {
        commissionerId: order.commissionerId,
        eventName: 'InvitationAccepted',
        acceptedAt: isoNow(),
        orderID: order.orderId,
        aggregateVersion: order.version,
        schemaV: 1,
        workshopID: cmd.workshopId,
      };
      enqueueOutbox({
        id: randomUUID(),
        createdAt: isoNow(),
        payload: { ...eventPayload },
      });
      return { orderId: cmd.orderId, workshopId: cmd.workshopId };
    });
  }

  async confirmWorkshopInvitation(
    cmd: ConfirmWorkshopInvitationCommand,
  ): Promise<WorkshopInvitationConfirmResultDto> {
    return this.uow.runWithRetry({}, async () => {
      const order = cmd.order ?? (await this.orderRepo.findById(cmd.orderId));
      assertIsFound(order, Order, { orderId: cmd.orderId });

      const workshopInvitation = await this.workshopInvitationsRepo.findById(
        cmd.orderId,
        cmd.workshopId,
      );
      assertIsFound(workshopInvitation, WorkshopInvitation, {
        orderId: cmd.orderId,
        workshopId: cmd.workshopId,
      });

      workshopInvitation.confirm();
      order.transitionToPendingCompletion();

      await this.workshopInvitationsRepo.update(workshopInvitation);
      await this.orderRepo.update(order);

      const eventPayload: InvitationConfirmedEventV1 = {
        commissionerId: order.commissionerId,
        eventName: 'InvitationConfirmed',
        confirmedAt: isoNow(),
        orderID: order.orderId,
        aggregateVersion: order.version,
        schemaV: 1,
        workshopID: cmd.workshopId,
      };

      enqueueOutbox({
        id: randomUUID(),
        createdAt: isoNow(),
        payload: { ...eventPayload },
      });

      return { orderId: cmd.orderId, workshopId: cmd.workshopId };
    });
  }

  //TODO: bundle N workshopInvitations
  async declineWorkshopInvitation(
    cmd: DeclineWorkshopInvitationCommand,
  ): Promise<WorkshopInvitationDeclineResultDto> {
    return this.uow.runWithRetry({}, async () => {
      const order = cmd.order ?? (await this.orderRepo.findById(cmd.orderId));
      assertIsFound(order, Order, {
        orderId: cmd.orderId,
        workshopId: cmd.workshopId,
      });

      const workshopInvitation = await this.workshopInvitationsRepo.findById(
        cmd.orderId,
        cmd.workshopId,
      );
      assertIsFound(workshopInvitation, WorkshopInvitation, {
        orderId: cmd.orderId,
        workshopId: cmd.workshopId,
      });

      workshopInvitation.decline();

      //order.cancelOrder();

      await this.workshopInvitationsRepo.update(workshopInvitation);
      await this.orderRepo.update(order);

      const eventPayload: InvitationDeclinedEventV1 = {
        commissionerId: order.commissionerId,
        eventName: 'InvitationDeclined',
        declinedAt: isoNow(),
        orderID: order.orderId,
        schemaV: 1,
        workshopID: cmd.workshopId,
      };

      enqueueOutbox({
        id: randomUUID(),
        createdAt: isoNow(),
        payload: { ...eventPayload },
      });
      return { orderId: cmd.orderId, workshopId: cmd.workshopId };
    });
  }
}
