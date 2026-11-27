import { BullModule, BullRootModuleOptions } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { REDIS_ENVIRONMENT_KEYS, validateRedisEnvironment } from '../redis/redis.config';

/** Validates the queue connection when the module is mounted. */
export function createQueueConfiguration(config: ConfigService): BullRootModuleOptions {
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
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1_000 },
      removeOnComplete: 100,
      removeOnFail: 500,
    },
  };
}

@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: createQueueConfiguration,
    }),
  ],
  exports: [BullModule],
})
export class QueueInfrastructureModule {}
