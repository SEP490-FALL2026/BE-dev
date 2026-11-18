import { dropMigratedTemplate } from '../support/migrated-template';
import { dropSeededTemplate } from '../support/flows/flow-template';

/** Removes the seeded template and the migrated one of the run by their exact names and markers. */
export default async function globalTeardown(): Promise<void> {
  await dropSeededTemplate();
  await dropMigratedTemplate();
}
