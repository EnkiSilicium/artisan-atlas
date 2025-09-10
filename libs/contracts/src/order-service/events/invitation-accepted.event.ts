import {
  IsString,
  IsNotEmpty,
  Equals,
  IsISO8601,
  IsInt,
} from 'class-validator';
import { BaseEvent } from 'libs/contracts/src/_common/base-event.event';

export class InvitationAcceptedEventV1
  implements BaseEvent<'InvitationAccepted'>
{
  @IsString()
  @IsNotEmpty()
  eventName!: 'InvitationAccepted';

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
  acceptedAt!: string;
}
