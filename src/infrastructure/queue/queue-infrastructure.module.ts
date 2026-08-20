import { BullModule, BullRootModuleOptions } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EnvironmentVariables } from '../config/env-schema';

function createQueueConfiguration(config: ConfigService<EnvironmentVariables, true>): BullRootModuleOptions {
  const username = config.getOrThrow<string>('REDIS_USERNAME');
  const password = config.getOrThrow<string>('REDIS_PASSWORD');

  return {
    connection: {
      host: config.getOrThrow<string>('REDIS_HOST'),
      port: config.getOrThrow<number>('REDIS_PORT'),
      username: username || undefined,
      password: password || undefined,
      tls: config.getOrThrow<boolean>('REDIS_TLS') ? {} : undefined,
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
