import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import type { LoggerService } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { ThrottlerStorageService, type ThrottlerModuleOptions, type ThrottlerStorage } from '@nestjs/throttler';
import type { EnvironmentVariables } from '../config/env-schema';
import { createFailFastRedisClient } from '../redis/redis-client.factory';
import { redisSettingsFrom } from '../redis/redis.config';
import { FallbackThrottlerStorage, RATE_LIMIT_REDIS_TIMEOUT_MS } from './fallback-throttler.storage';

export function createRateLimitOptions(
  config: ConfigService<EnvironmentVariables, true>,
  storage: ThrottlerStorage,
): ThrottlerModuleOptions {
  return {
    throttlers: [
      {
        ttl: config.get('RATE_LIMIT_TTL_MS', { infer: true }),
        limit: config.get('RATE_LIMIT_LIMIT', { infer: true }),
      },
    ],
    storage,
  };
}

export function createRateLimitStorage(config: ConfigService<EnvironmentVariables, true>, logger: LoggerService) {
  const memory = new ThrottlerStorageService();
  if (config.get('RATE_LIMIT_STORE', { infer: true }) === 'memory') return memory;

  const settings = redisSettingsFrom(config);
  const client = createFailFastRedisClient(settings, 'rate-limit', {
    lazyConnect: true,
    commandTimeoutMs: RATE_LIMIT_REDIS_TIMEOUT_MS,
    keyPrefix: `${settings.keyPrefix}:rl:`,
  });
  return new FallbackThrottlerStorage(new ThrottlerStorageRedisService(client), memory, client, logger);
}
