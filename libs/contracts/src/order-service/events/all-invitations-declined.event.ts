import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, Equals, IsISO8601 } from 'class-validator';
import { BaseEvent } from 'libs/contracts/src/_common/base-event.event';

export class AllInvitationsDeclinedEventV1
  implements BaseEvent<'AllInvitationsDeclined'>
{
  @ApiProperty({ enum: ['AllInvitationsDeclined'] })
  @IsString()
  @IsNotEmpty()
  eventName!: 'AllInvitationsDeclined';

  @ApiProperty({ type: String })
  @IsString()
  @IsNotEmpty()
  eventId!: string;

  @ApiProperty({ type: String })
  @IsString()
  @IsNotEmpty()
  orderId!: string;

  @ApiProperty({ type: String })
  @IsString()
  @IsNotEmpty()
  commissionerId!: string;

  @ApiProperty({ enum: [1] })
  @Equals(1)
  schemaV!: 1;

  @ApiProperty({ type: String, format: 'date-time' })
  @IsISO8601()
  declinedAt!: string;
}
