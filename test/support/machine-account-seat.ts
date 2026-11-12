import { randomUUID } from 'node:crypto';
import type { SeatHarness } from './seat-baseline-harness';

/** The note a flagged seat of these tests carries. */
export const MACHINE_NOTE = 'Release pipeline of the build farm';

export interface MachineSeatRow {
  id: string;
  predecessor_id: string | null;
  source: string;
  is_machine_account: boolean;
  machine_account_note: string | null;
  valid_from: string;
  valid_until: string | null;
}

/**
 * A seat of the IT Admin of the installation written by SQL, flagged as a machine account or not (`R-9`): what a test needs to put the
 * personal seat of an IT Admin and a bot of the same IT Admin on one subscription or one internal plan. No assertion lives here.
 */
export async function itAdminSeat(
  h: SeatHarness,
  target: { subscriptionId?: string; planId?: string },
  identifier: string,
  options: { flagged?: boolean; expectedEnd?: string; validFrom: string },
): Promise<string> {
  const { rows } = await h.ctx.sql.query<{ id: string }>(
    `INSERT INTO license_assignments (id, organization_id, kind, source, plan_id, subscription_id, employee_id, account_identifier,
       normalized_account_identifier, valid_from, valid_from_basis, expected_end_date, created_by_app_user_id, is_machine_account,
       machine_account_note)
     SELECT gen_random_uuid(), $1, 'PERSONAL', 'REQUEST', COALESCE(s.plan_id, $3::uuid), s.id, $4, $5, lower($5), $6::date,
            'RECORDED', $7::date, $8, $9::boolean, CASE WHEN $9::boolean THEN $10 END
       FROM (SELECT 1) one LEFT JOIN subscriptions s ON s.id = $2::uuid
     RETURNING id`,
    [
      h.seed.organizationId,
      target.subscriptionId ?? null,
      target.planId ?? null,
      h.it1.employeeId,
      identifier,
      options.validFrom,
      options.expectedEnd ?? null,
      randomUUID(),
      options.flagged ?? false,
      MACHINE_NOTE,
    ],
  );

  return rows[0].id;
}

const COLUMNS = `id, predecessor_id, source::text, is_machine_account, machine_account_note,
                 to_char(valid_from, 'YYYY-MM-DD') AS valid_from, to_char(valid_until, 'YYYY-MM-DD') AS valid_until`;

export async function machineSeatRow(h: SeatHarness, id: string): Promise<MachineSeatRow> {
  return (await h.ctx.sql.query<MachineSeatRow>(`SELECT ${COLUMNS} FROM license_assignments WHERE id = $1`, [id]))
    .rows[0];
}

/** The records that follow these seats, by the seat each continues. */
export async function machineSeatFollowers(h: SeatHarness, ids: readonly string[]): Promise<MachineSeatRow[]> {
  return (
    await h.ctx.sql.query<MachineSeatRow>(
      `SELECT ${COLUMNS} FROM license_assignments WHERE predecessor_id = ANY($1::uuid[]) ORDER BY predecessor_id, id`,
      [ids],
    )
  ).rows;
}
