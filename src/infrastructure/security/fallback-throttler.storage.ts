import type { LoggerService, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import type { ThrottlerStorage, ThrottlerStorageService } from '@nestjs/throttler';
import type Redis from 'ioredis';
import { describeForOperator } from '../observability/operator-error';
import { connectQuietly } from '../redis/redis-client.factory';

export const RATE_LIMIT_REDIS_TIMEOUT_MS = 150;
export const RATE_LIMIT_REDIS_RETRY_MS = 5_000;

type StorageRecord = Awaited<ReturnType<ThrottlerStorage['increment']>>;

export class FallbackThrottlerStorage implements ThrottlerStorage, OnApplicationBootstrap, OnApplicationShutdown {
  private fallbackUntil: number | null = null;
  private probing = false;

  constructor(
    private readonly primary: ThrottlerStorage,
    private readonly fallback: ThrottlerStorageService,
    private readonly client: Redis | null,
    private readonly logger: LoggerService,
    private readonly now: () => number = Date.now,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (this.client) await connectQuietly(this.client, this.logger, 'rate-limit');
  }

  async increment(...args: Parameters<ThrottlerStorage['increment']>): Promise<StorageRecord> {
    const retrying = this.fallbackUntil !== null;
    if (this.fallbackUntil !== null && (this.probing || this.now() < this.fallbackUntil)) {
      return this.fallback.increment(...args);
    }

    if (retrying) this.probing = true;
    try {
      const record = await this.primary.increment(...args);
      if (retrying) {
        this.fallbackUntil = null;
        this.logger.log('Rate limit store returned to Redis');
      }
      return record;
    } catch (error) {
      if (this.fallbackUntil === null) {
        this.logger.warn(`Rate limit store fell back to process memory: ${describeForOperator(error)}`);
      }
      if (this.fallbackUntil === null || retrying) this.fallbackUntil = this.now() + RATE_LIMIT_REDIS_RETRY_MS;
      return this.fallback.increment(...args);
    } finally {
      if (retrying) this.probing = false;
    }
  }

  async onApplicationShutdown(): Promise<void> {
    this.fallback.onApplicationShutdown();
    if (!this.client) return;
    try {
      await this.client.quit();
    } catch (error) {
      this.logger.warn(`Rate limit Redis connection could not quit: ${describeForOperator(error)}`);
    } finally {
      this.client.disconnect();
    }
  }
}
