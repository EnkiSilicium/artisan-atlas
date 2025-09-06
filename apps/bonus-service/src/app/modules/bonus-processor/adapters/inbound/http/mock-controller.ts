import { Body, Controller, Patch, UseInterceptors, UsePipes, ValidationPipe } from "@nestjs/common";
import { getHashId } from "apps/bonus-service/src/app/modules/bonus-processor/adapters/inbound/messaging/kafka.consumer";
import { BonusEventService } from "apps/bonus-service/src/app/modules/bonus-processor/application/services/bonus-event/bonus-event.service";
import { HttpErrorInterceptor } from "error-handling/interceptor";
import { LoggingInterceptor } from "observability";
import { assertIsObject, isoNow } from "shared-kernel";
import { http } from "winston";
import { validator } from 'adapter';
import { BonusEventName } from "apps/bonus-service/src/app/modules/bonus-processor/domain/aggregates/common/bonus-event.registy.js";

@Controller('mock')
export class MockController {
    constructor(private readonly bonusService: BonusEventService) { }

    //TODO: make "class BaseBonusEvent extends BonusEvent<keyof BonusEventRegistry>" with class validators
    @UseInterceptors(LoggingInterceptor, HttpErrorInterceptor)
    @Patch()
    @UsePipes(new ValidationPipe(validator))
    process(@Body() body: unknown) {
        assertIsObject(body);
        return this.bonusService.process({
            commissionerId: body['commissionerId'] as string,
            eventName: body['eventName'] as BonusEventName,
            eventId: getHashId(body),
            injestedAt: isoNow(),
        });
    }
}
