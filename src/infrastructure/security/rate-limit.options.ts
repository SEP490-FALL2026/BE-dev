import { ConfigService } from '@nestjs/config';
import type { ThrottlerModuleOptions } from '@nestjs/throttler';
import { EnvironmentVariables } from '../config/env-schema';

export function createRateLimitOptions(config: ConfigService<EnvironmentVariables, true>): ThrottlerModuleOptions {
  return [
    {
      ttl: config.get('RATE_LIMIT_TTL_MS', { infer: true }),
      limit: config.get('RATE_LIMIT_LIMIT', { infer: true }),
    },
  ];
}
