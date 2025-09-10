import {
  IsString,
  IsNotEmpty,
  Equals,
  IsISO8601,
  IsInt,
} from 'class-validator';
import { BaseEvent } from 'libs/contracts/src/_common/base-event.event';

export class OrderMarkedAsCompletedEventV1
  implements BaseEvent<'OrderMarkedAsCompleted'>
{
  @IsString()
  @IsNotEmpty()
  eventName!: 'OrderMarkedAsCompleted';

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

  @Equals(1)
  schemaV!: 1;

  @IsISO8601()
  markedAt!: string;

  @IsInt()
  aggregateVersion!: number;
}
