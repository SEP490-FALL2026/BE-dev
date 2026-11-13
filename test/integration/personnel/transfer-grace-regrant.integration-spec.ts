import { addDays } from '../../../src/core/business-date';
import { TransferRevocationService } from '../../../src/modules/personnel/transfer-grace/transfer-revocation.service';
import type { ApiAccount } from '../../support/api-accounts';
import { OffboardingHarness } from '../../support/offboarding-harness';
import type { Person } from '../../support/request-harness';
import { handOthersToSecondItAdmin } from '../../support/second-it-admin';
import type { Unit } from '../../support/spend-harness';

const h = new OffboardingHarness();
const M = 1_000_000;

interface DetailWire {
  phase: string;
  oldRights: { assignmentId: string; state: string; regranted: boolean; revocation: { taskId: string } | null }[];
  snapshot: { after: { rights: { assignmentId: string; outcome: string }[] } | null } | null;
}

/**
 * `MF3-C.4` (R-49, `QĐ-110q`, SPEC T-MF3): a person in the grace of a transfer asks again, on the same subscription, for software they hold, and the
 * grant of the new right ends the old one the day it is given — in the same transaction, before the new right is written, so the database never sees two
 * personal rights of one person at once, with no task of revocation and nothing done at the vendor. The grace then takes back only the rights left, and
 * says which was given again. On real PostgreSQL, through the routes of the request and of the IT Admin.
 */
describe('asking again on the same subscription in the grace of a transfer (integration, real PostgreSQL)', () => {
  let canva: { plan: string; subscriptionId: string };
  let figma: { plan: string; subscriptionId: string };
  let it2: ApiAccount;
  let counter = 0;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    // The limits are judged as the product does: the grace is what lets the person ask again.
    await h.enforceRequestLimits();
    const made = async () => {
      const subscriptionId = await h.subscription(40, 'K2');

      return { plan: await h.planOf(subscriptionId), subscriptionId };
    };
    canva = await made();
    figma = await made();
    it2 = await handOthersToSecondItAdmin(h);
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  /** A pass looks at every transfer: the reminders the tests before left owed are marked as done, so each test sees only its own. */
  beforeEach(async () => {
    await h.ctx.sql.query(
      `UPDATE department_transfers SET reminded_at = now()
        WHERE status = 'EFFECTIVE' AND closed_at IS NULL AND grace_ends_on IS NOT NULL AND reminded_at IS NULL`,
    );
  });

  const revocation = () => h.ctx.app.get(TransferRevocationService, { strict: false });
  const at = (day: string) => new Date(`${day}T12:00:00Z`);

  /** A person who holds Canva and Figma, and the department with a budget they move to, whose IT Admin is `it2`. */
  const example = async (): Promise<{ u: Unit; dest: Unit; person: Person; canvaSeat: string; figmaSeat: string }> => {
    counter += 1;
    const u = await h.departmentWithHead(`P-RG${counter}`);
    const dest = await h.departmentWithHead(`P-RG${counter}-DEST`);
    await h.budgetFor(dest, { total: 500 * M });
    await h.setItAdminInCharge(dest.department, { employeeId: it2.employeeId, account: it2 });
    const code = `RG-E${counter}`;
    const person = await h.worker(u.department, code);
    const canvaSeat = await h.seatOf(person, { subscriptionId: canva.subscriptionId }, code);
    const figmaSeat = await h.seatOf(person, { subscriptionId: figma.subscriptionId }, code);

    return { u, dest, person, canvaSeat, figmaSeat };
  };
  /**
   * The transfer took effect two days ago and its grace ends in three (the example of SPEC T-MF3: effective 16/11, the person asks again on 18/11, the grace
   * ends 20/11): the picture of the rights is the one taken the day it took effect.
   */
  const shifted = async (transferId: string): Promise<{ graceEnds: string }> => {
    const graceEnds = addDays(h.today(), 3);
    await h.ctx.sql.query('BEGIN');
    try {
      await h.ctx.sql.query('ALTER TABLE department_transfers DISABLE TRIGGER USER');
      await h.ctx.sql.query(
        `UPDATE department_transfers SET effective_on = $2, grace_ends_on = $3, grace_reminder_on = $4 WHERE id = $1`,
        [transferId, addDays(h.today(), -2), graceEnds, addDays(h.today(), 1)],
      );
      await h.ctx.sql.query('ALTER TABLE department_transfers ENABLE TRIGGER USER');
      await h.ctx.sql.query('COMMIT');
    } catch (error) {
      await h.ctx.sql.query('ROLLBACK');
      throw error;
    }

    return { graceEnds };
  };
  /** The request of the person for the plan, sent in the new department and approved to the end. */
  const approvedAgain = async (person: Person, dest: Unit, plan: string): Promise<string> => {
    const sent = await h.sent(person, plan, { termMonths: 1 });
    await h.decide(sent.id, { decision: 'APPROVE' }, dest.head.account).expect(200);
    await h.setPayments(sent.id, { amount: 5 * M });
    await h.sendOn([sent.id], dest.head.account).expect(201);
    await h.decideSpend(sent.id, { decision: 'APPROVE' }, h.boss.account).expect(200);

    return sent.id;
  };
  const seatRow = async (id: string) =>
    (
      await h.ctx.sql.query<{
        valid_from: string;
        valid_until: string | null;
        replaces: string | null;
        employee_id: string;
      }>(
        `SELECT to_char(valid_from, 'YYYY-MM-DD') AS valid_from, to_char(valid_until, 'YYYY-MM-DD') AS valid_until,
                replaces_assignment_id AS replaces, employee_id
           FROM license_assignments WHERE id = $1`,
        [id],
      )
    ).rows[0];
  const seatOfTask = async (taskId: string): Promise<string> =>
    (
      await h.ctx.sql.query<{ assignment_id: string }>('SELECT assignment_id FROM provisioning_tasks WHERE id = $1', [
        taskId,
      ])
    ).rows[0].assignment_id;
  const revokeTasksOf = async (assignmentId: string): Promise<{ id: string; revocation_source: string }[]> =>
    (
      await h.ctx.sql.query<{ id: string; revocation_source: string }>(
        `SELECT id, revocation_source::text FROM provisioning_tasks WHERE assignment_id = $1 AND kind = 'REVOKE'`,
        [assignmentId],
      )
    ).rows;
  const detailOf = async (id: string): Promise<DetailWire> =>
    h.dataOf<DetailWire>(await h.readTransfer(id).expect(200));

  it('T-MF3 (R-49): asked again and granted on the same subscription, the old right ends the day of the grant, and the grace takes back only the other right', async () => {
    const { dest, person, canvaSeat, figmaSeat } = await example();
    const wire = await h.moveToday(person, dest.department);
    const { graceEnds } = await shifted(wire.id);
    const requestId = await approvedAgain(person, dest, canva.plan);

    const granted = await h.grant({ requestId, subscriptionId: canva.subscriptionId }).expect(201);

    // No overlap, no second seat: the old right ended the day of the grant, the new one begins as it ends, and it names the one it replaced.
    const task = h.dataOf<{ task: { id: string } }>(granted).task.id;
    const newSeat = await seatOfTask(task);
    expect(await seatRow(canvaSeat)).toMatchObject({ valid_until: h.today() });
    expect(await seatRow(newSeat)).toMatchObject({ valid_from: h.today(), valid_until: null, replaces: canvaSeat });
    expect((await seatRow(newSeat)).employee_id).toBe(person.employeeId);
    // Nothing is done at the vendor and nobody is asked to take the old right away.
    expect(await revokeTasksOf(canvaSeat)).toEqual([]);
    const events = await h.ctx.sql.query<{ after: Record<string, unknown> }>(
      `SELECT after FROM audit_events WHERE action = 'LICENSE_ASSIGNMENT.ENDED' AND resource_id = $1`,
      [canvaSeat],
    );
    expect(events.rows).toHaveLength(1);
    expect(events.rows[0].after).toMatchObject({ validUntil: h.today(), regrantRequestId: requestId });
    // P7 says it was given again.
    const detail = await detailOf(wire.id);
    expect(detail.oldRights.find((right) => right.assignmentId === canvaSeat)).toMatchObject({
      state: 'ENDED',
      regranted: true,
    });
    expect(detail.oldRights.find((right) => right.assignmentId === figmaSeat)).toMatchObject({
      state: 'HELD',
      regranted: false,
    });

    // The day after the grace: one task, for Figma (the new Canva right is the new department's, begun after the transfer).
    const pass = await revocation().sweep(at(addDays(graceEnds, 1)));

    expect(pass).toMatchObject({ transfers: 1, rights: 1 });
    expect((await revokeTasksOf(figmaSeat)).map((row) => row.revocation_source)).toEqual(['TRANSFER']);
    expect(await revokeTasksOf(canvaSeat)).toEqual([]);
    expect(await revokeTasksOf(newSeat)).toEqual([]);
  }, 300_000);

  it('R-49 on a K1 right: the seat of the old right is carried on — one seat for the person, the quantity of the subscription and the purchase of the grant do not rise', async () => {
    counter += 1;
    const u = await h.departmentWithHead(`P-RG${counter}`);
    const dest = await h.departmentWithHead(`P-RG${counter}-DEST`);
    await h.budgetFor(dest, { total: 500 * M });
    await h.setItAdminInCharge(dest.department, { employeeId: it2.employeeId, account: it2 });
    const code = `RG-E${counter}`;
    const person = await h.worker(u.department, code);
    const mailbox = await h.subscription(40, 'K1');
    const mailboxPlan = await h.planOf(mailbox);
    const oldSeat = await h.seatOf(person, { subscriptionId: mailbox }, code);
    const wire = await h.moveToday(person, dest.department);
    await shifted(wire.id);
    const quantity = async (): Promise<number> =>
      (
        await h.ctx.sql.query<{ q: number }>('SELECT purchased_quantity AS q FROM subscriptions WHERE id = $1', [
          mailbox,
        ])
      ).rows[0].q;
    const before = await quantity();
    const requestId = await approvedAgain(person, dest, mailboxPlan);

    const granted = await h.grant({ requestId, subscriptionId: mailbox }).expect(201);

    const taskId = h.dataOf<{ task: { id: string } }>(granted).task.id;
    const newSeat = await seatOfTask(taskId);
    expect(await seatRow(oldSeat)).toMatchObject({ valid_until: h.today() });
    expect(await seatRow(newSeat)).toMatchObject({ replaces: oldSeat });
    expect(await quantity()).toBe(before);
    const purchase = await h.ctx.sql.query<{ purchase_kind: string | null }>(
      'SELECT purchase_kind::text AS purchase_kind FROM provisioning_tasks WHERE id = $1',
      [taskId],
    );
    expect(purchase.rows[0].purchase_kind).toBeNull();
    const held = await h.ctx.sql.query(
      `SELECT 1 FROM license_assignments WHERE subscription_id = $1 AND employee_id = $2 AND failed_at IS NULL AND cancelled_at IS NULL
          AND valid_from <= CURRENT_DATE AND (valid_until IS NULL OR valid_until > CURRENT_DATE)`,
      [mailbox, person.employeeId],
    );
    expect(held.rowCount).toBe(1);
  }, 300_000);

  it('a right given again the very day of the transfer is the new department’s: the grace does not take it back', async () => {
    const { dest, person, canvaSeat, figmaSeat } = await example();
    const wire = await h.moveToday(person, dest.department);
    const requestId = await approvedAgain(person, dest, canva.plan);
    const task = h.dataOf<{ task: { id: string } }>(
      await h.grant({ requestId, subscriptionId: canva.subscriptionId }).expect(201),
    ).task.id;
    const newSeat = await seatOfTask(task);
    // The day of the transfer is the day of the grant: the new right begins the day the transfer took effect, after the picture of the rights.
    expect(await seatRow(newSeat)).toMatchObject({ valid_from: h.today() });
    const graceEnds = (
      await h.ctx.sql.query<{ d: string }>(
        `SELECT to_char(grace_ends_on, 'YYYY-MM-DD') AS d FROM department_transfers WHERE id = $1`,
        [wire.id],
      )
    ).rows[0].d;

    const pass = await revocation().sweep(at(addDays(graceEnds, 1)));

    expect(pass).toMatchObject({ transfers: 1, rights: 1 });
    expect(await revokeTasksOf(canvaSeat)).toEqual([]);
    expect(await revokeTasksOf(newSeat)).toEqual([]);
    expect((await revokeTasksOf(figmaSeat)).map((row) => row.revocation_source)).toEqual(['TRANSFER']);
  }, 300_000);

  it('the picture of the closing says which right was given again and which was taken back', async () => {
    const { dest, person, canvaSeat, figmaSeat } = await example();
    const wire = await h.moveToday(person, dest.department);
    const { graceEnds } = await shifted(wire.id);
    const requestId = await approvedAgain(person, dest, canva.plan);
    await h.grant({ requestId, subscriptionId: canva.subscriptionId }).expect(201);
    await revocation().sweep(at(addDays(graceEnds, 1)));
    const figmaTask = (await revokeTasksOf(figmaSeat))[0].id;
    // The grace is over by the real clock too, then the IT Admin of the new department completes the one task through the route.
    await h.ctx.sql.query('BEGIN');
    try {
      await h.ctx.sql.query('ALTER TABLE department_transfers DISABLE TRIGGER USER');
      await h.ctx.sql.query(
        `UPDATE department_transfers SET effective_on = $2, grace_ends_on = $3, grace_reminder_on = $4 WHERE id = $1`,
        [wire.id, addDays(h.today(), -10), addDays(h.today(), -1), addDays(h.today(), -3)],
      );
      await h.ctx.sql.query('ALTER TABLE department_transfers ENABLE TRIGGER USER');
      await h.ctx.sql.query('COMMIT');
    } catch (error) {
      await h.ctx.sql.query('ROLLBACK');
      throw error;
    }
    await h.claim(figmaTask, it2).expect(200);
    await h
      .revoked(figmaTask, { completion: 'ACCOUNT_REMOVED', evidence: 'Removed from the workspace' }, it2)
      .expect(200);

    const detail = await detailOf(wire.id);

    expect(detail.phase).toBe('CLOSED');
    const outcomes = Object.fromEntries((detail.snapshot?.after?.rights ?? []).map((r) => [r.assignmentId, r.outcome]));
    expect(outcomes).toEqual({ [canvaSeat]: 'REGRANTED', [figmaSeat]: 'REVOKED' });
  }, 300_000);

  it('a right a task of revocation is working is not ended by the grant: the grant meets the overlap as it always did', async () => {
    const { dest, person, canvaSeat } = await example();
    const wire = await h.moveToday(person, dest.department);
    await shifted(wire.id);
    const requestId = await approvedAgain(person, dest, canva.plan);
    // The person returned the old right: a task takes it away and ends it.
    await h.open(canvaSeat, 'RETURN', { decision: { decidedRole: 'EMPLOYEE' } });

    const refused = await h.grant({ requestId, subscriptionId: canva.subscriptionId });

    expect([refused.status, h.codeOf(refused)]).toEqual([422, 'LICENSE_ASSIGNMENT.OVERLAP']);
    expect((await seatRow(canvaSeat)).valid_until).toBeNull();
  }, 300_000);

  it('a grant that fails gives the old right back: the person is not left with neither, and the grace takes it back as it takes the others', async () => {
    const { dest, person, canvaSeat } = await example();
    const wire = await h.moveToday(person, dest.department);
    const { graceEnds } = await shifted(wire.id);
    const requestId = await approvedAgain(person, dest, canva.plan);
    const task = h.dataOf<{ task: { id: string } }>(
      await h.grant({ requestId, subscriptionId: canva.subscriptionId }).expect(201),
    ).task.id;
    expect(await seatRow(canvaSeat)).toMatchObject({ valid_until: h.today() });

    await h.claim(task).expect(200);
    await h.fail(task, { reason: 'The vendor refused the account' }).expect(200);
    await h.closeFailed(task, { reason: 'The vendor refused the account' }).expect(200);

    // The new right failed (an empty period); the old one is open again and the grace will take it back with the other rights.
    expect(await seatRow(canvaSeat)).toMatchObject({ valid_until: null });
    const events = await h.ctx.sql.query<{ after: Record<string, unknown> }>(
      `SELECT after FROM audit_events WHERE action = 'LICENSE_ASSIGNMENT.END_REVERSED' AND resource_id = $1`,
      [canvaSeat],
    );
    expect(events.rows).toHaveLength(1);
    expect(events.rows[0].after).toMatchObject({ validUntil: null, requestId, cause: 'GRANT_FAILED' });
    expect((await detailOf(wire.id)).oldRights.find((right) => right.assignmentId === canvaSeat)).toMatchObject({
      state: 'HELD',
      regranted: false,
    });
    await revocation().sweep(at(addDays(graceEnds, 1)));
    expect((await revokeTasksOf(canvaSeat)).map((row) => row.revocation_source)).toEqual(['TRANSFER']);
  }, 300_000);

  it('a request that replaces nothing grants as ever: a person who never held the plan gets one seat and no right ends', async () => {
    const { dest, person } = await example();
    const wire = await h.moveToday(person, dest.department);
    await shifted(wire.id);
    const other = await h.subscription(40, 'K2');
    const requestId = await approvedAgain(person, dest, await h.planOf(other));

    const granted = await h.grant({ requestId, subscriptionId: other }).expect(201);

    const newSeat = await seatOfTask(h.dataOf<{ task: { id: string } }>(granted).task.id);
    expect(await seatRow(newSeat)).toMatchObject({ replaces: null });
  }, 300_000);
});
