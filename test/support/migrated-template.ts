import {
  adminUrl,
  dropDisposableDatabase,
  migrateDisposableDatabase,
  migratedTemplate,
  provisionDisposableDatabase,
  useMigratedTemplate,
} from './disposable-database';

/*
 * H7-RUN-01: the migrated template of an integration run, prepared by test/config/integration-global-setup.ts and removed
 * by the teardown. disposable-database.ts copies it for every suite whose database is still exactly as provisioned.
 * Nothing here asserts.
 */

/**
 * globalSetup of the integration runner: one `prisma migrate deploy` for the whole run, into a disposable template every
 * suite then copies. Without TEST_DATABASE_ADMIN_URL it prepares nothing and each suite refuses with the harness message.
 */
export async function prepareMigratedTemplate(): Promise<void> {
  if (!process.env.TEST_DATABASE_ADMIN_URL) return;
  const template = await provisionDisposableDatabase();
  try {
    // A copy of the handle, not the provisioned one: the template itself is deployed by the Prisma CLI.
    await migrateDisposableDatabase({ ...template });
  } catch (error) {
    await dropDisposableDatabase(template).catch(() => undefined);
    throw error;
  }
  useMigratedTemplate({ name: template.name, runId: template.runId });
}

/** globalTeardown: drops the template by its exact name and marker. */
export async function dropMigratedTemplate(): Promise<void> {
  const template = migratedTemplate();
  const source = process.env.TEST_DATABASE_ADMIN_URL;
  if (!template || !source) return;
  const url = new URL(adminUrl(source));
  url.pathname = '/' + template.name;
  await dropDisposableDatabase({ url: url.toString(), name: template.name, runId: template.runId });
  useMigratedTemplate(null);
}
