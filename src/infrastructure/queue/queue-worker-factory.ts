import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker, type Processor } from 'bullmq';
import type { EnvironmentVariables } from '../config/env-schema';
import { describeForOperator } from '../observability/operator-error';
import { createBlockingRedisClient, watchConnection } from '../redis/redis-client.factory';
import { redisSettingsFrom } from '../redis/redis.config';
import type { QueueName } from './queue-registry';

@Injectable()
export class QueueWorkerFactory {
  private readonly logger = new Logger(QueueWorkerFactory.name);

  constructor(private readonly config: ConfigService<EnvironmentVariables, true>) {}

  create(name: QueueName, processor: Processor, concurrency: number): Worker {
    const settings = redisSettingsFrom(this.config);
    const client = createBlockingRedisClient(settings, `worker:${name}`);
    watchConnection(client, this.logger, `worker:${name}`);
    const worker = new Worker(name, processor, {
      connection: client,
      prefix: `${settings.keyPrefix}:bull`,
      concurrency,
      autorun: false,
    });
    worker.on('error', (error) => this.logger.debug(describeForOperator(error)));
    worker.once('closed', () => client.disconnect());
    return worker;
  }
}
