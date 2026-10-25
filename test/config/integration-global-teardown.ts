import { dropMigratedTemplate } from '../support/migrated-template';

/** H7-RUN-01: removes the migrated template of the run by its exact name and marker. */
export default async function globalTeardown(): Promise<void> {
  await dropMigratedTemplate();
}
