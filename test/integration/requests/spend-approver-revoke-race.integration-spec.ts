import { Client } from 'pg';
import request from 'supertest';
import { waitForLockWaiters } from '../../support/lock-wait';
import type { Person } from '../../support/request-harness';
import { SpendHarness, type Unit } from '../../support/spend-harness';

const h = new SpendHarness();
const M = 1_000_000;

/**
 * The revocation of the role of the spending approver meets a spend step that is being opened (`QĐ-93c`, spec › M6). The step reads the
 * holder with the row of the grant locked `FOR SHARE`, the revocation `UPDATE`s that very row, so the two take turns. The order is not
 * left to chance: a holder connection locks the row of the grant first, each side is sent and seen waiting (`pg_locks`), and only then is
 * the holder released, so the first of the pair to be served is the one sent first. Either way no spend step is left `PENDING` with
 * somebody who no longer holds the role.
 */
describe('the revocation of the spending approver and the opening of a spend step (integration, real PostgreSQL)', () => {
  let holder: Client;
  let plan: string;
  let unit: Unit;
  let successor: Person;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    plan = await h.planOf(await h.subscription(10));
    await h
      .declareTaxProfile((await h.vendorOf(plan)).id, [{ taxType: 'GTGT', ratePercent: '10', deductible: true }])
      .expect(200);
    unit = await h.departmentWithHead('P-RCE');
    await h.budgetFor(unit, { total: 1000 * M });
    successor = await h.staff(await h.departmentWithUnit('P-RCS'), 'RCS-C2');
    holder = new Client({ connectionString: h.ctx.database.url });
    await holder.connect();
  }, 240000);

  afterEach(async () => {
    await holder.query('ROLLBACK').catch(() => undefined);
    await h.setRole('SPENDING_APPROVER', h.boss);
  });

  afterAll(async () => {
    await holder.end();
    await h.stop();
  });

  const holdGrant = async () => {
    await holder.query('BEGIN');
    await holder.query(`SELECT id FROM role_grants WHERE role = 'SPENDING_APPROVER' AND revoked_at IS NULL FOR UPDATE`);
  };
  // A request of supertest is sent when it is awaited: `then` sends it now, so the writer is queued before the next is sent.
  const opens = (id: string) => h.sendOn([id], unit.head.account).then((response) => response);
  const revokes = () =>
    request(h.server())
      .delete(`/api/v1/app-users/${h.boss.account.appUserId}/role-grants/SPENDING_APPROVER`)
      .set({ Authorization: `Bearer ${h.admin}` })
      .then((response) => response);
  const spendSteps = (id: string) => h.steps(id, 'SPEND_APPROVAL');
  /** The spend steps of the installation that wait for a decision with somebody who does not hold the role. */
  const pendingWithNonHolder = async () =>
    (
      await h.ctx.sql.query(
        `SELECT s.id FROM access_request_steps s
          WHERE s.kind = 'SPEND_APPROVAL' AND s.state = 'PENDING'
            AND NOT EXISTS (
              SELECT 1 FROM role_grants g JOIN app_users u ON u.id = g.app_user_id
               WHERE g.role = 'SPENDING_APPROVER' AND g.revoked_at IS NULL AND u.employee_id = s.assignee_employee_id)`,
      )
    ).rowCount ?? 0;

  it('never leaves a spend step with a revoked holder, either order: opening first, the revocation then hands the step to nobody', async () => {
    const id = await h.paidRequest(unit, plan, { amount: 10 * M });
    await holdGrant();

    const opened = opens(id);
    await waitForLockWaiters(h.ctx.sql, 1);
    const revoked = revokes();
    await waitForLockWaiters(h.ctx.sql, 2);
    await holder.query('COMMIT');
    const [openAnswer, revokeAnswer] = await Promise.all([opened, revoked]);

    expect(openAnswer.status).toBe(201);
    expect(revokeAnswer.status).toBe(200);
    expect(await spendSteps(id)).toEqual([
      expect.objectContaining({ state: 'WAITING', assignee_employee_id: null, waiting_reason: 'NO_SPENDING_APPROVER' }),
    ]);
    expect(await pendingWithNonHolder()).toBe(0);
  });

  it('never leaves a spend step with a revoked holder, either order: the revocation first, the step waits for the next holder', async () => {
    const id = await h.paidRequest(unit, plan, { amount: 10 * M });
    await holdGrant();

    const revoked = revokes();
    await waitForLockWaiters(h.ctx.sql, 1);
    const opened = opens(id);
    await waitForLockWaiters(h.ctx.sql, 2);
    await holder.query('COMMIT');
    const [revokeAnswer, openAnswer] = await Promise.all([revoked, opened]);

    expect(revokeAnswer.status).toBe(200);
    expect(openAnswer.status).toBe(201);
    expect(await spendSteps(id)).toEqual([
      expect.objectContaining({ state: 'WAITING', assignee_employee_id: null, waiting_reason: 'NO_SPENDING_APPROVER' }),
    ]);
    expect(await pendingWithNonHolder()).toBe(0);

    // The role is given to the next person: the step that waited is handed over to them, and nobody else holds it.
    await h.setRole('SPENDING_APPROVER', successor);
    expect(await spendSteps(id)).toEqual([
      expect.objectContaining({ state: 'PENDING', assignee_employee_id: successor.employeeId, waiting_reason: null }),
    ]);
    expect(await pendingWithNonHolder()).toBe(0);
  });
});
