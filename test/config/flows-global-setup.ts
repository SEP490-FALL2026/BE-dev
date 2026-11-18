import { prepareMigratedTemplate } from '../support/migrated-template';
import { prepareSeededTemplate } from '../support/flows/flow-template';

/**
 * The flows runner: one `prisma migrate deploy` for the run (H7-RUN-01), then one database seeded with the demo dataset through
 * the real routes that every file copies. Without TEST_DATABASE_ADMIN_URL it stops here and touches no database.
 */
export default async function globalSetup(): Promise<void> {
  if (!process.env.TEST_DATABASE_ADMIN_URL) {
    throw new Error(
      'pnpm test:flows needs TEST_DATABASE_ADMIN_URL: a dedicated local PostgreSQL (see test/README.md, "Database para integration y E2E"). No database was created.',
    );
  }
  await prepareMigratedTemplate();
  await prepareSeededTemplate();
}
