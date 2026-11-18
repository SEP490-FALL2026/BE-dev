import type { Client } from 'pg';
import { migrationBefore, migrationEndingWith } from './migration-history';

/**
 * Where the compatibility release ends and the final one begins in the migration history
 * (`g0-g6-final-business-baseline-remediation`, spec L.10). The suites that play a deploy of the final release over a database the
 * compatibility release ran on deploy the history **through** the last migration of the compatibility release, put the rows and the
 * operator steps there (the owner assignment, the Cost Center link and its activation), and only then deploy the rest. Nothing here
 * asserts.
 */

/** The first migration of the final release: the owner department becomes required (migration (B), Task 1.2c). */
export const firstFinalMigration = (): string => migrationEndingWith('_subscription_owner_required');

/** The last migration of the compatibility release: the schema its image runs on. */
export const lastCompatibilityMigration = (): string => migrationBefore(firstFinalMigration());

/**
 * The operator's one step per organization on the compatibility release (`pnpm ops:cost-center-direction activate`), as the row
 * it writes. The migration of the final release that removes the old department column refuses an organization without it.
 */
export async function activateCostCenterLink(sql: Client, organizationId: string): Promise<void> {
  await sql.query(
    `INSERT INTO cost_center_direction_activations (id, organization_id, release_evidence, approver_ref, operator_ref, environment)
     VALUES (gen_random_uuid(), $1, 'deploy run 7, image sha256:abc', 'release-owner', 'ops', 'LOCAL_TEST')`,
    [organizationId],
  );
}
