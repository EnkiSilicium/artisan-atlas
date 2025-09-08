import { createHash } from 'crypto';

import { Controller, UseInterceptors, UsePipes, ValidationPipe } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { BonusEventService } from 'apps/bonus-service/src/app/modules/bonus-processor/application/services/bonus-event/bonus-event.service';
import { KafkaTopics } from 'contracts';
import { assertsCanBeBonusEvent } from '../assertions/asserts-can-be-bonus-event.assertion';
import { LoggingInterceptor } from 'observability';
import { validator } from 'adapter';
import { assertIsObject, isoNow } from 'shared-kernel';
import { BonusEventName } from 'apps/bonus-service/src/app/modules/bonus-processor/domain/aggregates/common/bonus-event.registy.js';

@Controller()
export class BonusEventsConsumer {
  constructor(private readonly bonusService: BonusEventService) {}

  @UseInterceptors(LoggingInterceptor)
  @EventPattern(KafkaTopics.OrderTransitions)
  @UsePipes(new ValidationPipe(validator))
  async onOrderTransitions(@Payload() payload: object) {
    const eventId = getHashId(payload);
    await this.route({ ...payload, eventId });
  }

  @EventPattern(KafkaTopics.StageTransitions)
  @UsePipes(new ValidationPipe(validator))
  async onStageTransitions(@Payload() payload: object) {
    await this.route(payload);
  }

  // If event is invalid, it's detected at the application/domain layer.

    

  private async route(event: unknown): Promise<void> {
    assertIsObject(event);
    assertsCanBeBonusEvent(event);
    const eventId = (event['eventId'] as string | undefined) ?? getHashId(event);
    const { eventName, commissionerId } = event;
    const injestedAt = isoNow();

    await this.bonusService.process({
      eventId,
      commissionerId,
      injestedAt,
      //deciding whether it is actually a bonus even is domain logic
      eventName: eventName as BonusEventName, 
    });
  }
}

export function getHashId(payload: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify({ payload }))
    .digest('base64url')
    .slice(0, 10);
}
