import { BullModule, BullRootModuleOptions } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { queueEnvironmentFrom } from './queue.config';

/**
 * The queue's Redis connection, validated when the module is mounted (production requires REDIS_HOST and
 * REDIS_PASSWORD). Standby infrastructure with no consumer yet (the Owner keeps it for future use): no
 * process mounts it today, so the API, the worker and the commands neither need Redis nor validate it. The first module that
 * needs a queue mounts it and gets the strict validation back with it.
 */
export function createQueueConfiguration(config: ConfigService): BullRootModuleOptions {
  const queue = queueEnvironmentFrom(config);

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
