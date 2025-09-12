import {
  Body,
  Controller,
  Patch,
  UseInterceptors,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { validator } from 'adapter';
import { BonusEventService } from 'apps/bonus-service/src/app/modules/bonus-processor/application/services/bonus-event/bonus-event.service';
import { BonusEventName } from 'apps/bonus-service/src/app/modules/bonus-processor/domain/aggregates/common/bonus-event.registy';
import { HttpErrorInterceptor } from 'error-handling/interceptor';
import { LoggingInterceptor } from 'observability';
import { assertIsObject, isoNow } from 'shared-kernel';

import type { BaseEvent } from 'contracts';

@Controller('mock')
export class MockController {
  constructor(private readonly bonusService: BonusEventService) {}

  //TODO: make "class BaseBonusEvent extends BonusEvent<keyof BonusEventRegistry>" with class validators
  @UseInterceptors(LoggingInterceptor, HttpErrorInterceptor)
  @Patch()
  @UsePipes(new ValidationPipe(validator))
  process(@Body() body: BaseEvent<string>) {
    assertIsObject(body);
    return this.bonusService.process({
      commissionerId: body['commissionerId'] as string,
      eventName: body['eventName'] as BonusEventName,
      eventId: body.eventId,
      injestedAt: isoNow(),
    });
  }
}
