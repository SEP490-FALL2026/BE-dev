import { Client } from 'pg';
import { fromDateColumn } from '../../../src/core/business-date';
import { chooseLine } from '../../../src/modules/catalog/subscription-line/subscription-line.policy';
import { DEPLOY_TIMEOUT_MS, deployMigrations } from '../../support/migration-history';
import { dayFromToday, lineWorld } from '../../support/w3-lines-world';
import {
  dropDisposableDatabase,
  provisionDisposableDatabase,
  type DisposableDatabase,
} from '../../support/disposable-database';

/**
 * Redesign wave 3, W3-15 (M5): the rules of a line the database holds — one live line of a plan in a workspace (C1), one line of a plan on a
 * period, the plan of a line is a plan of seats of the vendor of its workspace (C2), and a line sits in the workspace of its period.
 */
describe('the lines of a subscription period (integration, real PostgreSQL)', () => {
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

  it('refuses a second live line of one plan in one workspace (C1) and lets one in once the first is closed', async () => {
    const w = await lineWorld(sql);
    const { vendorId, workspaceId } = await w.vendor('Anthropic');
    const plan = await w.plan(vendorId, 'Claude Team');
    const first = await w.period(plan, workspaceId);
    const second = await w.period(plan, workspaceId);
    const firstLine = await w.line(first, workspaceId, plan);

    await expect(w.line(second, workspaceId, plan)).rejects.toMatchObject({
      code: '23505',
      constraint: 'subscription_lines_workspace_plan_live',
    });

    await sql.query(`UPDATE subscription_lines SET closed_on = '2026-12-31', closed_reason = 'ENDED' WHERE id = $1`, [
      firstLine,
    ]);
    await expect(w.line(second, workspaceId, plan)).resolves.toEqual(expect.any(String));
  });

  it('refuses a second line of one plan on one period', async () => {
    const w = await lineWorld(sql);
    const { vendorId, workspaceId } = await w.vendor('Anthropic');
    const plan = await w.plan(vendorId, 'Claude Team');
    const period = await w.period(plan, workspaceId);
    await w.line(period, workspaceId, plan, { closedOn: '2026-12-31', closedReason: 'REMOVED' });

    await expect(w.line(period, workspaceId, plan)).rejects.toMatchObject({
      code: '23505',
      constraint: 'subscription_lines_subscription_id_plan_id_key',
    });
  });

  it('refuses the plan of another vendor (C2), a plan that is not of seats, and a workspace other than that of the period', async () => {
    const w = await lineWorld(sql);
    const anthropic = await w.vendor('Anthropic');
    const atlassian = await w.vendor('Atlassian');
    const seats = await w.plan(anthropic.vendorId, 'Claude Team');
    const jira = await w.plan(atlassian.vendorId, 'Jira');
    const docs = await w.plan(anthropic.vendorId, 'Claude Docs', 'K3');
    const period = await w.period(seats, anthropic.workspaceId);

    await expect(w.line(period, anthropic.workspaceId, jira)).rejects.toMatchObject({
      code: '23514',
      constraint: 'subscription_lines_plan_vendor',
    });
    await expect(w.line(period, anthropic.workspaceId, docs)).rejects.toMatchObject({
      code: '23514',
      constraint: 'subscription_lines_plan_is_k2',
    });
    await expect(w.line(period, atlassian.workspaceId, seats)).rejects.toMatchObject({
      code: '23514',
      constraint: 'subscription_lines_workspace_matches_period',
    });
  });

  it('takes the lines of a period along when the period moves to another workspace of the same vendor', async () => {
    const w = await lineWorld(sql);
    const { vendorId, workspaceId } = await w.vendor('Anthropic');
    const secondWorkspace = (
      await sql.query<{ id: string }>(
        `INSERT INTO workspaces (id, organization_id, vendor_id, name, normalized_name, responsible_it_admin_employee_id, updated_at)
         VALUES (gen_random_uuid(), $1, $2, 'Anthropic EU', 'anthropic eu', $3, now()) RETURNING id`,
        [w.organizationId, vendorId, w.khoa],
      )
    ).rows[0].id;
    const plan = await w.plan(vendorId, 'Claude Team');
    const period = await w.period(plan, workspaceId);
    const line = await w.line(period, workspaceId, plan);

    await sql.query(`UPDATE subscriptions SET workspace_id = $2 WHERE id = $1`, [period, secondWorkspace]);

    expect(
      (await sql.query<{ workspace_id: string }>(`SELECT workspace_id FROM subscription_lines WHERE id = $1`, [line]))
        .rows[0].workspace_id,
    ).toBe(secondWorkspace);
  });

  it('allows new live line alongside RENEWED line (closed_on in future) and chooseLine prefers old line before closed_on (W3-15 ca 4)', async () => {
    const w = await lineWorld(sql);
    const { vendorId, workspaceId } = await w.vendor('Atlassian');
    const plan = await w.plan(vendorId, 'Jira');
    const period1 = await w.period(plan, workspaceId, {
      startDate: dayFromToday(-30),
      endDate: dayFromToday(10),
    });
    const closedOn = dayFromToday(10);
    const oldLine = await w.line(period1, workspaceId, plan, { closedOn, closedReason: 'RENEWED' });

    const period2 = await w.period(plan, workspaceId, {
      startDate: dayFromToday(11),
      endDate: dayFromToday(40),
      renewedFromId: period1,
    });
    const newLine = await w.line(period2, workspaceId, plan, { renewedFromLineId: oldLine });

    const rows = await sql.query<{
      id: string;
      closed_on: Date | null;
      closed_reason: string | null;
      ledger_opened_on: Date | null;
      status: string;
      start_date: Date | null;
      end_date: Date | null;
      created_at: Date;
    }>(
      `SELECT l.id, l.closed_on, l.closed_reason, l.ledger_opened_on, s.status::text, s.start_date, s.end_date, l.created_at
         FROM subscription_lines l JOIN subscriptions s ON s.id = l.subscription_id
        WHERE l.id = ANY($1::uuid[])`,
      [[oldLine, newLine]],
    );
    const candidates = rows.rows.map((r) => ({
      id: r.id,
      closedOn: r.closed_on ? fromDateColumn(r.closed_on) : null,
      closedReason: (r.closed_reason as 'RENEWED' | 'ENDED' | 'REMOVED' | null) ?? null,
      ledgerOpenedOn: r.ledger_opened_on ? fromDateColumn(r.ledger_opened_on) : null,
      free: 5,
      subscription: {
        status: r.status as 'ACTIVE' | 'DRAFT',
        startDate: r.start_date ? fromDateColumn(r.start_date) : null,
        endDate: r.end_date ? fromDateColumn(r.end_date) : null,
      },
      createdAt: r.created_at,
    }));

    expect(chooseLine(candidates, dayFromToday(5))?.id).toBe(oldLine);
    expect(chooseLine(candidates, dayFromToday(11))?.id).toBe(newLine);
  });

  it('allows re-declaring a live line for the same plan after an ENDED line (W3-15 ca 5)', async () => {
    const w = await lineWorld(sql);
    const { vendorId, workspaceId } = await w.vendor('Linear');
    const plan = await w.plan(vendorId, 'Linear Plus');
    const expiredPeriod = await w.period(plan, workspaceId, {
      startDate: dayFromToday(-60),
      endDate: dayFromToday(-2),
    });
    await w.line(expiredPeriod, workspaceId, plan, {
      closedOn: dayFromToday(-2),
      closedReason: 'ENDED',
    });

    const freshPeriod = await w.period(plan, workspaceId, {
      startDate: dayFromToday(-1),
      endDate: dayFromToday(30),
    });
    const freshLine = await w.line(freshPeriod, workspaceId, plan);
    expect(freshLine).toBeTruthy();
  });
});
