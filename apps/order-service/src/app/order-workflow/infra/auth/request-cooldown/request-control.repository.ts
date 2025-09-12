/** eslint-disable @typescript-eslint/require-await */
import { Inject, Injectable } from '@nestjs/common';
import { Redis as RedisClient } from 'ioredis';
import { REDIS } from 'persistence';

@Injectable()
export class RequestControlRepository {
  constructor(@Inject(REDIS) private readonly redis: RedisClient) {}

  async tryAcquire(key: string, ttlSeconds: number): Promise<boolean> {
    const res: 'OK' | null = await this.redis.set(
      key,
      '1',
      'EX',
      ttlSeconds,
      'NX',
    );
    return res === 'OK';
  }

  async ttlMs(key: string): Promise<number | null> {
    const ms = await this.redis.pttl(key);
    if (ms < 0) return null;
    return ms;
  }
}

@Injectable()
export class InMemoryRequestControlRepository {
  /** key -> expiresAt epoch ms */
  private readonly store = new Map<string, number>();
  /** key -> timer handle, to clear/reset on refresh */
  private readonly timers = new Map<string, NodeJS.Timeout>();

  constructor() {}

  async tryAcquire(key: string, ttlSeconds: number): Promise<boolean> {
    const now = Date.now();
    const currentExpire = this.store.get(key);

    if (currentExpire && currentExpire > now) {
      return false;
    }

    const ttlMs = Math.max(0, Math.floor(ttlSeconds * 1000));
    const expiresAt = now + ttlMs;

    this.store.set(key, expiresAt);

    const prev = this.timers.get(key);
    if (prev) clearTimeout(prev);

    const t = setTimeout(() => {
      this.store.delete(key);
      this.timers.delete(key);
    }, ttlMs);

    this.timers.set(key, t);

    return true;
  }

  async ttlMs(key: string): Promise<number | null> {
    const now = Date.now();
    const expiresAt = this.store.get(key);

    if (!expiresAt || expiresAt <= now) {
      const prev = this.timers.get(key);
      if (prev) {
        clearTimeout(prev);
        this.timers.delete(key);
      }
      this.store.delete(key);
      return null;
    }

    return expiresAt - now;
  }
}
