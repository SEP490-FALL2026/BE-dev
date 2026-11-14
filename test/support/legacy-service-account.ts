import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';

export interface LegacyServiceAccountInput {
  subscriptionId: string;
  /** The person who answered for the account. */
  employeeId: string;
  identifier: string;
  reason?: string;
  validFrom?: string;
  validUntil?: string | null;
}

/**
 * A service account as an earlier release wrote it (`kind = 'SERVICE'`, a reason, the Unit of the department that owns its subscription,
 * that department): nothing writes one any more (`QĐ-110m`: the seat baseline import refuses it, the routes are gone), so a test that
 * needs one for what stays readable (a list, a count of the seats a person holds, the retirement of a department that owns one) writes
 * it by SQL. Returns the id of the assignment. No assertion lives here.
 */
export async function legacyServiceAccount(sql: Client, input: LegacyServiceAccountInput): Promise<string> {
  const { rows } = await sql.query<{ id: string }>(
    `INSERT INTO license_assignments (id, organization_id, kind, source, plan_id, subscription_id, employee_id, account_identifier,
       normalized_account_identifier, reason, cost_center_id, owning_department_id, valid_from, valid_from_basis, valid_until,
       created_by_app_user_id)
     SELECT gen_random_uuid(), s.organization_id, 'SERVICE', 'REQUEST', s.plan_id, s.id, $2, $3, lower($3), $4,
            c.id, s.owner_department_id, $5, 'RECORDED', $6, $7
       FROM subscriptions s JOIN cost_centers c ON c.department_id = s.owner_department_id AND c.status = 'ACTIVE'
      WHERE s.id = $1
     RETURNING id`,
    [
      input.subscriptionId,
      input.employeeId,
      input.identifier,
      input.reason ?? 'CI pipeline',
      input.validFrom ?? '2026-01-05',
      input.validUntil ?? null,
      randomUUID(),
    ],
  );

  return rows[0].id;
}
