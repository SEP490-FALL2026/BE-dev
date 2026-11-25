import { Client } from 'pg';
import { DEPLOY_TIMEOUT_MS, deployMigrations } from '../../support/migration-history';
import {
  dropDisposableDatabase,
  provisionDisposableDatabase,
  type DisposableDatabase,
} from '../../support/disposable-database';
import { lineWorld } from '../../support/w3-lines-world';

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
});
