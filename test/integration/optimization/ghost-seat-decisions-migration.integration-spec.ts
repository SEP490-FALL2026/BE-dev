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

describe('ghost seat decisions, returns and routing columns (integration, PostgreSQL constraints)', () => {
  let database: DisposableDatabase;
  let sql: Client;
  let organizationId: string;
  let runId: string;

  /** A G4 recommendation in a state, with the routing columns the test gives. */
  const g4 = async (
    state: string,
    columns: { dueOn?: string | null; deciderDepartmentId?: string | null; returnCount?: number } = {},
  ): Promise<{ id: string; state: string | null }> => {
    const id = randomUUID();
    const code = await sqlState(
      sql,
      `INSERT INTO ghost_seat_recommendations (id, organization_id, "group", state, tier, application_id, plan_id, assignment_id,
         seat_chain_id, employee_id, evidence, created_run_id, decision_due_on, decider_department_id, return_count, confidence, activity_status)
       VALUES ($1, $2, 'G4', $3::"GhostSeatState", 'REVIEW', $4, $5, $6, $7, $8, '{"group":"G4"}'::jsonb, $9, $10::date, $11, $12, 'HIGH', 'INACTIVE')`,
      [
        id,
        organizationId,
        state,
        randomUUID(),
        randomUUID(),
        randomUUID(),
        randomUUID(),
        randomUUID(),
        runId,
        columns.dueOn === undefined ? null : columns.dueOn,
        columns.deciderDepartmentId === undefined ? null : columns.deciderDepartmentId,
        columns.returnCount ?? 0,
      ],
    );

    return { id, state: code };
  };

  const decision = (
    recommendationId: string,
    input: { choice: string; reason?: string; exemptUntil?: string | null; decidedOn?: string },
  ) =>
    sqlState(
      sql,
      `INSERT INTO ghost_seat_decisions (id, organization_id, recommendation_id, choice, reason, exempt_until, decided_on,
         decided_by_employee_id, decided_by_app_user_id, decider_department_id, decider_roles)
       VALUES ($1, $2, $3, $4::"GhostSeatChoice", $5, $6::date, $7::date, $8, $9, $10, ARRAY['MANAGER'])`,
      [
        randomUUID(),
        organizationId,
        recommendationId,
        input.choice,
        input.reason ?? 'seat không dùng',
        input.exemptUntil ?? null,
        input.decidedOn ?? '2026-11-09',
        randomUUID(),
        randomUUID(),
        randomUUID(),
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
      `INSERT INTO ghost_seat_rule_runs (id, organization_id, rule_set, period_key) VALUES ($1, $2, 'G3_G4', '2026-W46')`,
      [runId, organizationId],
    );
  }, 90000);

  afterAll(async () => {
    await sql?.end();
    if (database) await dropDisposableDatabase(database);
  });

  it('DB: a recommendation in the queue has a due day, and one awaiting or returned has a deciding department (23514)', async () => {
    const department = randomUUID();

    expect((await g4('AWAITING_DECISION', { dueOn: '2026-11-16', deciderDepartmentId: department })).state).toBeNull();
    expect((await g4('AWAITING_DECISION', { deciderDepartmentId: department })).state).toBe('23514');
    expect((await g4('AWAITING_DECISION', { dueOn: '2026-11-16' })).state).toBe('23514');
    expect((await g4('RETURNED_TO_HEAD', { dueOn: '2026-11-16' })).state).toBe('23514');
    expect((await g4('WAITING_FOR_HEAD', { dueOn: '2026-11-16' })).state).toBeNull();
    expect((await g4('WAITING_FOR_HEAD')).state).toBe('23514');
    expect((await g4('OPEN')).state).toBeNull();
  });

  it('DB OI-02: a recommendation is returned at most once: return_count 2 is refused (23514), a second return row is refused (23505)', async () => {
    expect((await g4('OPEN', { returnCount: 2 })).state).toBe('23514');
    const { id } = await g4('OPEN', { returnCount: 1 });
    const insertReturn = () =>
      sqlState(
        sql,
        `INSERT INTO ghost_seat_returns (recommendation_id, reason, returned_by_app_user_id) VALUES ($1, 'vẫn dùng', $2)`,
        [id, randomUUID()],
      );

    expect(await insertReturn()).toBeNull();
    expect(await insertReturn()).toBe('23505');
  });

  it('DB AC-4, INV-09: an exemption is at most 12 months and after the day it is decided; only EXEMPT has one (23514)', async () => {
    const { id } = await g4('OPEN');

    expect(await decision(id, { choice: 'EXEMPT', exemptUntil: '2027-11-09' })).toBeNull();
    expect(await decision(id, { choice: 'EXEMPT', exemptUntil: '2027-11-10' })).toBe('23514');
    expect(await decision(id, { choice: 'EXEMPT', exemptUntil: '2026-11-09' })).toBe('23514');
    expect(await decision(id, { choice: 'EXEMPT', exemptUntil: null })).toBe('23514');
    expect(await decision(id, { choice: 'KEEP', exemptUntil: '2027-01-01' })).toBe('23514');
    expect(await decision(id, { choice: 'KEEP' })).toBeNull();
  });

  it('DB US-10-06 AC-5, AC-13: the reason is 3 to 1000 characters (23514) and a decision cannot be changed or deleted (55000)', async () => {
    const { id } = await g4('OPEN');

    expect(await decision(id, { choice: 'KEEP', reason: 'ab' })).toBe('23514');
    expect(await decision(id, { choice: 'KEEP', reason: 'x'.repeat(1001) })).toBe('23514');
    expect(await decision(id, { choice: 'RECLAIM', reason: 'x'.repeat(1000) })).toBeNull();
    expect(
      await sqlState(sql, `UPDATE ghost_seat_decisions SET reason = 'khác' WHERE recommendation_id = $1`, [id]),
    ).toBe('55000');
    expect(await sqlState(sql, `DELETE FROM ghost_seat_decisions WHERE recommendation_id = $1`, [id])).toBe('55000');
  });

  it('DB: the pause columns come together, and a recommendation that is not paused may have none (23514)', async () => {
    const { id } = await g4('OPEN');

    expect(await sqlState(sql, `UPDATE ghost_seat_recommendations SET paused_at = now() WHERE id = $1`, [id])).toBe(
      '23514',
    );
    expect(
      await sqlState(
        sql,
        `UPDATE ghost_seat_recommendations SET state = 'PAUSED', paused_at = now(), pause_transfer_id = $2 WHERE id = $1`,
        [id, randomUUID()],
      ),
    ).toBeNull();
  });
});
