import {
  IsString,
  IsNotEmpty,
  Equals,
  IsISO8601,
  IsInt,
} from 'class-validator';
import { BaseEvent } from 'libs/contracts/src/_common/base-event.event';

export class InvitationConfirmedEventV1
  implements BaseEvent<'InvitationConfirmed'>
{
  @IsString()
  @IsNotEmpty()
  eventName!: 'InvitationConfirmed';

  @IsString()
  @IsNotEmpty()
  eventId!: string;

  @IsString()
  @IsNotEmpty()
  commissionerId!: string;

  @IsString()
  @IsNotEmpty()
  orderID!: string;

  @IsString()
  @IsNotEmpty()
  workshopID!: string;

  @IsInt()
  aggregateVersion!: number;

  @Equals(1)
  schemaV!: 1;

  @IsISO8601()
  confirmedAt!: string;
}
