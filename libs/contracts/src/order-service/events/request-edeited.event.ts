import { IsString, IsNotEmpty, Equals } from 'class-validator';
import { BaseEvent } from 'libs/contracts/src/_common/base-event.event';

export class RequestEditedEventV1 implements BaseEvent<'RequestEdited'> {
  @IsString()
  @IsNotEmpty()
  eventName!: 'RequestEdited';

  @IsString()
  @IsNotEmpty()
  eventId!: string;

  @IsString()
  @IsNotEmpty()
  commissionerId!: string;

  @IsString()
  @IsNotEmpty()
  orderId!: string;

  @IsString()
  @IsNotEmpty()
  workshopId!: string;

  @Equals(1)
  schemaV!: 1;
}
