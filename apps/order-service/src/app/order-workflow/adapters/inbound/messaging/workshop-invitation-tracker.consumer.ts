import {
  Controller,
  UseInterceptors,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { validator } from 'adapter';
import { InvitationDeclinedEventV1, KafkaTopics } from 'contracts';
import { LoggingInterceptor } from 'observability';
import { assertIsObject } from 'shared-kernel';

import { WorkshopInvitationTracker } from '../../../infra/workshop-invitation-tracker/workshop-invitation-tracker.service';
import { KafkaErrorDlqInterceptor } from 'error-handling/interceptor';

@Controller()
export class WorkshopInvitationTrackerConsumer {
  constructor(private readonly tracker: WorkshopInvitationTracker) {}

  @UseInterceptors(LoggingInterceptor, KafkaErrorDlqInterceptor)
  @EventPattern(KafkaTopics.InvitationDeclined)
  @UsePipes(new ValidationPipe(validator))
  async handleDeclined(@Payload() payload: InvitationDeclinedEventV1) {
    await this.tracker.handleResponse(payload.orderId, true);
  }

  @UseInterceptors(LoggingInterceptor, KafkaErrorDlqInterceptor)
  @EventPattern(KafkaTopics.OrderTransitions)
  @UsePipes(new ValidationPipe(validator))
  async handleAccepted(@Payload() payload: unknown) {
    assertIsObject(payload);
    if (payload['eventName'] !== 'InvitationAccepted') {
      //TODO enum
      return;
    }

    await this.tracker.handleResponse(payload['orderId'] as string, false);
  }
}
