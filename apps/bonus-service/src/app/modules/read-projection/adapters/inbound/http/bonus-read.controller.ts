import {
  Controller,
  Get,
  Post,
  HttpCode,
  Query,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiAcceptedResponse,
} from '@nestjs/swagger';
import { validator } from 'adapter';
import { BonusReadHandler } from 'apps/bonus-service/src/app/modules/read-projection/application/bonus-read/bonus-read.query-handler';
import {
  BonusReadresultDto,
  BonusReadQueryDto,
  BonusReadPaths,
} from 'contracts';

@ApiTags('Bonus read')
@Controller(BonusReadPaths.Root)
export class BonusReadController {
  constructor(private readonly svc: BonusReadHandler) {}

  @Get()
  @ApiOperation({
    summary: 'List VIP/additive bonus records',
    description: 'Returns a paginated list of bonus records with filters.',
  })
  @ApiOkResponse({ type: BonusReadresultDto })
  @UsePipes(new ValidationPipe(validator))
  async read(@Query() q: BonusReadQueryDto) {
    return this.svc.read({
      commissionerId: q.commissionerId,
      isVIP: q.isVIP,
      grade: q.grade,
      minTotalPoints: q.minTotalPoints,
      maxTotalPoints: q.maxTotalPoints,
      vipPolicyVersion: q.vipPolicyVersion,
      bonusPolicyVersion: q.bonusPolicyVersion,
      gradePolicyVersion: q.gradePolicyVersion,
      createdFrom: q.createdFrom,
      createdTo: q.createdTo,
      limit: q.limit,
      offset: q.offset,
      sort: q.sort,
      sortDir: q.sortDir,
    });
  }

  @Post(BonusReadPaths.Refresh)
  @HttpCode(202)
  @UsePipes(new ValidationPipe(validator))
  @ApiOperation({
    summary: 'Refresh the bonus read projection',
    description: 'Initiates an asynchronous refresh of the bonus read model.',
  })
  @ApiAcceptedResponse({
    description: 'Refresh has been initiated',
  })
  async refresh(): Promise<{ ok: boolean }> {
    return this.svc.refresh();
  }
}
