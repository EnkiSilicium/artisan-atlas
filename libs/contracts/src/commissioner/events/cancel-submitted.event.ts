import { IsString, IsNotEmpty, IsIn, Equals, IsISO8601 } from 'class-validator';

export class CancelSubmittedEvent {
  @IsString()
  @IsNotEmpty()
  orderId!: string;

  @IsIn(['commissioner', 'workshop']) // read: must be exactly "commissioner" or "workshop"
  cancelledBy!: 'commissioner' | 'workshop';

  @Equals(1)
  schemaV!: 1;

  @IsISO8601()
  cancelledAt!: string;
}
