import { createHash } from 'crypto';

import { Controller, UseInterceptors, UsePipes, ValidationPipe } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { BonusEventService } from 'apps/bonus-service/src/app/modules/bonus-processor/application/services/bonus-event/bonus-event.service';
import { KafkaTopics } from 'contracts';
import { ProgrammerError } from 'error-handling/error-core';
import { ProgrammerErrorRegistry } from 'error-handling/registries/common';
import { LoggingInterceptor } from 'observability';
import { validator } from 'adapter';
import { isoNow } from 'shared-kernel';

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
  private async route(event: any): Promise<void> {
    const eventId = event?.eventId ?? getHashId(event);
    const commissionerId = event?.commissionerId;
    if (!commissionerId) {
      throw new ProgrammerError({
        errorObject: ProgrammerErrorRegistry.byCode.BUG,
        details: {
          description: `injested event named [${event?.eventName}] does not have commissionerId`,
        },
      });
    }
    const injestedAt = isoNow();
    const eventName = event?.eventName;
    if (!eventName) {
      throw new ProgrammerError({
        errorObject: ProgrammerErrorRegistry.byCode.BUG,
        details: { description: `injested event does not have eventName` },
      });
    }

    await this.bonusService.process({
      eventId,
      commissionerId,
      injestedAt,
      eventName,
    });
  }
}

export function getHashId(payload: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify({ payload }))
    .digest('base64url')
    .slice(0, 10);
}
