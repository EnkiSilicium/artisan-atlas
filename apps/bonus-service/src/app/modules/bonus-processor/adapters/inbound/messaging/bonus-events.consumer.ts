import { createHash } from 'crypto';

import { Controller, UseInterceptors, UsePipes, ValidationPipe } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { BonusEventService } from 'apps/bonus-service/src/app/modules/bonus-processor/application/services/bonus-event/bonus-event.service';
import { KafkaTopics } from 'contracts';
import type {BaseEvent} from 'contracts'
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
  async onOrderTransitions(@Payload() payload: BaseEvent<string>) {
    await this.route({ ...payload });
  }

  @EventPattern(KafkaTopics.StageTransitions)
  @UsePipes(new ValidationPipe(validator))
  async onStageTransitions(@Payload() payload: BaseEvent<string>) {
    await this.route(payload);
  }

  // If event is invalid, it's detected at the application/domain layer.

    

  private async route(event: BaseEvent<string>): Promise<void> {
    assertIsObject(event);
    assertsCanBeBonusEvent(event);
   
    const { eventName, commissionerId, eventId } = event;
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

