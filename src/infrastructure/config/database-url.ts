/**
 * The database a process should use. Plain TypeScript with no import, so the Prisma CLI config (`prisma.config.ts`)
 * shares exactly this rule with the application without loading Nest, Joi or the full environment schema.
 */

/** The local Compose database (compose.yaml); used only outside production when DATABASE_URL is not set. */
export const LOCAL_DATABASE_URL = 'postgresql://app:app@localhost:5432/software_license_management';

/**
 * NODE_ENV=test uses a separate database URL by default; TEST_DATABASE_URL overrides it.
 * This naming rule is not an ownership check. Destructive tests use the disposable harness.
 */
export function resolveDatabaseUrl(nodeEnv: string, databaseUrl: string, testDatabaseUrl: string): string {
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
