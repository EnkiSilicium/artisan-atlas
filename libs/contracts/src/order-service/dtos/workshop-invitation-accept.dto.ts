import { Optional } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsString,
  IsNotEmpty,
  ValidateNested,
  IsISO8601,
  IsBoolean,
  IsNumber,
} from 'class-validator';

/**
 * Acceptance payload data for a workshop invitation.
 */
export class AcceptWorkshopInvitationPayloadV1 {
  @ApiProperty({
    type: String,
    description: 'Additional description supplied by the workshop',
    example: 'Can start next month',
  })
  @IsString()
  @IsNotEmpty()
  description!: string;

  @ApiProperty({
    type: String,
    format: 'date-time',
    description: 'Proposed deadline for the work (ISO‑8601 timestamp)',
    example: '2024-06-01T00:00:00.000Z',
  })
  @IsISO8601()
  deadline!: string;

  @ApiProperty({
    type: String,
    description: 'Proposed budget for the work',
    example: '1500',
  })
  @IsString()
  @IsNotEmpty()
  budget!: string;
}

export class StagesDataV1 {
  @ApiProperty({
    type: String,
    description: 'Name of the stage',
    example: 'Design',
  })
  @IsString()
  @IsNotEmpty()
  stageName!: string;

  @ApiProperty({
    type: String,
    description:
      'Approximate length of the stage in any format (e.g., "2 weeks")',
    example: '2 weeks',
  })
  @IsString()
  @IsNotEmpty()
  approximateLength!: string;

  @ApiProperty({
    type: Boolean,
    description: 'Whether the stage needs confirmation',
    example: true,
  })
  @IsNotEmpty()
  @IsBoolean()
  needsConfirmation!: boolean;

  @ApiProperty({
    type: String,
    description: 'Description of the stage',
    example: 'Initial design work',
  })
  @IsString()
  @IsNotEmpty()
  description!: string;

  @ApiProperty({ type: Number, description: 'Order of the stage', example: 0 })
  @IsNotEmpty()
  @IsNumber()
  stageOrder!: number;
}

/**
 * DTO used to accept a workshop invitation.
 */
export class AcceptWorkshopInvitationDtoV1 {
  @ValidateNested()
  @ApiProperty({
    type: () => AcceptWorkshopInvitationPayloadV1,
    description: 'Structured description of the proposal (deadline/budget)',
    example: {
      description: 'Can start next month',
      deadline: '2024-06-01T00:00:00.000Z',
      budget: '1500',
    },
  })
  @Type(() => AcceptWorkshopInvitationPayloadV1)
  invitationInfo!: AcceptWorkshopInvitationPayloadV1;

  @ApiProperty({
    type: String,
    format: 'uuid',
    description: 'ID of the workshop accepting the invitation',
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

  @ValidateNested({ each: true })
  @Type(() => StagesDataV1)
  @ApiProperty({
    type: [StagesDataV1],
    description: 'Optional list of stages for the order',
    required: false,
    example: [
      {
        stageName: 'Design',
        approximateLength: '2 weeks',
        needsConfirmation: true,
        description: 'Initial design work',
        stageOrder: 0,
      },
    ],
  })
  @Optional()
  stages!: StagesDataV1[];
}
