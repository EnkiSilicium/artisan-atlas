import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Logger, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';

import {
  ORDER_HISTORY_REFRESH_JOB,
  ORDER_HISTORY_REFRESH_QUEUE,
} from './order-history-refresh.token';
import { OrderStagesReadService } from '../../application/query-handlers/history.query-handler';

@Processor(ORDER_HISTORY_REFRESH_QUEUE)
export class OrderHistoryRefreshWorker
  extends WorkerHost
  implements OnModuleInit
{
  constructor(
    private readonly service: OrderStagesReadService,
    @InjectQueue(ORDER_HISTORY_REFRESH_QUEUE) private readonly queue: Queue,
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
    await this.queue.add(
      ORDER_HISTORY_REFRESH_JOB,
      {},
      {
        repeat: { every: 300_000 },
        removeOnComplete: true,
        removeOnFail: true,
      },
    );
  }

  async process(): Promise<void> {
    Logger.verbose({
      message: `Worker: read-projection refreshed!`,
    });
    await this.service.refresh();
  }
}
