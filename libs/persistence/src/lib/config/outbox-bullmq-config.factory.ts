import { OUTBOX_QUEUE } from 'libs/persistence/src/lib/tokens/outbox.tokens';

export function outboxBullMqConfigFactory(override?: {
  attempts?: number;
  backoffCap?: number;
}) {
  return {
    name: OUTBOX_QUEUE,
    // jobs default behavior
    defaultJobOptions: {
      attempts: override?.attempts ?? 300, // total tries (initial + retries)
      backoff: { type: 'expoCap' }, // see workerOptions.settings below
      removeOnComplete: true,
      removeOnFail: false, // keep for inspection
    },
    workerOptions: {
      concurrency: 1,

      settings: {
        backoffStrategies: {
          expoCap: (attemptsMade: number) => {
            const base = 5_000; // 5s base
            const raw = base * Math.pow(2, Math.max(0, attemptsMade - 1));
            return Math.min(raw, override?.backoffCap ?? 30_000); // cap at 30 sec
          },
        },
      },
    },
  };
}
