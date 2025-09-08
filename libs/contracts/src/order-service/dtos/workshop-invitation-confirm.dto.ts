import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

/**
 * DTO used to confirm an accepted workshop invitation.
 */
export class ConfirmAcceptedInvitationDtoV1 {
  @ApiProperty({
    type: String,
    format: 'uuid',
    description: 'ID of the workshop being confirmed',
  })
  @IsString()
  @IsNotEmpty()
  workshopId!: string;

  @ApiProperty({
    type: String,
    format: 'uuid',
    description: 'ID of the order',
  })
  @IsString()
  @IsNotEmpty()
  orderId!: string;
}
