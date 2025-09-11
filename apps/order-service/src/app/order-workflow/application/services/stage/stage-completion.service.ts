import { randomUUID } from 'crypto';

import { Injectable } from '@nestjs/common';
import {
  AcceptCompletionMarkedCommand,
  ConfirmStageCompletionCommand,
} from 'apps/order-service/src/app/order-workflow/application/services/stage/stage-completion.command';
import { assertIsFound } from 'apps/order-service/src/app/order-workflow/domain/entities/common/assert-is-found.assertion';
import { Order } from 'apps/order-service/src/app/order-workflow/domain/entities/order/order.entity';
import { StagesAggregate } from 'apps/order-service/src/app/order-workflow/domain/entities/stage/stage.entity';
import { OrderRepo } from 'apps/order-service/src/app/order-workflow/infra/persistence/repositories/order/order.repo';
import { StagesAggregateRepo } from 'apps/order-service/src/app/order-workflow/infra/persistence/repositories/stage/stage.repo';
import {
  StageCompletionMarkResultDto,
  StageCompletionConfirmResultDto,
  StageConfirmationMarkedEventV1,
  StageConfirmedEventV1,
  AllStagesCompletedEventV1,
} from 'contracts';
import { OrderMarkedAsCompletedEventV1 } from 'contracts';
import { TypeOrmUoW, enqueueOutbox } from 'persistence';
import { isoNow } from 'shared-kernel';

@Injectable()
export class StageCompletionService {
  constructor(
    public readonly uow: TypeOrmUoW,
    private readonly ordersRepo: OrderRepo,
    private readonly stagesAggregateRepo: StagesAggregateRepo,
  ) {}

  async acceptCompletionMarked(
    cmd: AcceptCompletionMarkedCommand,
  ): Promise<StageCompletionMarkResultDto> {
    return this.uow.runWithRetry({}, async () => {
      const order = cmd.order ?? (await this.ordersRepo.findById(cmd.orderId));
      assertIsFound(order, Order, {
        orderId: cmd.orderId,
      });

      const stages = await this.stagesAggregateRepo.findByWorkshopInvitation({
        orderId: order.orderId,
        workshopId: cmd.workshopId,
      });
      assertIsFound(stages, StagesAggregate, {
        orderId: order.orderId,
        commissionerId: order.commissionerId,
        workshopId: cmd.workshopId,
      });

      const { allCompleted, stageCompleted } = stages.acceptCompletionMarked({
        stageName: cmd.payload.stageName,
      });

      await this.stagesAggregateRepo.save(stages);

      const stageMarkedEventPayload: StageConfirmationMarkedEventV1 = {
        eventId: randomUUID(),
        commissionerId: order.commissionerId,

        confirmedAt: isoNow(),
        eventName: 'StageConfirmationMarked',
        orderId: order.orderId,
        schemaV: 1,
        stageName: cmd.payload.stageName,
        workshopId: cmd.workshopId,
      };
      enqueueOutbox({
        id: randomUUID(),
        createdAt: isoNow(),
        payload: {
          ...stageMarkedEventPayload,
        },
      });

      if (stageCompleted) {
        const stageConfirmedEventPayload: StageConfirmedEventV1 = {
          eventId: randomUUID(),
          commissionerId: order.commissionerId,
          confirmedAt: isoNow(),
          eventName: 'StageConfirmed',
          orderId: order.orderId,
          schemaV: 1,
          stageName: cmd.payload.stageName,
          workshopId: cmd.workshopId,
        };
        enqueueOutbox({
          id: randomUUID(),
          createdAt: isoNow(),
          payload: {
            ...stageConfirmedEventPayload,
          },
        });
      }

      if (allCompleted) {
        order.markAsCompleted();
        await this.ordersRepo.update(order);

        const allStageConfirmedEventPayload: AllStagesCompletedEventV1 = {
          eventId: randomUUID(),
          commissionerId: order.commissionerId,

          completedAt: isoNow(),
          eventName: 'AllStagesCompleted',
          orderId: order.orderId,
          schemaV: 1,
          workshopId: cmd.workshopId,
        };
        enqueueOutbox({
          id: randomUUID(),
          createdAt: isoNow(),
          payload: {
            ...allStageConfirmedEventPayload,
          },
        });

        const oprderMarkedAsCompleted: OrderMarkedAsCompletedEventV1 = {
          eventId: randomUUID(),
          eventName: 'OrderMarkedAsCompleted',
          commissionerId: order.commissionerId,
          markedAt: isoNow(),
          orderId: order.orderId,
          schemaV: 1,
          workshopId: cmd.workshopId,
          aggregateVersion: order.version,
        };
        enqueueOutbox({
          id: randomUUID(),
          createdAt: isoNow(),
          payload: {
            ...oprderMarkedAsCompleted,
          },
        });
      }

      return {
        orderId: cmd.orderId,
        workshopId: cmd.workshopId,
        stageName: cmd.payload.stageName,
        stageCompleted,
        allStagesCompleted: allCompleted,
      };
    });
  }

  async confirmCompletion(
    cmd: ConfirmStageCompletionCommand,
  ): Promise<StageCompletionConfirmResultDto> {
    return this.uow.runWithRetry({}, async () => {
      const order = cmd.order ?? (await this.ordersRepo.findById(cmd.orderId));
      assertIsFound(order, Order, {
        orderId: cmd.orderId,
      });

      const stages = await this.stagesAggregateRepo.findByWorkshopInvitation({
        orderId: cmd.orderId,
        workshopId: cmd.workshopId,
      });
      assertIsFound(stages, StagesAggregate, {
        orderId: cmd.orderId,
        commissionerId: order.commissionerId,
        workshopId: cmd.workshopId,
      });

      const { allCompleted } = stages.confirmStage({
        stageName: cmd.payload.stageName,
      });

      await this.stagesAggregateRepo.save(stages);

      const stageConfirmedEventPayload: StageConfirmedEventV1 = {
        eventId: randomUUID(),
        commissionerId: order.commissionerId,
        confirmedAt: isoNow(),
        eventName: 'StageConfirmed',
        orderId: order.orderId,
        schemaV: 1,
        stageName: cmd.payload.stageName,
        workshopId: cmd.workshopId,
      };
      enqueueOutbox({
        id: randomUUID(),
        createdAt: isoNow(),
        payload: {
          ...stageConfirmedEventPayload,
        },
      });

      if (allCompleted) {
        order.markAsCompleted();

        await this.ordersRepo.update(order);

        const allStagedCompletedEventPayload: AllStagesCompletedEventV1 = {
          eventId: randomUUID(),
          commissionerId: order.commissionerId,
          completedAt: isoNow(),
          schemaV: 1,
          eventName: 'AllStagesCompleted',
          orderId: order.orderId,
          workshopId: cmd.workshopId,
        };
        enqueueOutbox({
          id: randomUUID(),
          createdAt: isoNow(),
          payload: {
            ...allStagedCompletedEventPayload,
          },
        });

        const oprderMarkedAsCompleted: OrderMarkedAsCompletedEventV1 = {
          eventId: randomUUID(),
          eventName: 'OrderMarkedAsCompleted',
          commissionerId: order.commissionerId,
          markedAt: isoNow(),
          orderId: order.orderId,
          schemaV: 1,
          workshopId: cmd.workshopId,
          aggregateVersion: order.version,
        };
        enqueueOutbox({
          id: randomUUID(),
          createdAt: isoNow(),
          payload: {
            ...oprderMarkedAsCompleted,
          },
        });
      }

      return {
        orderId: cmd.orderId,
        workshopId: cmd.workshopId,
        stageName: cmd.payload.stageName,
        allStagesCompleted: allCompleted,
      };
    });
  }
}
