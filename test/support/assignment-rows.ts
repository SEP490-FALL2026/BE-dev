import { randomUUID } from 'node:crypto';
import type { SeatHarness } from './seat-baseline-harness';

/**
 * An assignment the baseline import cannot make, written by SQL for a new person: it begins on `validFrom` and ends on `validUntil` (open when
 * null). Returns its id. No assertion lives here.
 */
export async function insertAssignment(
  h: SeatHarness,
  subscriptionId: string,
  planId: string,
  validFrom: string,
  validUntil: string | null = null,
): Promise<string> {
  const id = randomUUID();
  await h.ctx.sql.query(
    `INSERT INTO license_assignments (id, organization_id, kind, source, plan_id, subscription_id, employee_id,
       account_identifier, normalized_account_identifier, valid_from, valid_until, valid_from_basis, created_by_app_user_id)
     VALUES ($1, $2, 'PERSONAL', 'REQUEST', $3, $4, $5, $6, $6, $7, $8, 'ACTUAL', $9)`,
    [
      id,
      h.seed.organizationId,
      planId,
      subscriptionId,
      await h.person(`E-ROW-${id.slice(0, 8)}`),
      `${id.slice(0, 8)}@acme.vn`,
      validFrom,
      validUntil,
      randomUUID(),
    ],
  );

  return id;
}
