import { config as loadEnvFile } from 'dotenv';
import { defineConfig, env } from 'prisma/config';
// The same rule the application validates with; this file is plain TypeScript with no Nest or Joi import.
import { LOCAL_DATABASE_URL, resolveDatabaseUrl } from './src/infrastructure/config/database-url';

// H7-VRF-01: the test harness migrates with NODE_ENV=test and passes every variable it means; a developer's `.env`
// never reaches it, as it never reaches ConfigModule in a test run (src/infrastructure/config/env-config.ts). Anywhere
// else this is `import 'dotenv/config'` as before, DOTENV_CONFIG_PATH included: a test that runs a production CLI points
// it at no file, so a missing DATABASE_URL fails instead of falling back to the developer's database.
if (process.env.NODE_ENV !== 'test') loadEnvFile({ path: process.env.DOTENV_CONFIG_PATH });

const databaseUrl =
  process.env.NODE_ENV === 'production'
    ? env('DATABASE_URL')
    : resolveDatabaseUrl(
        process.env.NODE_ENV === 'test' ? 'test' : 'development',
        process.env.DATABASE_URL ?? LOCAL_DATABASE_URL,
        process.env.TEST_DATABASE_URL ?? '',
      );

export default defineConfig({
  schema: 'prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: databaseUrl,
  },
});
