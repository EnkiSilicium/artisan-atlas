import {
  IsString,
  IsNotEmpty,
  IsISO8601,
  Equals,
  IsInt,
} from 'class-validator';
import { BaseEvent } from 'libs/contracts/src/_common/base-event.event';

export class OrderCompletedEventV1 implements BaseEvent<'OrderCompleted'> {
  @IsString()
  @IsNotEmpty()
  eventName!: 'OrderCompleted';

  @IsString()
  @IsNotEmpty()
  eventId!: string;

  @IsString()
  @IsNotEmpty()
  orderId!: string;

  @IsString()
  @IsNotEmpty()
  workshopId!: string;

  @IsString()
  @IsNotEmpty()
  commissionerId!: string;

  @IsInt()
  aggregateVersion!: number;

  @IsISO8601()
  confirmedAt!: string;

  @Equals(1)
  schemaV!: 1;
}
