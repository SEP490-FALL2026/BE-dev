import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { RedisOptions } from 'ioredis';
import { REDIS_ENVIRONMENT_KEYS, validateRedisEnvironment } from '../redis/redis.config';
import { QueueProducers } from './queue-producers';
import { QueueWorkerFactory } from './queue-worker-factory';

/** Validates the queue connection when the module is mounted. */
export function createQueueConfiguration(config: ConfigService): { connection: RedisOptions } {
  const queue = validateRedisEnvironment(
    Object.fromEntries(['NODE_ENV', ...REDIS_ENVIRONMENT_KEYS].map((key) => [key, config.get(key)])),
  );

  return {
    connection: {
      host: queue.REDIS_HOST,
      port: queue.REDIS_PORT,
      username: queue.REDIS_USERNAME || undefined,
      password: queue.REDIS_PASSWORD || undefined,
      tls: queue.REDIS_TLS ? {} : undefined,
    },
  };
}

@Module({
  providers: [QueueProducers, QueueWorkerFactory],
  exports: [QueueProducers, QueueWorkerFactory],
})
export class QueueInfrastructureModule {
  constructor(config: ConfigService) {
    createQueueConfiguration(config);
  }
}
