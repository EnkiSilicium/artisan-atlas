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
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { WorkshopInvitationResponseService } from 'apps/order-service/src/app/order-workflow/application/services/workshop/workshop-invitation-response.service';
import {
  AcceptWorkshopInvitationDtoV1,
  DeclineWorkshopInvitationDtoV1,
  WorkshopInvitationAcceptResultDto,
  WorkshopInvitationDeclineResultDto,
  WorkshopInvitationResponsePaths,
} from 'contracts';
import { validator } from 'adapter';
import { OrderHttpJwtGuard } from 'apps/order-service/src/app/order-workflow/infra/auth/guards/order-http-jwt.guard';

@ApiTags('Order workflow')
@ApiBearerAuth('JWT')
@Controller({ path: WorkshopInvitationResponsePaths.Root, version: '1' })
export class WorkshopInvitationResponseController {
  constructor(
    private readonly workshopInvitationResponseService: WorkshopInvitationResponseService,
  ) {}

  @Post(WorkshopInvitationResponsePaths.Accept)
  @UseGuards(OrderHttpJwtGuard)
  @UsePipes(new ValidationPipe(validator))
  @ApiOperation({
    summary: 'Accept a workshop invitation',
    description:
      'Accepts a workshop invitation for an order and returns the updated state.',
  })
  @ApiBody({ type: AcceptWorkshopInvitationDtoV1 })
  @ApiCreatedResponse({
    description: 'Invitation accepted',
    type: WorkshopInvitationAcceptResultDto,
  })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiNotFoundResponse({ description: 'Order or invitation not found (NOT_FOUND)' })
  @ApiConflictResponse({ description: 'Illegal state transition (ILLEGAL_TRANSITION)' })
  @ApiUnprocessableEntityResponse({ description: 'Validation failed (VALIDATION)' })
  async accept(
    @Body() body: AcceptWorkshopInvitationDtoV1,
  ) {
    
    const orderId = body.orderId
    const workshopId = body.workshopId
    const stages = body.stages?.map(stage => ({...stage, ...{orderId, workshopId}}))
    return await this.workshopInvitationResponseService.acceptWorkshopInvitation(
      {
        orderId: orderId,
        workshopId: workshopId,
        payload: {
          description: body.invitationInfo.description,
          deadline: body.invitationInfo.deadline,
          budget: body.invitationInfo.budget,
          stages: stages,
        },
      },
    );
  }

  @Post(WorkshopInvitationResponsePaths.Decline)
  @UseGuards(OrderHttpJwtGuard)
  @UsePipes(new ValidationPipe(validator))
  @ApiOperation({
    summary: 'Decline a workshop invitation',
    description:
      'Declines a workshop invitation for an order and returns the updated state.',
  })
  @ApiBody({ type: DeclineWorkshopInvitationDtoV1 })
  @ApiCreatedResponse({
    description: 'Invitation declined',
    type: WorkshopInvitationDeclineResultDto,
  })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiNotFoundResponse({ description: 'Order or invitation not found (NOT_FOUND)' })
  @ApiConflictResponse({ description: 'Illegal state transition (ILLEGAL_TRANSITION)' })
  async decline(
    @Body() body: DeclineWorkshopInvitationDtoV1,
  ) {
    return await this.workshopInvitationResponseService.declineWorkshopInvitation(
      {
        orderId: body.orderId,
        workshopId: body.workshopId,
      },
    );
  }
}
