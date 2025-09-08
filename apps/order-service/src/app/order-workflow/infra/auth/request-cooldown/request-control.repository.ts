import { Inject, Injectable } from '@nestjs/common';
import { Redis as RedisClient } from 'ioredis';
import { REDIS } from 'persistence';

@Injectable()
export class RequestControlRepository {
  constructor(@Inject(REDIS) private readonly redis: RedisClient) {}

  async tryAcquire(key: string, ttlSeconds: number): Promise<boolean> {
    const res = await this.redis.set(key, '1', 'NX', 'EX', ttlSeconds);
    return res === 'OK';
  }

  async ttlMs(key: string): Promise<number | null> {
    const ms = await this.redis.pttl(key);
    if (ms < 0) return null;
    return ms;
  }
}

