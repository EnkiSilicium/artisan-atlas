import { Injectable } from '@nestjs/common';
import { assertIsFound } from 'apps/order-service/src/app/order-workflow/domain/entities/common/assert-is-found.assertion';
import { WorkshopInvitation } from 'apps/order-service/src/app/order-workflow/domain/entities/workshop-invitation/workshop-invitation.entity';
import { WorkshopInvitationRepo } from 'apps/order-service/src/app/order-workflow/infra/persistence/repositories/workshop-invitation/workshop-invitation.repo';
import { TypeOrmUoW } from 'persistence';

export type WorkshopInvitationEditBudgetCommand = {
  orderId: string;
  workshopId: string;
  payload: { budget: string };
};

export type WorkshopInvitationEditDescriptionCommand = {
  orderId: string;
  workshopId: string;
  payload: { description: string };
};

export type WorkshopInvitationEditDeadlineCommand = {
  orderId: string;
  workshopId: string;
  payload: { deadline: string };
};

@Injectable()
export class WorkshopInvitationEditService {
  constructor(
    public readonly uow: TypeOrmUoW,
    private readonly workshopInvitationsRepo: WorkshopInvitationRepo,
  ) {}
  async editBudget(cmd: WorkshopInvitationEditBudgetCommand) {
    return this.uow.runWithRetry({}, async () => {
      const workshopInvitation = await this.workshopInvitationsRepo.findById(
        cmd.orderId,
        cmd.workshopId,
      );
      assertIsFound(workshopInvitation, WorkshopInvitation, {
        orderId: cmd.orderId,
        workshopId: cmd.workshopId,
      });

      workshopInvitation.editBudget(cmd.payload.budget);

      await this.workshopInvitationsRepo.update(workshopInvitation);

      // enqueueOutbox({
      //   id: randomUUID(),
      //   createdAt: isoNow(),
      //   topic: ,
      //   payload: {
      //     orderId: cmd.orderId,
      //     workshopId: cmd.workshopId,
      //     status: workshopInvitation.status,
      //   },
      // });
    });
  }

  async editDescription(cmd: WorkshopInvitationEditDescriptionCommand) {
    return this.uow.runWithRetry({}, async () => {
      const workshopInvitation = await this.workshopInvitationsRepo.findById(
        cmd.orderId,
        cmd.workshopId,
      );
      assertIsFound(workshopInvitation, WorkshopInvitation, {
        orderId: cmd.orderId,
        workshopId: cmd.workshopId,
      });

      workshopInvitation.editDescription(cmd.payload.description);

      await this.workshopInvitationsRepo.update(workshopInvitation);

      // enqueueOutbox({
      //   id: randomUUID(),
      //   createdAt: isoNow(),
      //   topic: ,
      //   payload: {
      //     orderId: cmd.orderId,
      //     workshopId: cmd.workshopId,
      //     status: workshopInvitation.status
      //   },
      // });
    });
  }

  async editDeadline(cmd: WorkshopInvitationEditDeadlineCommand) {
    return this.uow.runWithRetry({}, async () => {
      const workshopInvitation = await this.workshopInvitationsRepo.findById(
        cmd.orderId,
        cmd.workshopId,
      );
      assertIsFound(workshopInvitation, WorkshopInvitation, {
        orderId: cmd.orderId,
        workshopId: cmd.workshopId,
      });

      workshopInvitation.editDeadline(cmd.payload.deadline);

      await this.workshopInvitationsRepo.update(workshopInvitation);

      // enqueueOutbox({
      //   id: randomUUID(),
      //   createdAt: isoNow(),
      //   topic: ,
      //   payload: {
      //     orderId: cmd.orderId,
      //     workshopId: cmd.workshopId,
      //     status: workshopInvitation.status
      //   },
      // });
    });
  }
}
