import {
  Body,
  Controller,
  Post,
  UsePipes,
  ValidationPipe,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBody,
  ApiCreatedResponse,
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiConflictResponse,
} from '@nestjs/swagger';
import { StageCompletionService } from 'apps/order-service/src/app/order-workflow/application/services/stage/stage-completion.service';
import {
  MarkStageCompletionDtoV1,
  ConfirmStageCompletionDtoV1,
  StageCompletionMarkResultDto,
  StageCompletionConfirmResultDto,
  StageCompletionPaths,
} from 'contracts';
import { validator } from 'adapter';
import { OrderHttpJwtGuard } from 'apps/order-service/src/app/order-workflow/infra/auth/guards/order-http-jwt.guard';

@ApiTags('Order workflow')
@ApiBearerAuth('JWT')
@Controller({ path: StageCompletionPaths.Root, version: '1' })
export class StageCompletionController {
  constructor(
    private readonly stageCompletionService: StageCompletionService,
  ) {}

  @Post(StageCompletionPaths.Mark)
  @UseGuards(OrderHttpJwtGuard)
  @UsePipes(new ValidationPipe(validator))
  @ApiOperation({
    summary: 'Mark a stage as completed',
    description: 'Marks a specific stage as completed for an order.',
  })
  @ApiBody({ type: MarkStageCompletionDtoV1 })
  @ApiCreatedResponse({
    description: 'Stage marked for completion',
    type: StageCompletionMarkResultDto,
  })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiNotFoundResponse({ description: 'Order or stage not found (NOT_FOUND)' })
  @ApiConflictResponse({ description: 'Invariants violated (INVARIANTS_VIOLATED)' })
  async mark(
    @Body() body: MarkStageCompletionDtoV1,
  ) {
    return await this.stageCompletionService.acceptCompletionMarked({
      orderId: body.orderId,
      workshopId: body.workshopId,
      payload: {
        stageName: body.stageName,
      },
    });
  }

  @Post(StageCompletionPaths.Confirm)
  @UseGuards(OrderHttpJwtGuard)
  @UsePipes(new ValidationPipe(validator))
  @ApiOperation({
    summary: 'Confirm a completed stage',
    description: 'Confirms that a previously completed stage is accepted.',
  })
  @ApiBody({ type: ConfirmStageCompletionDtoV1 })
  @ApiCreatedResponse({
    description: 'Stage confirmed',
    type: StageCompletionConfirmResultDto,
  })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiNotFoundResponse({ description: 'Order or stage not found (NOT_FOUND)' })
  @ApiConflictResponse({ description: 'Invariants violated (INVARIANTS_VIOLATED)' })
  async confirm(
    @Body() body: ConfirmStageCompletionDtoV1,
  ) {
    return await this.stageCompletionService.confirmCompletion({
      orderId: body.orderId,
      workshopId: body.workshopId,
      payload: {
        stageName: body.stageName,
      },
    });
  }
}
