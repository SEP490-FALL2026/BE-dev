import { ConfigService } from '@nestjs/config';
import { EnvironmentVariables } from '../../src/infrastructure/config/env-schema';

/**
 * A ConfigService for tests that build services by hand. Only the keys a test cares about need values. The client-side limits
 * (connect, transaction wait, query) are the loaded-runner ones of test/config/integration-setup.cjs, not the production ones:
 * a suite that proves a limit passes its own.
 */
export function testConfig(
  values: Partial<Record<keyof EnvironmentVariables, unknown>>,
): ConfigService<EnvironmentVariables, true> {
  const defaults = {
    DB_LOCK_TIMEOUT_MS: 3000,
    DB_STATEMENT_TIMEOUT_MS: 5000,
    DB_TRANSACTION_TIMEOUT_MS: 10000,
    DB_TRANSACTION_MAX_WAIT_MS: 15000,
    DB_CONNECT_TIMEOUT_MS: 15000,
    DB_QUERY_TIMEOUT_MS: 30000,
    DB_IDLE_IN_TRANSACTION_TIMEOUT_MS: 20000,
  };

  return new ConfigService({ ...defaults, ...values }) as unknown as ConfigService<EnvironmentVariables, true>;
}
