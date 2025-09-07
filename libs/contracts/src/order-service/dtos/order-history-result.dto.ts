import { ApiProperty } from '@nestjs/swagger';

/**
 * Flattened record describing a stage within an order.
 * Brittle, AI-generated read model; prefer consumer-driven contracts in production.
 */
export class OrderHistoryQueryResultFlatDto {
  // Order details
  @ApiProperty({
    type: String,
    format: 'uuid',
    description: 'Order ID',
  })
  orderId!: string;

  @ApiProperty({
    type: String,
    description: 'Current state of the order',
    example: 'PendingCompletion',
  })
  orderState!: string;

  @ApiProperty({
    type: String,
    format: 'uuid',
    description: 'Commissioner ID',
  })
  commissionerId!: string;

  @ApiProperty({
    type: Boolean,
    description: 'Whether the order has been terminated',
    example: false,
  })
  isTerminated!: boolean;

  @ApiProperty({
    type: String,
    format: 'date-time',
    description: 'Time the order was created',
    example: '2024-01-01T00:00:00.000Z',
  })
  orderCreatedAt!: string;

  @ApiProperty({
    type: String,
    format: 'date-time',
    description: 'Time the order was last updated',
    example: '2024-02-01T00:00:00.000Z',
  })
  orderLastUpdatedAt!: string;

  // Request details
  @ApiProperty({
    type: String,
    description: 'Request title',
    example: 'Custom table',
  })
  requestTitle!: string;

  @ApiProperty({
    type: String,
    description: 'Request description',
    example: 'Build a custom wooden table',
  })
  requestDescription!: string;

  @ApiProperty({
    type: String,
    description: 'Request deadline',
    example: '2024-06-01T00:00:00.000Z',
  })
  requestDeadline!: string;

  @ApiProperty({
    type: String,
    description: 'Request budget',
    example: '2000',
  })
  requestBudget!: string;

  @ApiProperty({
    type: String,
    format: 'date-time',
    description: 'Request created timestamp',
    example: '2023-12-01T00:00:00.000Z',
  })
  requestCreatedAt!: string;

  @ApiProperty({
    type: String,
    format: 'date-time',
    description: 'Request updated timestamp',
    example: '2023-12-15T00:00:00.000Z',
  })
  requestLastUpdatedAt!: string;

  // Invitation details (nullable)
  @ApiProperty({
    type: String,
    nullable: true,
    format: 'uuid',
    description: 'Workshop ID, or null if none',
  })
  workshopId!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Invitation status, or null if none',
    example: 'pending',
  })
  invitationStatus!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Invitation description, or null if none',
    example: 'Awaiting response',
  })
  invitationDescription!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Invitation deadline, or null if none',
    example: '2024-05-01T00:00:00.000Z',
  })
  invitationDeadline!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Invitation budget, or null if none',
    example: '2100',
  })
  invitationBudget!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Invitation created timestamp, or null',
    example: '2023-12-05T00:00:00.000Z',
  })
  invitationCreatedAt!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Invitation updated timestamp, or null',
    example: '2023-12-10T00:00:00.000Z',
  })
  invitationLastUpdatedAt!: string | null;

  // Stage details (nullable)
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Name of the stage, or null',
    example: 'Design',
  })
  stageName!: string | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Order index of the stage, or null',
    example: 0,
  })
  stageOrder!: number | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Status of the stage, or null',
    example: 'pending',
  })
  stageStatus!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Approximate length, or null',
    example: '2 weeks',
  })
  approximateLength!: string | null;

  @ApiProperty({
    type: Boolean,
    nullable: true,
    description: 'Whether the stage requires confirmation, or null',
    example: true,
  })
  needsConfirmation!: boolean | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Stage created timestamp, or null',
    example: '2023-12-20T00:00:00.000Z',
  })
  stageCreatedAt!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Stage updated timestamp, or null',
    example: '2024-01-05T00:00:00.000Z',
  })
  stageLastUpdatedAt!: string | null;
}

/**
 * Wrapper for paginated results.
 * Brittle, AI-generated read model; prefer consumer-driven contracts in production.
 */
export class OrderHistoryQueryResultDto {
  @ApiProperty({
    type: Number,
    description: 'Total count across all pages',
    example: 1,
  })
  total!: number;

  @ApiProperty({
    type: () => OrderHistoryQueryResultFlatDto,
    isArray: true,
    description: 'Returned items for this page',
    example: [
      {
        orderId: 'a1b2c3d4-e5f6-7a89-b0c1-d2e3f4a5b6c7',
        orderState: 'PendingCompletion',
        commissionerId: 'c2d3e4f5-6789-0123-4567-89abcdef0123',
        isTerminated: false,
        orderCreatedAt: '2024-01-01T00:00:00.000Z',
        orderLastUpdatedAt: '2024-02-01T00:00:00.000Z',
        requestTitle: 'Custom table',
        requestDescription: 'Build a custom wooden table',
        requestDeadline: '2024-06-01T00:00:00.000Z',
        requestBudget: '2000',
        requestCreatedAt: '2023-12-01T00:00:00.000Z',
        requestLastUpdatedAt: '2023-12-15T00:00:00.000Z',
        workshopId: 'b7c8d9e0-f1a2-3b45-c6d7-e8f9a0b1c2d3',
        invitationStatus: 'pending',
        invitationDescription: 'Awaiting response',
        invitationDeadline: '2024-05-01T00:00:00.000Z',
        invitationBudget: '2100',
        invitationCreatedAt: '2023-12-05T00:00:00.000Z',
        invitationLastUpdatedAt: '2023-12-10T00:00:00.000Z',
        stageName: 'Design',
        stageOrder: 0,
        stageStatus: 'pending',
        approximateLength: '2 weeks',
        needsConfirmation: true,
        stageCreatedAt: '2023-12-20T00:00:00.000Z',
        stageLastUpdatedAt: '2024-01-05T00:00:00.000Z',
      },
    ],
  })
  items!: OrderHistoryQueryResultFlatDto[];
}
