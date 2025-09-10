import { IsString, IsNotEmpty, Equals, IsISO8601 } from 'class-validator';
import { BaseEvent } from 'libs/contracts/src/_common/base-event.event';

export class VipLostEventV1 implements BaseEvent<'VipLost'> {
  @IsString()
  @IsNotEmpty()
  eventName!: 'VipLost';

  @IsString()
  @IsNotEmpty()
  eventId!: string;

  @IsString()
  @IsNotEmpty()
  commissionerId!: string;

  @Equals(1)
  schemaV!: 1;

  @IsISO8601()
  accquiredAt!: string;
}
