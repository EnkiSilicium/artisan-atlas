import {
  Equals,
  IsISO8601,
  IsInt,
  IsNotEmpty,
  IsString,
} from 'class-validator';
import { BaseEvent } from 'libs/contracts/src/_common/base-event.event';

export class CancelledEventV1 implements BaseEvent<'Cancelled'> {
  @IsString()
  @IsNotEmpty()
  eventName!: 'Cancelled';

  @IsString()
  @IsNotEmpty()
  eventId!: string;

  @IsString()
  @IsNotEmpty()
  orderId!: string;

  @IsString()
  cancelledBy!: 'commissioner' | 'workshop';

  @IsInt()
  aggregateVersion!: number;

  @Equals(1)
  schemaV!: 1;

  @IsISO8601()
  cancelledAt!: string;
}
