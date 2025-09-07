import type { RedisOptions } from 'ioredis';

export function redisConfig(override?: Partial<RedisOptions>): RedisOptions {
  return {
    host: process.env.REDIS_HOST || 'localhost',
    port: Number(process.env.REDIS_PORT || 6379),
    ...(override ?? {}),
  };
}

