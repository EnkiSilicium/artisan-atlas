import { IsString, IsNotEmpty, Equals, IsISO8601 } from 'class-validator';
import { BaseEvent } from 'libs/contracts/src/_common/base-event.event';

export class AllResponsesReceivedEventV1
  implements BaseEvent<'AllResponsesReceived'>
{
  @IsString()
  @IsNotEmpty()
  eventName!: 'AllResponsesReceived';

  @IsString()
  @IsNotEmpty()
  eventId!: string;

  @IsString()
  @IsNotEmpty()
  orderId!: string;

  @IsString()
  @IsNotEmpty()
  commissionerId!: string;

  @Equals(1)
  schemaV!: 1;

  @IsISO8601()
  receivedAt!: string;
}
