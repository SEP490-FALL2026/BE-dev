import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import {
  DisposableDatabase,
  dropDisposableDatabase,
  migrateDisposableDatabase,
  provisionDisposableDatabase,
} from '../../support/disposable-database';

/** The SQLSTATE a rejected statement carries: the constraint, not the application, said no. */
async function sqlState(sql: Client, text: string, values: unknown[] = []): Promise<string | null> {
  try {
    await sql.query(text, values);

    return null;
  } catch (error) {
    return (error as { code?: string }).code ?? 'unknown';
  }
}

describe('G3/G4 columns, application thresholds and seat states (integration, PostgreSQL constraints)', () => {
  let database: DisposableDatabase;
  let sql: Client;
  let organizationId: string;
  let runId: string;

  const insert = (input: {
    id?: string;
    group: 'G3' | 'G4';
    tier: 'MONITOR' | 'REVIEW' | 'ACTION';
    state?: string;
    confidence?: string | null;
    activityStatus?: string | null;
    pausedAt?: boolean;
  }) =>
    sqlState(
      sql,
      `INSERT INTO ghost_seat_recommendations (id, organization_id, "group", state, tier, application_id, plan_id, assignment_id,
         seat_chain_id, employee_id, evidence, created_run_id, confidence, activity_status, paused_at, pause_transfer_id)
       VALUES ($1, $2, $3::"GhostSeatGroup", $4::"GhostSeatState", $5::"GhostSeatTier", $6, $7, $8, $9, $10, '{"a":1}'::jsonb, $11,
         $12::"GhostSeatConfidence", $13::"GhostSeatActivityStatus", $14::timestamptz, $15)`,
      [
        input.id ?? randomUUID(),
        organizationId,
        input.group,
        input.state ?? 'OPEN',
        input.tier,
        randomUUID(),
        randomUUID(),
        randomUUID(),
        randomUUID(),
        randomUUID(),
        runId,
        input.confidence === undefined ? 'HIGH' : input.confidence,
        input.activityStatus === undefined
          ? input.group === 'G3'
            ? 'NEVER_ACTIVE'
            : 'INACTIVE'
          : input.activityStatus,
        input.pausedAt ? new Date().toISOString() : null,
        input.pausedAt ? randomUUID() : null,
      ],
    );

  beforeAll(async () => {
    database = await provisionDisposableDatabase();
    await migrateDisposableDatabase(database);
    sql = new Client({ connectionString: database.url });
    await sql.connect();
    organizationId = randomUUID();
    await sql.query(
      `INSERT INTO organizations (id, name, time_zone, reporting_currency) VALUES ($1, 'Acme', 'UTC', 'VND')`,
      [organizationId],
    );
    runId = randomUUID();
    await sql.query(
      `INSERT INTO ghost_seat_rule_runs (id, organization_id, rule_set, period_key) VALUES ($1, $2, 'G3_G4', '2026-W45')`,
      [runId, organizationId],
    );
  }, 90000);

  afterAll(async () => {
    await sql?.end();
    if (database) await dropDisposableDatabase(database);
  });

  it('DB: a G4 or a G3 with no confidence or no activity status is refused (23514); a G3 must be never-active and of the action tier', async () => {
    expect(await insert({ group: 'G4', tier: 'REVIEW' })).toBeNull();
    expect(await insert({ group: 'G4', tier: 'REVIEW', confidence: null })).toBe('23514');
    expect(await insert({ group: 'G4', tier: 'REVIEW', activityStatus: null })).toBe('23514');
    expect(await insert({ group: 'G3', tier: 'ACTION' })).toBeNull();
    expect(await insert({ group: 'G3', tier: 'REVIEW' })).toBe('23514');
    expect(await insert({ group: 'G3', tier: 'ACTION', activityStatus: 'INACTIVE' })).toBe('23514');
  });

  it('DB: the evidence of a review cannot be rewritten (55000); the evidence of an open watch can, so a rising tier is read again', async () => {
    const review = randomUUID();
    const watch = randomUUID();
    await insert({ id: review, group: 'G4', tier: 'REVIEW' });
    await insert({ id: watch, group: 'G4', tier: 'MONITOR' });

    expect(
      await sqlState(sql, `UPDATE ghost_seat_recommendations SET evidence = '{"a":2}'::jsonb WHERE id = $1`, [review]),
    ).toBe('55000');
    expect(
      await sqlState(
        sql,
        `UPDATE ghost_seat_recommendations SET evidence = '{"a":2}'::jsonb, tier = 'REVIEW' WHERE id = $1`,
        [watch],
      ),
    ).toBeNull();
    // Now a review: its evidence is final.
    expect(
      await sqlState(sql, `UPDATE ghost_seat_recommendations SET evidence = '{"a":3}'::jsonb WHERE id = $1`, [watch]),
    ).toBe('55000');
  });

  it('DB: a paused recommendation names when it was paused (23514)', async () => {
    expect(await insert({ group: 'G4', tier: 'REVIEW', state: 'PAUSED' })).toBe('23514');
    expect(await insert({ group: 'G4', tier: 'REVIEW', state: 'PAUSED', pausedAt: true })).toBeNull();
  });

  it('DB FR-4.13: the thresholds of an application rise and stay within a year (23514)', async () => {
    const insertThreshold = (monitor: number, review: number, action: number) =>
      sqlState(
        sql,
        `INSERT INTO ghost_seat_application_thresholds (organization_id, application_id, monitor_days, review_days, action_days, updated_by_app_user_id)
         VALUES ($1, gen_random_uuid(), $2, $3, $4, gen_random_uuid())`,
        [organizationId, monitor, review, action],
      );

    expect(await insertThreshold(30, 60, 90)).toBeNull();
    expect(await insertThreshold(60, 30, 90)).toBe('23514');
    expect(await insertThreshold(30, 30, 90)).toBe('23514');
    expect(await insertThreshold(30, 60, 366)).toBe('23514');
    expect(await insertThreshold(0, 60, 90)).toBe('23514');
  });

  it('DB: the gates added by the values migration are usable', async () => {
    const gate = (name: string) =>
      sqlState(
        sql,
        `INSERT INTO ghost_seat_rule_skips (run_id, subject_type, subject_id, gate) VALUES ($1, 'ASSIGNMENT', gen_random_uuid(), $2::"GhostSeatGate")`,
        [runId, name],
      );

    for (const name of ['SERVICE_ACCOUNT', 'COVERAGE', 'STALE_SOURCE', 'UNMATCHED_IDENTITY', 'INSUFFICIENT_EVIDENCE']) {
      expect(await gate(name)).toBeNull();
    }
  });
});
