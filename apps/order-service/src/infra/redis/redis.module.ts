import { Module } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS } from 'persistence';
import { redisConfig } from '../config/redis.config';

@Module({
  providers: [
    {
      provide: REDIS,
      useFactory: () => new Redis(redisConfig()),
    },
  ],
  exports: [REDIS],
})
export class RedisModule {}
