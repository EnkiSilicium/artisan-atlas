import type { RedisOptions } from 'ioredis';

export function redisConfig(override?: Partial<RedisOptions>): RedisOptions {
  return {
    host: process.env.REDIS_HOST || 'localhost',
    port: Number(process.env.REDIS_PORT || 6379),
    ...(override ?? {}),

    enableOfflineQueue: false,
    retryStrategy: (t) => Math.min(1000 * 2 ** (t - 1), 30_000),
    lazyConnect: true,
    autoResendUnfulfilledCommands: true,
  };
}
