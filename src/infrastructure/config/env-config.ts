import type { ConfigModuleOptions } from '@nestjs/config';
import { validateEnvironment, validateInstallationEnvironment } from './env-schema';

export const environmentConfigOptions = {
  cache: true,
  isGlobal: true,
  validate: validateEnvironment,
} satisfies ConfigModuleOptions;

/** The installation command validates only the database settings and NODE_ENV (R-13). */
export const installationEnvironmentConfigOptions = {
  cache: true,
  isGlobal: true,
  validate: validateInstallationEnvironment,
} satisfies ConfigModuleOptions;
