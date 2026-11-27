import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { REDIS_ENVIRONMENT_KEYS, validateRedisEnvironment } from '../redis/redis.config';
import { QueueProducers } from './queue-producers';
import { QueueWorkerFactory } from './queue-worker-factory';

/** Fails fast at mount when the queue's Redis environment is invalid. */
export function createQueueConfiguration(config: ConfigService): void {
  validateRedisEnvironment(
    Object.fromEntries(['NODE_ENV', ...REDIS_ENVIRONMENT_KEYS].map((key) => [key, config.get(key)])),
  );
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
