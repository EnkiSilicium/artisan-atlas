import { IsString, IsNotEmpty, Equals, IsISO8601 } from 'class-validator';
import { BaseEvent } from 'libs/contracts/src/_common/base-event.event';

export class GradeAttainedEventV1 implements BaseEvent<'GradeAttained'> {
  @IsString()
  @IsNotEmpty()
  eventName!: 'GradeAttained';

  @IsString()
  @IsNotEmpty()
  eventId!: string;

  @IsString()
  @IsNotEmpty()
  commissionerId!: string;

  @IsString()
  @IsNotEmpty()
  grade!: string;

  @Equals(1)
  schemaV!: 1;

  @IsISO8601()
  attainedAt!: string;
}
