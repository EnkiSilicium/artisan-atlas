import { Controller, UseInterceptors, UsePipes, ValidationPipe } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { InvitationDeclinedEventV1, KafkaTopics } from 'contracts';
import { KafkaErrorInterceptor } from 'error-handling/interceptor';
import { LoggingInterceptor } from 'observability';
import { validator } from 'adapter';

import { WorkshopInvitationTracker } from '../../../infra/workshop-invitation-tracker/workshop-invitation-tracker.service';

@Controller()
export class WorkshopInvitationTrackerKafkaController {
  constructor(private readonly tracker: WorkshopInvitationTracker) {}

  @UseInterceptors(KafkaErrorInterceptor, LoggingInterceptor)
  @EventPattern(KafkaTopics.InvitationDeclined)
  @UsePipes(new ValidationPipe(validator))
  async handleDeclined(@Payload() payload: InvitationDeclinedEventV1) {
    await this.tracker.handleResponse(payload.orderID, true);
  }

  @UseInterceptors(KafkaErrorInterceptor, LoggingInterceptor)
  @EventPattern(KafkaTopics.OrderTransitions)
  @UsePipes(new ValidationPipe(validator))
  async handleAccepted(@Payload() payload: any) {
    if (payload?.eventName !== 'InvitationAccepted') {
      //TODO enum
      return;
    }

    await this.tracker.handleResponse(payload?.orderID, false);
  }
}
