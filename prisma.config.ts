import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';
// The same rule the application validates with; this file is plain TypeScript with no Nest or Joi import.
import { LOCAL_DATABASE_URL, resolveDatabaseUrl } from './src/infrastructure/config/database-url';

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
