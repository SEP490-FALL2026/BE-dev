import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

const localDatabaseUrl =
  'postgresql://app:app@localhost:5432/software_license_management';
const databaseUrl =
  process.env.NODE_ENV === 'production'
    ? env('DATABASE_URL')
    : (process.env.DATABASE_URL ?? localDatabaseUrl);

export default defineConfig({
  schema: 'prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: databaseUrl,
  },
});
