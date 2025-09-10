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
  ApiUnprocessableEntityResponse,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import { OrderInitService } from 'apps/order-service/src/app/order-workflow/application/services/order/order-init.service';
import { OrderInitResultDto } from 'contracts';
import { OrderInitDtoV1, OrderInitPaths } from 'contracts';
import { validator } from 'adapter';
import { OrderAuthGuardProxy } from 'apps/order-service/src/app/order-workflow/infra/auth/proxy/auth-token-proxy';
import { ActorName, ActorNames } from 'auth';
import { RequestCooldownGuard } from '../../../infra/auth/guards/request-cooldown.guard';

@ApiTags('Order workflow')
@ApiBearerAuth('JWT')
@Controller({ path: OrderInitPaths.Root, version: '1' })
export class OrderInitController {
  constructor(private readonly orderInitService: OrderInitService) {}

  @Post()
  @ActorNames(ActorName.Commissioner)
  @UseGuards(OrderAuthGuardProxy, RequestCooldownGuard)
  @UsePipes(new ValidationPipe(validator))
  @ApiOperation({
    summary: 'Create a new order',
    description:
      'Creates a new order with an initial request and selected workshops.',
  })
  @ApiBody({ type: OrderInitDtoV1 })
  @ApiCreatedResponse({
    description: 'Order created successfully',
    type: OrderInitResultDto,
  })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiNotFoundResponse({ description: 'Workshop not found (NOT_FOUND)' })
  @ApiUnprocessableEntityResponse({
    description: 'Domain validation failed (VALIDATION)',
  })
  @ApiTooManyRequestsResponse({ description: 'Too many requests' })
  async postOrderInit(@Body() body: OrderInitDtoV1) {
    return await this.orderInitService.orderInit({
      payload: {
        commissionerId: body.commissionerId,
        selectedWorkshops: body.selectedWorkshops,
        request: body.request,
      },
    });
  }
}
