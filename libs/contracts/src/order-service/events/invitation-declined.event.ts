import { IsString, IsNotEmpty, Equals, IsISO8601 } from 'class-validator';
import { BaseEvent } from 'libs/contracts/src/_common/base-event.event';

export class InvitationDeclinedEventV1
  implements BaseEvent<'InvitationDeclined'>
{
  @IsString()
  @IsNotEmpty()
  eventName!: 'InvitationDeclined';

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

  @Equals(1)
  schemaV!: 1;

  @IsISO8601()
  declinedAt!: string;
}
