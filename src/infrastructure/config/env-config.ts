import type { ConfigModuleOptions } from '@nestjs/config';
import { validateEnvironment, validateInstallationEnvironment } from './env-schema';

/**
 * H7-VRF-01: a test run is configured by its own process environment only. `ConfigModule` would otherwise read the
 * developer's ignored `.env` from the working directory and copy every key it lacks into `process.env`, where the next
 * suite and the test harness read it. Development and production keep the default (production images carry no `.env`).
 */
const ignoreEnvFile = process.env.NODE_ENV === 'test';

export const environmentConfigOptions = {
  cache: true,
  isGlobal: true,
  ignoreEnvFile,
  validate: validateEnvironment,
} satisfies ConfigModuleOptions;

/** The installation command validates only the database settings and NODE_ENV (R-13). */
export const installationEnvironmentConfigOptions = {
  cache: true,
  isGlobal: true,
  ignoreEnvFile,
  validate: validateInstallationEnvironment,
} satisfies ConfigModuleOptions;
