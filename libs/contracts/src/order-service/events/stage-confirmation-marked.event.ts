import { IsString, IsNotEmpty, Equals, IsISO8601 } from "class-validator";
import { BaseEvent } from "libs/contracts/src/_common/base-event.event";

export class StageConfirmationMarkedEventV1 implements BaseEvent<'StageConfirmationMarked'> {
  @IsString()
  @IsNotEmpty()
  eventName!: 'StageConfirmationMarked'

  @IsString()
  @IsNotEmpty()
  orderID!: string;

  @IsString()
  @IsNotEmpty()
  workshopID!: string;

  @IsString()
  @IsNotEmpty()
  commissionerID!: string;

  @IsString()
  @IsNotEmpty()
  stageName!: string;

  @Equals(1)
  schemaV!: 1;

  @IsISO8601()
  confirmedAt!: string;
}