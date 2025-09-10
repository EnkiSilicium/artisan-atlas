import {
  Equals,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { BaseEvent } from 'libs/contracts/src/_common/base-event.event';

export class OrderCancelledEventV1 implements BaseEvent<'OrderCancelled'> {
  @IsNotEmpty()
  @IsString()
  eventName!: 'OrderCancelled';

  @IsString()
  @IsNotEmpty()
  eventId!: string;

  @IsNotEmpty()
  @IsString()
  orderId!: string;

  @IsNotEmpty()
  @IsString()
  cancelledAt!: string;

  @IsNotEmpty()
  @IsString()
  @IsISO8601()
  cancelledBy!: string;

  @IsInt()
  aggregateVersion!: number;

  @IsOptional()
  @IsNotEmpty()
  @IsString()
  reason?: string;

  @Equals(1)
  schemaV!: 1;
}
