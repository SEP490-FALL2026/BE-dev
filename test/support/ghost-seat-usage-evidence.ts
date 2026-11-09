import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';

/** The evidence a seeded `G3`/`G4` carries (complete, so the codec reads it): a person never seen, or one inactive for 70 covered days. */
export function seedUsageEvidence(group: 'G3' | 'G4', employeeId: string, planId: string): Record<string, unknown> {
  return {
    group,
    employeeId,
    planId,
    sources: [],
    matchMethod: null,
    activityStatus: group === 'G3' ? 'NEVER_ACTIVE' : 'INACTIVE',
    lastActiveDate: null,
    inactiveDays: group === 'G3' ? null : 70,
    coverageDays: 90,
    thresholds: { values: { monitor: 30, review: 60, action: 90 }, origin: 'DEFAULT' },
    confidence: { level: 'HIGH', reasons: [] },
    labels: [],
    timeBound: null,
    potentialSaving: null,
    previousDecision: null,
  };
}

/** The confidence and the activity status a seeded recommendation of the group carries (the table wants both for a `G3`/`G4`, neither for the others). */
export function seedUsageColumns(group: string): [string | null, string | null] {
  if (group === 'G3') return ['HIGH', 'NEVER_ACTIVE'];

  return group === 'G4' ? ['HIGH', 'INACTIVE'] : [null, null];
}

/**
 * An undecided recommendation already on the seat of the person, as an earlier build or another rule left it: a `G4` of the tier, or an open
 * `G2`; hung on a run row of its own.
 */
export async function seedUsageRecommendation(
  sql: Client,
  organizationId: string,
  input: { employeeId: string; group: 'G2' | 'G4'; tier: 'MONITOR' | 'REVIEW' },
): Promise<string> {
  const [chain] = (
    await sql.query<{ id: string; plan_id: string }>(
      `SELECT id, plan_id FROM license_assignments WHERE employee_id = $1`,
      [input.employeeId],
    )
  ).rows;
  const { rows: runs } = await sql.query<{ id: string }>(
    `INSERT INTO ghost_seat_rule_runs (organization_id, rule_set, period_key, status, finished_at)
     VALUES ($1, 'G3_G4', 'seeded-review', 'COMPLETED', now())
     ON CONFLICT (organization_id, rule_set, period_key) DO UPDATE SET status = 'COMPLETED' RETURNING id`,
    [organizationId],
  );
  const g2 = input.group === 'G2';
  const evidence = g2
    ? {
        group: 'G2',
        employeeId: input.employeeId,
        leftOn: null,
        planId: chain.plan_id,
        provisioningType: 'K2',
        terminatingAccess: null,
      }
    : seedUsageEvidence('G4', input.employeeId, chain.plan_id);
  const id = randomUUID();
  await sql.query(
    `INSERT INTO ghost_seat_recommendations (id, organization_id, "group", state, tier, application_id, plan_id, subscription_id,
       assignment_id, seat_chain_id, employee_id, evidence, created_run_id, confidence, activity_status)
     SELECT $1, $2, $3::"GhostSeatGroup", 'OPEN', $4::"GhostSeatTier", p.application_id, a.plan_id, a.subscription_id, a.id, a.id,
            a.employee_id, $5::jsonb, $6, $7::"GhostSeatConfidence", $8::"GhostSeatActivityStatus"
       FROM license_assignments a JOIN plans p ON p.id = a.plan_id WHERE a.id = $9`,
    [
      id,
      organizationId,
      input.group,
      g2 ? 'ACTION' : input.tier,
      JSON.stringify(evidence),
      runs[0].id,
      g2 ? null : 'HIGH',
      g2 ? null : 'INACTIVE',
      chain.id,
    ],
  );

  return id;
}
