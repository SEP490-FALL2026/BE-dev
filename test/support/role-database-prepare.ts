import type { INestApplicationContext } from '@nestjs/common';
import {
  provisionDatabaseRoles,
  reconcileDatabaseRoles,
} from '../../src/infrastructure/database/roles/database-role-provisioning';
import { readProvisionSettings } from '../../src/infrastructure/database/roles/database-role-settings';
import { TransactionRunner } from '../../src/infrastructure/database/transaction-runner';
import { migrateDisposableDatabase } from './disposable-database';
import {
  allowDeployToReadMarker,
  createRoleSeparatedDatabase,
  withClient,
  type RoleSeparatedDatabase,
} from './role-separated-database';

/** A database with the three roles of H7 provisioned, migrated by the deploy role and reconciled for the runtime role. */
export async function prepareRoleDatabase(): Promise<RoleSeparatedDatabase> {
  const database = await createRoleSeparatedDatabase();
  await withClient(database.bootstrapUrl, (client) =>
    provisionDatabaseRoles(client, readProvisionSettings(database.provisionEnvironment)),
  );
  await allowDeployToReadMarker(database);
  await migrateDisposableDatabase(database.deployHandle);
  await withClient(database.deploy.url, (client) => reconcileDatabaseRoles(client, database.runtime.role));

  return database;
}

/** The role the application session really ran as: the runtime role, whatever the test harness uses to look at the rows. */
export async function sessionRoleOf(app: INestApplicationContext): Promise<string> {
  const rows = await app
    .get(TransactionRunner, { strict: false })
    .run((tx) => tx.$queryRaw<{ who: string }[]>`SELECT current_user AS who`);

  return rows[0].who;
}
