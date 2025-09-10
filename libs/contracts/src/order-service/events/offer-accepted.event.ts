import { IsString, IsNotEmpty, Equals, IsISO8601 } from 'class-validator';
import { BaseEvent } from 'libs/contracts/src/_common/base-event.event';

export class WorkshopInvitationAcceptedEventV1
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
  orderID!: string;

  @IsString()
  @IsNotEmpty()
  commissionerId!: string;

  @IsString()
  @IsNotEmpty()
  workshopID!: string;

  @Equals(1)
  schemaV!: 1;

  @IsISO8601()
  acceptedAt!: string;
}
