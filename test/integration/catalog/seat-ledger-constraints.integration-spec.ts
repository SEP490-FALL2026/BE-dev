import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { DEPLOY_TIMEOUT_MS, deployMigrations } from '../../support/migration-history';
import {
  dropDisposableDatabase,
  provisionDisposableDatabase,
  type DisposableDatabase,
} from '../../support/disposable-database';
import { dayFromToday, lineWorld } from '../../support/w3-lines-world';

/**
 * Redesign wave 3, W3-15 (M5): the ledger of the seats of a line as the database holds it — rows only added, each door says what a row may be,
 * a line with no ledger takes none, the seats never fall below the seats taken, and a seat is granted against the ledger once it has opened.
 */
describe('the ledger of the seats of a line (integration, real PostgreSQL)', () => {
  let database: DisposableDatabase;
  let sql: Client;

  beforeAll(async () => {
    database = await provisionDisposableDatabase();
    const deployed = await deployMigrations(database);
    if (deployed.code !== 0) throw new Error(`Deploying history failed: ${deployed.stdout}`);
    sql = new Client({ connectionString: database.url });
    await sql.connect();
  }, DEPLOY_TIMEOUT_MS);

  afterAll(async () => {
    await sql.end();
    await dropDisposableDatabase(database);
  });

  /** An organization with one period of seats, its line opened ten days ago with two seats. */
  async function openLine() {
    const w = await lineWorld(sql);
    const { vendorId, workspaceId } = await w.vendor('Anthropic');
    const plan = await w.plan(vendorId, 'Claude Team');
    const period = await w.period(plan, workspaceId, { quantity: 5 });
    const opened = dayFromToday(-10);
    const line = await w.line(period, workspaceId, plan, { ledgerOpenedOn: opened });
    await w.adjust(line, opened, 2);

    return { w, plan, period, line, opened, workspaceId };
  }

  const insertRow = (
    w: Awaited<ReturnType<typeof lineWorld>>,
    lineId: string,
    row: Partial<{
      effectiveOn: string;
      delta: number;
      reason: string;
      source: string;
      basis: string;
      note: string | null;
      memberOnly: boolean;
    }> = {},
  ) =>
    sql.query(
      `INSERT INTO seat_changes (id, organization_id, subscription_line_id, effective_on, delta, reason, source, basis, note)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        randomUUID(),
        w.organizationId,
        lineId,
        row.effectiveOn ?? dayFromToday(0),
        row.delta ?? 1,
        row.reason ?? 'TOP_UP',
        row.source ?? 'VENDOR_RECORD',
        row.basis ?? 'NONE',
        row.note === undefined ? 'as the vendor says' : row.note,
      ],
    );

  it('only adds: a row is never changed or deleted, even by the owner of the table', async () => {
    const { line } = await openLine();

    await expect(
      sql.query(`UPDATE seat_changes SET delta = 3 WHERE subscription_line_id = $1`, [line]),
    ).rejects.toMatchObject({
      code: '23001',
      constraint: 'seat_changes_append_only',
    });
    await expect(sql.query(`DELETE FROM seat_changes WHERE subscription_line_id = $1`, [line])).rejects.toMatchObject({
      code: '23001',
      constraint: 'seat_changes_append_only',
    });
  });

  it('says what each door may write', async () => {
    const { w, line } = await openLine();

    await expect(insertRow(w, line, { delta: 0 })).rejects.toMatchObject({
      code: '23514',
      constraint: 'seat_changes_delta_check',
    });
    await expect(insertRow(w, line, { delta: -1, reason: 'TOP_UP' })).rejects.toMatchObject({
      code: '23514',
      constraint: 'seat_changes_reason_sign_check',
    });
    await expect(insertRow(w, line, { note: null })).rejects.toMatchObject({
      code: '23514',
      constraint: 'seat_changes_note_check',
    });
    await expect(insertRow(w, line, { source: 'MEMBER', delta: 2, note: null })).rejects.toMatchObject({
      code: '23514',
      constraint: 'seat_changes_member_check',
    });
    await expect(insertRow(w, line, { source: 'GRANT', note: null })).rejects.toMatchObject({
      code: '23514',
      constraint: 'seat_changes_grant_check',
    });
    await expect(insertRow(w, line, { source: 'ADJUSTMENT', reason: 'TOP_UP', note: null })).rejects.toMatchObject({
      code: '23514',
      constraint: 'seat_changes_adjustment_check',
    });
    await expect(insertRow(w, line, { basis: 'REQUEST_ITEM' })).rejects.toMatchObject({
      code: '23514',
      constraint: 'seat_changes_basis_request_check',
    });
  });

  it('takes no row for a line with no ledger, and none outside the days the line serves', async () => {
    const { w, plan, line, opened, workspaceId } = await openLine();
    const draftPeriod = await w.period(plan, workspaceId, { status: 'DRAFT' });
    const noLedger = await w.line(draftPeriod, workspaceId, plan, {
      closedOn: dayFromToday(100),
      closedReason: 'REMOVED',
    });

    await expect(insertRow(w, noLedger)).rejects.toMatchObject({
      code: '23514',
      constraint: 'seat_changes_line_has_ledger',
    });
    await expect(insertRow(w, line, { effectiveOn: dayFromToday(-11) })).rejects.toMatchObject({
      code: '23514',
      constraint: 'seat_changes_effective_on_in_service',
    });
    expect(opened).toBe(dayFromToday(-10));
    await sql.query(`UPDATE subscription_lines SET closed_on = $2, closed_reason = 'ENDED' WHERE id = $1`, [
      line,
      dayFromToday(5),
    ]);
    await expect(insertRow(w, line, { effectiveOn: dayFromToday(6) })).rejects.toMatchObject({
      code: '23514',
      constraint: 'seat_changes_effective_on_in_service',
    });
  });

  it('never lets the seats fall below the seats taken, but lets them fall below the seats once the seats that held them have ended', async () => {
    const { w, plan, period, line } = await openLine();
    const first = await w.person('P1');
    const second = await w.person('P2');
    await w.seat(period, plan, first, dayFromToday(-5));
    await w.seat(period, plan, second, dayFromToday(-5), dayFromToday(-2));

    // Today one seat is held: the ledger may fall to one, not to zero.
    await expect(insertRow(w, line, { delta: -1, reason: 'REDUCE' })).resolves.toBeDefined();
    await expect(insertRow(w, line, { delta: -1, reason: 'REDUCE' })).rejects.toMatchObject({
      code: '23514',
      constraint: 'seat_changes_below_occupancy',
    });
    // Nor below zero where nobody holds a seat.
    await expect(
      insertRow(w, line, { effectiveOn: dayFromToday(-9), delta: -3, reason: 'REDUCE' }),
    ).rejects.toMatchObject({
      code: '23514',
      constraint: 'seat_changes_below_occupancy',
    });
  });

  it('grants a seat against the ledger once it has opened, and against the quantity of the period before', async () => {
    const { w, plan, period } = await openLine();
    const people = [await w.person('A1'), await w.person('A2'), await w.person('A3')];
    await w.seat(period, plan, people[0], dayFromToday(-5));
    await w.seat(period, plan, people[1], dayFromToday(-5));

    // The period bought five, the ledger holds two: the third seat is refused.
    await expect(w.seat(period, plan, people[2], dayFromToday(-5))).rejects.toMatchObject({
      code: '23514',
      constraint: 'license_assignments_seat_capacity',
    });
    // Before the ledger opened the quantity of the period counts: five.
    await expect(w.seat(period, plan, people[2], dayFromToday(-20), dayFromToday(-15))).resolves.toBeUndefined();
  });

  it('lets a top-up give the seat the ledger refused, and counts a period with no line as before (its quantity)', async () => {
    const { w, plan, period, line } = await openLine();
    const people = [await w.person('B1'), await w.person('B2'), await w.person('B3')];
    await w.seat(period, plan, people[0], dayFromToday(-5));
    await w.seat(period, plan, people[1], dayFromToday(-5));
    await insertRow(w, line, { delta: 1, reason: 'TOP_UP', effectiveOn: dayFromToday(-4) });

    await expect(w.seat(period, plan, people[2], dayFromToday(-3))).resolves.toBeUndefined();

    // A period with no line is judged by the quantity it bought.
    const { vendorId, workspaceId } = await w.vendor('Atlassian');
    const jira = await w.plan(vendorId, 'Jira');
    const bare = await w.period(jira, workspaceId, { quantity: 1 });
    await w.seat(bare, jira, people[0], dayFromToday(-5));
    await expect(w.seat(bare, jira, people[1], dayFromToday(-5))).rejects.toMatchObject({
      code: '23514',
      constraint: 'license_assignments_seat_capacity',
    });
  });
});
