import { randomUUID } from 'crypto';

import { Injectable, Logger } from '@nestjs/common';
import { MessageProducerPort } from 'adapter';
import {
  AllInvitationsDeclinedEventV1,
  AllResponsesReceivedEventV1,
  OrderEventInstanceUnion,
} from 'contracts';
import { isoNow } from 'shared-kernel';
import { DataSource, Repository } from 'typeorm';

import { InvitationResponseTracker } from './invitation-response-tracker.entity';

@Injectable()
export class WorkshopInvitationTracker {
  private readonly logger = new Logger(WorkshopInvitationTracker.name);

  constructor(
    private readonly ds: DataSource,
    private readonly producer: MessageProducerPort<OrderEventInstanceUnion>,
  ) {}

  async initialize(
    orderId: string,
    commissionerId: string,
    total: number,
  ): Promise<void> {
    const repo: Repository<InvitationResponseTracker> = this.ds.getRepository(
      InvitationResponseTracker,
    );

    const entity = new InvitationResponseTracker();
    entity.orderId = orderId;
    entity.commissionerId = commissionerId;
    entity.total = total;
    entity.responses = 0;
    entity.declines = 0;

    await repo.save(entity);
  }

  //TODO: rewrite with UoW, add actual listener for AllInvitationsDeclinedEventV1
  async handleResponse(orderId: string, declined: boolean) {
    const repo: Repository<InvitationResponseTracker> = this.ds.getRepository(
      InvitationResponseTracker,
    );

    const tracker = await repo.findOneBy({ orderId });
    if (!tracker) {
      this.logger.warn({
        message: `Received invitation response for unknown order`,
        orderId,
      });
      return;
    }

    tracker.responses += 1;
    if (declined) tracker.declines += 1;
    await repo.save(tracker);

    if (tracker.responses >= tracker.total) {
      const events: OrderEventInstanceUnion[] = [];

      const allRes: AllResponsesReceivedEventV1 = {
        eventId: randomUUID(),
        eventName: 'AllResponsesReceived',
        orderId: orderId,
        commissionerId: tracker.commissionerId,
        schemaV: 1,
        receivedAt: isoNow(),
      };
      events.push(allRes);

      if (tracker.declines >= tracker.total) {
        const allDecl: AllInvitationsDeclinedEventV1 = {
          eventId: randomUUID(),
          eventName: 'AllInvitationsDeclined',
          orderId: orderId,
          commissionerId: tracker.commissionerId,
          schemaV: 1,
          declinedAt: isoNow(),
        };
        events.push(allDecl);
      }

      await this.producer.dispatch(events);
      await repo.delete({ orderId });
    }
  }
}
