import { Injectable, Logger, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import type Redis from 'ioredis';
import type { EnvironmentVariables } from '../config/env-schema';
import { connectQuietly, createFailFastRedisClient, logRedisQueueError } from '../redis/redis-client.factory';
import { redisSettingsFrom } from '../redis/redis.config';
import { QUEUE_NAMES, type QueueName } from './queue-registry';

@Injectable()
export class QueueProducers implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(QueueProducers.name);
  private readonly queues = new Map<QueueName, Queue>();
  private client?: Redis;

  constructor(private readonly config: ConfigService<EnvironmentVariables, true>) {}

  get(name: QueueName): Queue {
    const existing = this.queues.get(name);
    if (existing) return existing;

    const settings = redisSettingsFrom(this.config);
    this.client ??= createFailFastRedisClient(settings, 'queue-producers', { commandTimeoutMs: 1_000 });
    // Keep the wrapper usable when the process starts before Redis is reachable.
    const queue = new Queue(name, {
      connection: this.client,
      prefix: `${settings.keyPrefix}:bull`,
      skipWaitingForReady: true,
      skipVersionCheck: true,
    });
    queue.on('error', (error) => logRedisQueueError(this.logger, error));
    this.queues.set(name, queue);
    return queue;
  }

  async onApplicationBootstrap(): Promise<void> {
    for (const name of QUEUE_NAMES) this.get(name);
    if (this.client) await connectQuietly(this.client, this.logger, 'queue-producers');
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await Promise.all([...this.queues.values()].map((queue) => queue.close()));
    } finally {
      this.client?.disconnect();
      this.queues.clear();
    }
  }
}
