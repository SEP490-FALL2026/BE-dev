import { TransactionRunner } from '../../../src/infrastructure/database/transaction-runner';
import type { SystemActor } from '../../../src/modules/licensing/public/licensing.types';
import { RequestsApi } from '../../../src/modules/requests/public/requests.api';
import type { BeneficiaryGoneInput } from '../../../src/modules/requests/public/requests.types';
import { GroupHarness } from '../../support/group-harness';
import type { Person } from '../../support/request-harness';
import type { Unit } from '../../support/spend-harness';

const h = new GroupHarness();
const M = 1_000_000;
const CHECK = '23514';
const SYSTEM: SystemActor = { kind: 'SYSTEM', correlationId: 'beneficiary-gone:test' };

interface RequestRow {
  state: string;
  cancel_cause: string | null;
  cancelled_by_employee_id: string | null;
  cancelled_at: Date | null;
}

/** The SQLSTATE a rejected statement carries: the constraint, not the application, said no. */
async function sqlState(text: string, values: unknown[] = []): Promise<string | null> {
  try {
    await h.ctx.sql.query(text, values);

    return null;
  } catch (error) {
    return (error as { code?: string }).code ?? 'unknown';
  }
}

/**
 * `QĐ-110d`, `QĐ-110o`, M-12 (X0.7): the system closes the open requests of a person who is gone, on real PostgreSQL. The service is
 * called as the sweeps of MF-2 (`ALL_OPEN`, the day access is blocked) and MF-3 (`PAID_OLD_DEPARTMENT`, the day a transfer takes effect)
 * call it, in a transaction of their own; nothing here goes through a route to close anything.
 */
describe('the system closes the open requests of a person who is gone (integration, real PostgreSQL)', () => {
  /** Three plans, because a person who holds a seat in a plan cannot ask for it again. */
  const plans: { plan: string; subscriptionId: string }[] = [];
  let free: string;
  let counter = 0;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    for (let i = 0; i < 3; i += 1) {
      const subscriptionId = await h.subscription(100);
      plans.push({ plan: await h.planOf(subscriptionId), subscriptionId });
    }
    free = await h.plan('K5');
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  /** A department with a head and an IT Admin in charge, and room in its budget. */
  const unit = async (): Promise<Unit> => {
    counter += 1;
    const made = await h.departmentWithHead(`P-BG${counter}`);
    await h.roomFor(made);
    await h.setItAdminInCharge(made.department, { employeeId: h.it1.employeeId, account: h.it1 });

    return made;
  };
  const run = (input: BeneficiaryGoneInput) =>
    h.ctx.app
      .get(TransactionRunner, { strict: false })
      .run((tx) => h.ctx.app.get(RequestsApi, { strict: false }).cancelForBeneficiaryGone(tx, SYSTEM, input));
  const leftBy = (person: Person): BeneficiaryGoneInput => ({
    employeeId: person.employeeId,
    scope: { kind: 'ALL_OPEN' },
  });
  const movedFrom = (person: Person, oldDepartmentId: string): BeneficiaryGoneInput => ({
    employeeId: person.employeeId,
    scope: { kind: 'PAID_OLD_DEPARTMENT', oldDepartmentId },
  });
  /** A paid request of the person, approved by their head and by the approver: it waits to be carried out, with its commitment. */
  const approvedFor = async (u: Unit, person: Person, which: number): Promise<string> => {
    const sent = await h.sent(person, plans[which].plan, { termMonths: 1 });
    await h.decide(sent.id, { decision: 'APPROVE' }, u.head.account).expect(200);
    await h.setPayments(sent.id, { amount: 5 * M });
    await h.sendOn([sent.id], u.head.account).expect(201);
    await h.decideSpend(sent.id, { decision: 'APPROVE' }, h.boss.account).expect(200);

    return sent.id;
  };
  const granted = async (requestId: string, which: number): Promise<string> =>
    h.dataOf<{ task: { id: string } }>(
      await h.grant({ requestId, subscriptionId: plans[which].subscriptionId }).expect(201),
    ).task.id;
  const row = async (id: string): Promise<RequestRow> =>
    (
      await h.ctx.sql.query<RequestRow>(
        `SELECT state::text, cancel_cause::text, cancelled_by_employee_id, cancelled_at FROM access_requests WHERE id = $1`,
        [id],
      )
    ).rows[0];
  const stateOf = async (id: string) => (await row(id)).state;
  const commitmentOf = async (requestId: string) =>
    (
      await h.ctx.sql.query<{ amount_minor: string; released_minor: string }>(
        `SELECT amount_minor::text, released_minor::text FROM budget_commitments WHERE request_id = $1`,
        [requestId],
      )
    ).rows[0];
  const releases = async (requestId: string) =>
    (
      await h.ctx.sql.query<{ reason: string; amount_minor: string }>(
        `SELECT r.reason::text, r.amount_minor::text FROM budget_commitment_releases r
           JOIN budget_commitments c ON c.id = r.commitment_id WHERE c.request_id = $1 ORDER BY r.id`,
        [requestId],
      )
    ).rows;
  const taskStatus = async (taskId: string) =>
    (await h.ctx.sql.query<{ status: string }>(`SELECT status::text FROM provisioning_tasks WHERE id = $1`, [taskId]))
      .rows[0].status;
  const auditOf = async (requestId: string, action: string) =>
    (
      await h.ctx.sql.query<{ actor_kind: string; actor_app_user_id: string | null; correlation_id: string }>(
        `SELECT actor_kind::text, actor_app_user_id, correlation_id FROM audit_events WHERE resource_id = $1 AND action = $2`,
        [requestId, action],
      )
    ).rows;

  describe('MF-2: every open request of the person at the day access is blocked (QĐ-110d, M-12)', () => {
    it('cancels what has no grant task begun (not yet decided, approved and waiting, a free one, a proposal of new software) and leaves the grant being carried out to the IT Admin', async () => {
      const u = await unit();
      const person = await h.colleague(u);
      const pending = (await h.sent(person, plans[0].plan, { termMonths: 1 })).id;
      const waiting = await approvedFor(u, person, 1);
      const working = await approvedFor(u, person, 2);
      const task = await granted(working, 2);
      const internal = (await h.sent(person, free)).id;
      await h.decide(internal, { decision: 'APPROVE' }, u.head.account).expect(200);
      const proposal = (await h.proposed(person)).id;
      expect(await stateOf(waiting)).toBe('AWAITING_EXECUTION');
      expect(await stateOf(internal)).toBe('AWAITING_EXECUTION');
      expect(await stateOf(working)).toBe('EXECUTING');

      const result = await run(leftBy(person));

      expect(result.cancelled.map((item) => item.requestId).sort()).toEqual(
        [pending, waiting, internal, proposal].sort(),
      );
      expect(result.needsItCheck).toEqual([{ requestId: working, line: false }]);
      for (const id of [pending, waiting, internal, proposal]) {
        expect(await row(id)).toMatchObject({
          state: 'CANCELLED',
          cancel_cause: 'SYSTEM_BENEFICIARY_LEFT',
          cancelled_by_employee_id: null,
        });
        expect((await row(id)).cancelled_at).not.toBeNull();
      }
      // The grant being carried out is not touched: neither the request nor its task.
      expect(await stateOf(working)).toBe('EXECUTING');
      expect(await taskStatus(task)).not.toBe('CANCELLED');
      expect((await row(working)).cancel_cause).toBeNull();
    });

    it('gives back what was held for a request exactly once, however many times it is run', async () => {
      const u = await unit();
      const person = await h.colleague(u);
      const waiting = await approvedFor(u, person, 0);
      const before = await commitmentOf(waiting);
      expect(before.released_minor).toBe('0');

      await run(leftBy(person));
      const once = await commitmentOf(waiting);
      const again = await run(leftBy(person));

      expect(once.released_minor).toBe(once.amount_minor);
      expect(Number(once.released_minor)).toBeGreaterThan(0);
      expect(await releases(waiting)).toEqual([{ reason: 'REQUEST_CANCELLED', amount_minor: once.amount_minor }]);
      expect(again).toEqual({ cancelled: [], needsItCheck: [] });
      expect(await commitmentOf(waiting)).toEqual(once);
    });

    it('writes the audit event as the system, correlated to the pass, and tells Finance of the money that went back and the IT Admin of the grant it left', async () => {
      const u = await unit();
      const person = await h.colleague(u);
      const waiting = await approvedFor(u, person, 1);
      const working = await approvedFor(u, person, 2);
      await granted(working, 2);

      await run(leftBy(person));
      await run(leftBy(person));
      await h.project();

      expect(await auditOf(waiting, 'ACCESS_REQUEST.CANCELLED')).toEqual([
        { actor_kind: 'SYSTEM', actor_app_user_id: null, correlation_id: SYSTEM.correlationId },
      ]);
      // The person sent it for themselves and is gone: only Finance is told, with the departure as the reason.
      const finance = (await h.noticesAbout(waiting)).filter(
        (notice) => notice.code === 'REQUEST_CANCELLED_BENEFICIARY_GONE',
      );
      expect(finance.map((notice) => [notice.recipient_employee_id, notice.code])).toEqual([
        [h.finance.employeeId, 'REQUEST_CANCELLED_BENEFICIARY_GONE'],
      ]);
      expect(finance[0].params).toEqual({
        requestId: waiting,
        beneficiaryEmployeeId: person.employeeId,
        reasonKind: 'DEPARTURE',
      });
      // One notice to the IT Admin in charge for the request left to them, however many times the sweep ran.
      const it = (await h.noticesAbout(working)).filter(
        (notice) => notice.code === 'REQUEST_BENEFICIARY_GONE_IT_CHECK',
      );
      expect(it.map((notice) => [notice.recipient_employee_id, notice.code])).toEqual([
        [h.it1.employeeId, 'REQUEST_BENEFICIARY_GONE_IT_CHECK'],
      ]);
      expect(it[0].params).toEqual({
        requestId: working,
        beneficiaryEmployeeId: person.employeeId,
        reasonKind: 'DEPARTURE',
      });
    });

    it('does not close a request withdrawn while its grant had failed, whose task waits for the IT Admin to close it, and tells the IT Admin', async () => {
      const u = await unit();
      const person = await h.colleague(u);
      const failing = await approvedFor(u, person, 1);
      const task = await granted(failing, 1);
      await h.claim(task).expect(200);
      await h.fail(task, { reason: 'The invitation bounced' }).expect(200);
      await h.withdrawRequest(failing, { reason: 'Not needed' }, person.account).expect(200);
      expect(await stateOf(failing)).toBe('AWAITING_IT_CLOSE');
      const held = await commitmentOf(failing);

      const result = await run(leftBy(person));
      await run(leftBy(person));

      expect(result).toEqual({ cancelled: [], needsItCheck: [{ requestId: failing, line: false }] });
      expect(await stateOf(failing)).toBe('AWAITING_IT_CLOSE');
      expect(await commitmentOf(failing)).toEqual(held);
      const told = (await h.noticesAbout(failing)).filter(
        (notice) => notice.code === 'REQUEST_BENEFICIARY_GONE_IT_CHECK',
      );
      expect(told.map((notice) => notice.recipient_employee_id)).toEqual([h.it1.employeeId]);
    });

    it('closes nothing of another person, nothing that is over, and does not fail for a person with nothing open', async () => {
      const u = await unit();
      const [gone, other] = await h.colleagues(u, 2);
      const mine = (await h.sent(gone, plans[0].plan, { termMonths: 1 })).id;
      const theirs = (await h.sent(other, plans[0].plan, { termMonths: 1 })).id;
      await h.ctx.sql.query(`UPDATE access_requests SET state = 'REJECTED' WHERE id = $1`, [mine]);

      expect(await run(leftBy(gone))).toEqual({ cancelled: [], needsItCheck: [] });
      expect(await run(leftBy(await h.colleague(u)))).toEqual({ cancelled: [], needsItCheck: [] });

      expect(await stateOf(mine)).toBe('REJECTED');
      expect(await stateOf(theirs)).toBe('PENDING');
    });
  });

  describe('a person in a request for a group (M-12)', () => {
    const lineRow = async (requestId: string, person: Person) =>
      (await h.lineRows(requestId)).find((line) => line.employee_id === person.employeeId);

    it('ends the line of the person alone: their share goes back, the others carry on, the request stays open', async () => {
      const u = await unit();
      const [e1, e2, e3] = await h.colleagues(u, 3);
      const id = await h.groupApproved(u, plans[0].plan, [e1, e2, e3]);
      const total = (await h.commitments(id)).reduce((sum, c) => sum + BigInt(c.amount_minor), 0n);

      const result = await run(leftBy(e3));

      expect(result).toEqual({ cancelled: [{ requestId: id, line: true }], needsItCheck: [] });
      expect(await h.lineStates(id)).toEqual(['APPROVED', 'APPROVED', 'CANCELLED']);
      expect(await lineRow(id, e3)).toMatchObject({
        ended_by_employee_id: null,
        end_reason: null,
        cancel_cause: 'SYSTEM_BENEFICIARY_LEFT',
      });
      expect((await lineRow(id, e1))?.cancel_cause).toBeNull();
      expect(await stateOf(id)).not.toBe('CANCELLED');
      const given = (await releases(id)).reduce((sum, release) => sum + BigInt(release.amount_minor), 0n);
      expect(given).toBeGreaterThan(0n);
      expect(given).toBeLessThan(total);
      expect((await releases(id)).every((release) => release.reason === 'REQUEST_CANCELLED')).toBe(true);
      expect(await auditOf(id, 'ACCESS_REQUEST.LINE_CANCELLED')).toEqual([
        { actor_kind: 'SYSTEM', actor_app_user_id: null, correlation_id: SYSTEM.correlationId },
      ]);
      expect(await run(leftBy(e3))).toEqual({ cancelled: [], needsItCheck: [] });
      expect((await releases(id)).reduce((sum, release) => sum + BigInt(release.amount_minor), 0n)).toBe(given);
    });

    it('does not end the line of a person whose grant is being carried out; the IT Admin is told', async () => {
      const u = await unit();
      const [e1, e2] = await h.colleagues(u, 2);
      const id = await h.groupApproved(u, plans[0].plan, [e1, e2]);
      await h
        .grantLine(
          { requestId: id, beneficiaryEmployeeId: e2.employeeId, subscriptionId: plans[0].subscriptionId },
          h.it1,
        )
        .expect(201);

      const result = await run(leftBy(e2));

      expect(result).toEqual({ cancelled: [], needsItCheck: [{ requestId: id, line: true }] });
      expect(await h.lineStates(id)).toEqual(['APPROVED', 'EXECUTING']);
      expect(
        (await h.noticesAbout(id)).filter((notice) => notice.code === 'REQUEST_BENEFICIARY_GONE_IT_CHECK'),
      ).toHaveLength(1);
    });

    it('does not end the line of a person withdrawn while their grant had failed: the IT Admin closes the task, and is told', async () => {
      const u = await unit();
      const [e1, e2] = await h.colleagues(u, 2);
      const id = await h.groupApproved(u, plans[0].plan, [e1, e2]);
      const task = h.dataOf<{ task: { id: string } }>(
        await h
          .grantLine(
            { requestId: id, beneficiaryEmployeeId: e2.employeeId, subscriptionId: plans[0].subscriptionId },
            h.it1,
          )
          .expect(201),
      ).task.id;
      await h.claim(task).expect(200);
      await h.fail(task, { reason: 'The invitation bounced' }).expect(200);
      await h.withdrawLine(id, e2.employeeId, { reason: 'Not needed' }, u.head.account).expect(200);
      expect(await h.lineStates(id)).toEqual(['APPROVED', 'AWAITING_IT_CLOSE']);

      const result = await run(leftBy(e2));

      expect(result).toEqual({ cancelled: [], needsItCheck: [{ requestId: id, line: true }] });
      expect(await h.lineStates(id)).toEqual(['APPROVED', 'AWAITING_IT_CLOSE']);
      expect(
        (await h.noticesAbout(id)).filter((notice) => notice.code === 'REQUEST_BENEFICIARY_GONE_IT_CHECK'),
      ).toHaveLength(1);
    });

    it('ends the whole request when the line of the person was the last that was live', async () => {
      const u = await unit();
      const [e1, e2] = await h.colleagues(u, 2);
      const id = await h.groupApproved(u, plans[0].plan, [e1, e2]);

      await run(leftBy(e1));
      expect(await stateOf(id)).not.toBe('CANCELLED');
      await run(leftBy(e2));

      expect(await h.lineStates(id)).toEqual(['CANCELLED', 'CANCELLED']);
      expect(await row(id)).toMatchObject({ state: 'CANCELLED', cancelled_by_employee_id: null });
    });
  });

  describe('MF-3: the paid requests of the department the person left (QĐ-110o)', () => {
    it('cancels the paid ones sent from the old department, leaves a free one and a proposal, and asks the IT Admin to check the grant being carried out', async () => {
      const u = await unit();
      const person = await h.colleague(u);
      const pending = (await h.sent(person, plans[0].plan, { termMonths: 1 })).id;
      const waiting = await approvedFor(u, person, 1);
      const working = await approvedFor(u, person, 2);
      await granted(working, 2);
      const internal = (await h.sent(person, free)).id;
      const proposal = (await h.proposed(person)).id;

      const result = await run(movedFrom(person, u.department.id));

      expect(result.cancelled.map((item) => item.requestId).sort()).toEqual([pending, waiting].sort());
      expect(result.needsItCheck).toEqual([{ requestId: working, line: false }]);
      for (const id of [pending, waiting]) {
        expect(await row(id)).toMatchObject({
          state: 'CANCELLED',
          cancel_cause: 'SYSTEM_BENEFICIARY_TRANSFERRED',
          cancelled_by_employee_id: null,
        });
      }
      expect(await stateOf(internal)).toBe('PENDING');
      expect(await stateOf(proposal)).toBe('PENDING');
      expect(await stateOf(working)).toBe('EXECUTING');
      expect((await commitmentOf(waiting)).released_minor).toBe((await commitmentOf(waiting)).amount_minor);
    });

    it('touches nothing sent from another department than the one named, and tells the person who was moved, who still works', async () => {
      const u = await unit();
      const elsewhere = await unit();
      const person = await h.colleague(u);
      const waiting = await approvedFor(u, person, 0);

      expect(await run(movedFrom(person, elsewhere.department.id))).toEqual({ cancelled: [], needsItCheck: [] });
      expect(await stateOf(waiting)).toBe('AWAITING_EXECUTION');
      await run(movedFrom(person, u.department.id));
      await h.project();

      const told = (await h.noticesAbout(waiting))
        .filter((notice) => notice.code === 'REQUEST_CANCELLED_BENEFICIARY_GONE')
        .map((notice) => [notice.recipient_employee_id, notice.code]);
      expect(told).toEqual([
        [person.employeeId, 'REQUEST_CANCELLED_BENEFICIARY_GONE'],
        [h.finance.employeeId, 'REQUEST_CANCELLED_BENEFICIARY_GONE'],
      ]);
      expect((await h.noticesOf(person.employeeId, 'REQUEST_CANCELLED_BENEFICIARY_GONE'))[0].params).toMatchObject({
        reasonKind: 'TRANSFER',
      });
    });
  });

  describe('the database holds the rule that only the system closes without an employee (migration 20261113000400)', () => {
    const cancel = (id: string, cause: string, by: string | null) =>
      sqlState(
        `UPDATE access_requests SET state = 'CANCELLED', cancelled_at = now(), cancel_cause = $2::"AccessRequestCancelCause",
                cancelled_by_employee_id = $3 WHERE id = $1`,
        [id, cause, by],
      );

    it('refuses a cause of the system that names an employee, and a cause of the IT Admin that names nobody', async () => {
      const u = await unit();
      const person = await h.colleague(u);
      const id = (await h.sent(person, plans[0].plan, { termMonths: 1 })).id;

      expect(await cancel(id, 'SYSTEM_BENEFICIARY_LEFT', h.it1.employeeId)).toBe(CHECK);
      expect(await cancel(id, 'SYSTEM_BENEFICIARY_TRANSFERRED', h.it1.employeeId)).toBe(CHECK);
      expect(await cancel(id, 'BENEFICIARY_LEFT', null)).toBe(CHECK);
      expect(await cancel(id, 'BENEFICIARY_TRANSFERRED', null)).toBe(CHECK);
      expect(await stateOf(id)).toBe('PENDING');
      expect(await cancel(id, 'BENEFICIARY_LEFT', h.it1.employeeId)).toBeNull();
    });

    it('refuses the same for the line of a request for a group', async () => {
      const u = await unit();
      const [e1, e2] = await h.colleagues(u, 2);
      const id = await h.groupWaiting(u, plans[0].plan, [e1, e2]);
      const endLine = (employeeId: string, cause: string, by: string | null) =>
        sqlState(
          `UPDATE access_request_lines SET state = 'CANCELLED', ended_at = now(), cancel_cause = $3::"AccessRequestCancelCause",
                  ended_by_employee_id = $4 WHERE request_id = $1 AND employee_id = $2`,
          [id, employeeId, cause, by],
        );

      expect(await endLine(e1.employeeId, 'SYSTEM_BENEFICIARY_LEFT', h.it1.employeeId)).toBe(CHECK);
      expect(await endLine(e1.employeeId, 'BENEFICIARY_LEFT', null)).toBe(CHECK);
      expect(await h.lineStates(id)).toEqual(['NEED_CONFIRMED', 'NEED_CONFIRMED']);
      expect(await endLine(e1.employeeId, 'SYSTEM_BENEFICIARY_TRANSFERRED', null)).toBeNull();
    });
  });
});
