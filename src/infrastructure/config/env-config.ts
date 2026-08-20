import type { ConfigModuleOptions } from '@nestjs/config';
import { validateEnvironment } from './env-schema';

export const environmentConfigOptions = {
  cache: true,
  isGlobal: true,
  validate: validateEnvironment,
} satisfies ConfigModuleOptions;
