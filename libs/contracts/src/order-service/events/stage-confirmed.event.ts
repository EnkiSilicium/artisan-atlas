import { IsString, IsNotEmpty, Equals, IsISO8601 } from 'class-validator';
import { BaseEvent } from 'libs/contracts/src/_common/base-event.event';

export class StageConfirmedEventV1 implements BaseEvent<'StageConfirmed'> {
  @IsString()
  @IsNotEmpty()
  eventName!: 'StageConfirmed';

  @IsString()
  @IsNotEmpty()
  eventId!: string;

  @IsString()
  @IsNotEmpty()
  orderID!: string;

  @IsString()
  @IsNotEmpty()
  workshopID!: string;

  @IsString()
  @IsNotEmpty()
  commissionerId!: string;

  @IsString()
  @IsNotEmpty()
  stageName!: string;

  @Equals(1)
  schemaV!: 1;

  @IsISO8601()
  confirmedAt!: string;
}
