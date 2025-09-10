import { IsString, IsNotEmpty, Equals, IsISO8601 } from 'class-validator';
import { BaseEvent } from 'libs/contracts/src/_common/base-event.event';

export class AllStagesCompletedEventV1
  implements BaseEvent<'AllStagesCompleted'>
{
  @IsString()
  @IsNotEmpty()
  eventName!: 'AllStagesCompleted';

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
  completedAt!: string;
}
