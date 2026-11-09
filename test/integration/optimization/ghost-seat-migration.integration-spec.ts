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

describe('ghost seat recommendations (integration, PostgreSQL constraints)', () => {
  let database: DisposableDatabase;
  let sql: Client;
  let organizationId: string;
  let runId: string;

  const insert = (
    input: {
      group?: string;
      state?: string;
      tier?: string | null;
      subscriptionId?: string | null;
      assignmentId?: string | null;
      chainId?: string | null;
      employeeId?: string | null;
      closeReason?: string | null;
      closedAt?: string | null;
      supersededById?: string | null;
      evidence?: object;
    } = {},
  ) =>
    sqlState(
      sql,
      `INSERT INTO ghost_seat_recommendations (id, organization_id, "group", state, close_reason, tier, application_id, plan_id,
         subscription_id, assignment_id, seat_chain_id, employee_id, evidence, created_run_id, closed_at, superseded_by_id)
       VALUES ($1, $2, $3::"GhostSeatGroup", $4::"GhostSeatState", $5::"GhostSeatCloseReason", $6::"GhostSeatTier", $7, $8,
         $9, $10, $11, $12, $13::jsonb, $14, $15::timestamptz, $16)`,
      [
        randomUUID(),
        organizationId,
        input.group ?? 'G1',
        input.state ?? 'OPEN',
        input.closeReason ?? null,
        input.tier === undefined ? ((input.group ?? 'G1') === 'G1' ? null : 'ACTION') : input.tier,
        randomUUID(),
        randomUUID(),
        input.subscriptionId === undefined
          ? (input.group ?? 'G1') === 'G1'
            ? randomUUID()
            : null
          : input.subscriptionId,
        input.assignmentId === undefined ? ((input.group ?? 'G1') === 'G1' ? null : randomUUID()) : input.assignmentId,
        input.chainId === undefined ? ((input.group ?? 'G1') === 'G1' ? null : randomUUID()) : input.chainId,
        input.employeeId === undefined ? ((input.group ?? 'G1') === 'G1' ? null : randomUUID()) : input.employeeId,
        JSON.stringify(input.evidence ?? {}),
        runId,
        input.closedAt ?? null,
        input.supersededById ?? null,
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
      `INSERT INTO ghost_seat_rule_runs (id, organization_id, rule_set, period_key) VALUES ($1, $2, 'G1_G2', '2026-11-09')`,
      [runId, organizationId],
    );
  }, 90000);

  afterAll(async () => {
    await sql?.end();
    if (database) await dropDisposableDatabase(database);
  });

  it('DB gate 8: two open G1 for one subscription are refused (23505); a closed one does not count', async () => {
    const subscriptionId = randomUUID();

    expect(await insert({ subscriptionId })).toBeNull();
    expect(await insert({ subscriptionId })).toBe('23505');
    expect(
      await insert({
        subscriptionId,
        state: 'CLOSED',
        closeReason: 'FREE_SEATS_GONE',
        closedAt: '2026-11-09T00:00:00Z',
      }),
    ).toBeNull();
  });

  it('DB gate 8: one unclosed recommendation for each seat chain, whichever the group (23505)', async () => {
    const chainId = randomUUID();

    expect(await insert({ group: 'G2', chainId })).toBeNull();
    expect(await insert({ group: 'G2', chainId })).toBe('23505');
    expect(await insert({ group: 'G4', chainId, tier: 'MONITOR' })).toBe('23505');
  });

  it('refuses a G2 that is not ACTION or is paused, a G1 with a person or a tier, and a G3 with no seat (23514)', async () => {
    expect(await insert({ group: 'G2', tier: 'REVIEW' })).toBe('23514');
    expect(await insert({ group: 'G2', state: 'PAUSED' })).toBe('23514');
    expect(await insert({ group: 'G1', tier: 'REVIEW' })).toBe('23514');
    expect(await insert({ group: 'G1', assignmentId: randomUUID() })).toBe('23514');
    expect(await insert({ group: 'G3', tier: 'MONITOR', chainId: null })).toBe('23514');
  });

  it('refuses a closing without a reason or a time, a reason without closing, and SUPERSEDED with no successor (23514)', async () => {
    expect(await insert({ state: 'CLOSED' })).toBe('23514');
    expect(await insert({ state: 'CLOSED', closeReason: 'FREE_SEATS_GONE' })).toBe('23514');
    expect(await insert({ state: 'OPEN', closeReason: 'FREE_SEATS_GONE', closedAt: '2026-11-09T00:00:00Z' })).toBe(
      '23514',
    );
    expect(await insert({ state: 'CLOSED', closeReason: 'SUPERSEDED', closedAt: '2026-11-09T00:00:00Z' })).toBe(
      '23514',
    );
  });

  it('keeps the evidence as it was written (55000) but lets the state move', async () => {
    const id = randomUUID();
    await sql.query(
      `INSERT INTO ghost_seat_recommendations (id, organization_id, "group", state, application_id, plan_id, subscription_id,
         evidence, created_run_id) VALUES ($1, $2, 'G1', 'OPEN', $3, $4, $5, '{"a":1}'::jsonb, $6)`,
      [id, organizationId, randomUUID(), randomUUID(), randomUUID(), runId],
    );

    expect(
      await sqlState(sql, `UPDATE ghost_seat_recommendations SET evidence = '{"a":2}'::jsonb WHERE id = $1`, [id]),
    ).toBe('55000');
    expect(await sqlState(sql, `UPDATE ghost_seat_recommendations SET free_seats = 4 WHERE id = $1`, [id])).toBeNull();
    expect(await sqlState(sql, `UPDATE ghost_seat_recommendations SET free_seats = -1 WHERE id = $1`, [id])).toBe(
      '23514',
    );
  });

  it('keeps the reasons of a run append-only (55000) and one run for each organization, set and period (23505)', async () => {
    const skipId = randomUUID();
    await sql.query(
      `INSERT INTO ghost_seat_rule_skips (id, run_id, subject_type, subject_id, gate) VALUES ($1, $2, 'SUBSCRIPTION', $3, 'PER_SEAT')`,
      [skipId, runId, randomUUID()],
    );

    expect(
      await sqlState(sql, `UPDATE ghost_seat_rule_skips SET gate = 'INTERNAL_SOFTWARE' WHERE id = $1`, [skipId]),
    ).toBe('55000');
    expect(await sqlState(sql, `DELETE FROM ghost_seat_rule_skips WHERE id = $1`, [skipId])).toBe('55000');
    expect(
      await sqlState(
        sql,
        `INSERT INTO ghost_seat_rule_runs (organization_id, rule_set, period_key) VALUES ($1, 'G1_G2', '2026-11-09')`,
        [organizationId],
      ),
    ).toBe('23505');
  });
});
