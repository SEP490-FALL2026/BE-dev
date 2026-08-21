import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';
import { resolveDatabaseUrl } from './src/infrastructure/config/env-schema';

const localDatabaseUrl = 'postgresql://app:app@localhost:5432/software_license_management';

// The CLI runs outside Nest, so it cannot read ConfigService. It reuses the same
// resolution rule rather than carrying a second copy that could drift from it.
const databaseUrl =
  process.env.NODE_ENV === 'production'
    ? env('DATABASE_URL')
    : resolveDatabaseUrl(
        process.env.NODE_ENV === 'test' ? 'test' : 'development',
        process.env.DATABASE_URL ?? localDatabaseUrl,
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
