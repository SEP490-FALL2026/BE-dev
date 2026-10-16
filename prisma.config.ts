import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

function resolveDatabaseUrl(nodeEnv: string, databaseUrl: string, testDatabaseUrl: string): string {
  if (nodeEnv !== 'test') {
    return databaseUrl;
  }
  if (testDatabaseUrl) {
    return testDatabaseUrl;
  }
  const url = new URL(databaseUrl);
  url.pathname = `${url.pathname.replace(/\/$/, '')}_test`;
  return url.toString();
}

const localDatabaseUrl = 'postgresql://app:app@localhost:5432/software_license_management';

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
