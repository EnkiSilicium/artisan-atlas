import {
  ArrayNotEmpty,
  Equals,
  IsArray,
  IsISO8601,
  IsInt,
  IsNotEmpty,
  IsString,
  ValidateNested,
} from 'class-validator';
import { BaseEvent } from 'libs/contracts/src/_common/base-event.event';
import { OrderInitRequestPayload } from 'libs/contracts/src/commissioner/events/order-init-requested.event';

export class OrderPlacedEventV1 implements BaseEvent<'OrderPlaced'> {
  @IsString()
  @IsNotEmpty()
  eventName!: 'OrderPlaced';

  @IsString()
  @IsNotEmpty()
  eventId!: string;

  @IsString()
  @IsNotEmpty()
  orderID!: string;

  @IsString()
  @IsNotEmpty()
  commissionerId!: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  selectedWorkshops!: string[];

  @ValidateNested()
  request!: OrderInitRequestPayload;

  @IsInt()
  aggregateVersion!: number;

  @Equals(1)
  schemaV!: 1;

  @IsISO8601()
  placedAt!: string;
}
