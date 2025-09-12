import {
  Body,
  Controller,
  Post,
  HttpCode,
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
import { validator } from 'adapter';
import { OrderCancelService } from 'apps/order-service/src/app/order-workflow/application/services/order/order-cancel.service';
import { OrderAuthGuardProxy } from 'apps/order-service/src/app/order-workflow/infra/auth/proxy/auth-token-proxy';
import { ActorName, ActorNames } from 'auth';
import { OrderCancelDtoV1 } from 'contracts';

@ApiTags('Order workflow')
@ApiBearerAuth('JWT')
@Controller({ path: 'order/cancel', version: '1' })
export class OrderCancelController {
  constructor(private readonly orderCancelService: OrderCancelService) { }

  @Post()
  @ActorNames(ActorName.Commissioner)
  @UseGuards(OrderAuthGuardProxy)
  @UsePipes(new ValidationPipe(validator))
  @HttpCode(200)
  @ApiOperation({
    summary: 'Cancel an order',
    description: 'Cancels an existing order based on the provided order ID.',
  })
  @ApiBody({ type: OrderCancelDtoV1 })
  @ApiCreatedResponse({ description: 'Order canceled successfully' })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiNotFoundResponse({ description: 'Order not found (NOT_FOUND)' })
  @ApiConflictResponse({
    description: 'Illegal state transition (ILLEGAL_TRANSITION)',
  })
  @ApiCreatedResponse({
    description: 'Order was cancelled',
  })
  async postOrderCancel(@Body() body: OrderCancelDtoV1) {
    return await this.orderCancelService.orderCancel({
      orderId: body.orderId,
      cancelledBy: body.cancelledBy,
      reason: body.reason,
    });
  }
}
