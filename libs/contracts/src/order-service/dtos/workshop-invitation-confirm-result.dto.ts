import { ApiProperty } from '@nestjs/swagger';

export class WorkshopInvitationConfirmResultDto {
  @ApiProperty({ type: String, format: 'uuid', description: 'Order ID' })
  orderId!: string;

  @ApiProperty({ type: String, format: 'uuid', description: 'Workshop ID' })
  workshopId!: string;
}
