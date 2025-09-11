import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Logger, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';

import {
  BONUS_READ_REFRESH_JOB,
  BONUS_READ_REFRESH_QUEUE,
} from './bonus-read-refresh.token';
import { BonusReadHandler } from '../../application/bonus-read/bonus-read.query-handler';

@Processor(BONUS_READ_REFRESH_QUEUE)
export class BonusReadRefreshWorker extends WorkerHost implements OnModuleInit {
  constructor(
    private readonly service: BonusReadHandler,
    @InjectQueue(BONUS_READ_REFRESH_QUEUE) private readonly queue: Queue,
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
    await this.queue.add(
      BONUS_READ_REFRESH_JOB,
      {},
      {
        repeat: { every: 300_000 },
        removeOnComplete: true,
        removeOnFail: true,
      },
    );
  }

  async process(): Promise<void> {
    await this.service.refresh();
    Logger.verbose({
      message: `Worker: read projection refreshed!`,
    });
  }
}
