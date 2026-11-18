import { prepareMigratedTemplate } from '../support/migrated-template';

/** H7-RUN-01: one `prisma migrate deploy` for the whole integration run; each suite copies the migrated template. */
export default async function globalSetup(): Promise<void> {
  await prepareMigratedTemplate();
}
