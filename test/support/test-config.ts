import { ConfigService } from '@nestjs/config';
import { EnvironmentVariables } from '../../src/infrastructure/config/env-schema';

/** A ConfigService for tests that build services by hand. Only the keys a test cares about need values. */
export function testConfig(
  values: Partial<Record<keyof EnvironmentVariables, unknown>>,
): ConfigService<EnvironmentVariables, true> {
  const defaults = {
    DB_LOCK_TIMEOUT_MS: 3000,
    DB_STATEMENT_TIMEOUT_MS: 5000,
    DB_TRANSACTION_TIMEOUT_MS: 10000,
    DB_TRANSACTION_MAX_WAIT_MS: 2000,
    DB_CONNECT_TIMEOUT_MS: 3000,
    DB_QUERY_TIMEOUT_MS: 8000,
  };

  return new ConfigService({ ...defaults, ...values }) as unknown as ConfigService<EnvironmentVariables, true>;
}
