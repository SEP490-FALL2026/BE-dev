import request from 'supertest';
import type { ApiAccount } from '../../support/api-accounts';
import { PgRelay } from '../../support/pg-relay';
import { QueryCounter, dataStatements, tablesOf } from '../../support/query-count';
import { ReassignmentHarness, type WaitWire } from '../../support/reassignment-harness';
import type { Person } from '../../support/request-harness';
import type { Unit } from '../../support/spend-harness';

const h = new ReassignmentHarness();
const M = 1_000_000;
const APPROVE = { decision: 'APPROVE' };

describe('steps that wait under control, over PostgreSQL (US-05-11)', () => {
  let relay: PgRelay;
  let counter: QueryCounter;
  let internal: string;
  let paid: string;
  /** A person who holds no role at all: what nobody who is not the holder of a step can decide it as. */
  let bystander: Person;
  let n = 0;

  beforeAll(async () => {
    await h.start({
      appDatabaseUrl: async (directUrl) => {
        const url = new URL(directUrl);
        relay = await PgRelay.start(url.hostname, Number(url.port || 5432));
        url.port = String(relay.port);

        return url.toString();
      },
    });
    counter = QueryCounter.on(relay);
    await h.withApprover();
    internal = await h.plan('K5');
    paid = await h.planOf(await h.subscription(50));
    await h
      .declareTaxProfile((await h.vendorOf(paid)).id, [{ taxType: 'GTGT', ratePercent: '10', deductible: true }])
      .expect(200);
    bystander = await h.staff(await h.departmentWithUnit('P-BYS'), 'BYS-E0');
  }, 240000);

  afterAll(async () => {
    await h.stop();
    await relay?.stop();
  });

  /** A department with a head and a member, and a budget, made while the approver still decides budgets. */
  const unitWithBudget = async (extra: { held?: number; spent?: number } = {}): Promise<Unit> => {
    n += 1;
    const unit = await h.departmentWithHead(`P-W${n}`);
    await h.budgetFor(unit, { total: 100 * M, ...extra });

    return unit;
  };
  const alertsOf = async (stepId: string) =>
    Number(
      (
        await h.ctx.sql.query<{ count: string }>(`SELECT count(*) FROM controlled_wait_alerts WHERE step_id = $1`, [
          stepId,
        ])
      ).rows[0].count,
    );
  const listed = async (account: ApiAccount | string, query: Record<string, string | number> = {}) => {
    const token = typeof account === 'string' ? { Authorization: `Bearer ${account}` } : h.as(account);
    const response = await request(h.server()).get('/api/v1/controlled-waits').query(query).set(token).expect(200);

    return h.dataOf<{ items: WaitWire[]; pagination: { totalItems: number } }>(response);
  };
  const waitsFor = async (stepId: string, account: ApiAccount | string = h.admin) =>
    (await listed(account, { pageSize: 100 })).items.find((item) => item.stepId === stepId);
  const sentWhileEmpty = async (role: 'SPENDING_APPROVER', work: () => Promise<void>) => {
    await h.clearRole(role);
    try {
      await work();
    } finally {
      await h.setRole(role, h.boss);
    }
  };

  describe('the spend step has no approver to hold it (AC-1 to AC-5)', () => {
    it('waits under control, decides nothing, and is told once to the Super Admin with what to configure however long it waits (AC-1, AC-2, AC-4)', async () => {
      const unit = await unitWithBudget();
      const id = await h.paidRequest(unit, paid, { amount: 5 * M });

      await sentWhileEmpty('SPENDING_APPROVER', async () => {
        await h.route(id, unit.head.account);

        const step = await h.stepOf(id, 'SPEND_APPROVAL');
        expect(step).toMatchObject({
          state: 'WAITING',
          assignee_employee_id: null,
          waiting_reason: 'NO_SPENDING_APPROVER',
        });
        expect(step.waiting_since).toBeInstanceOf(Date);
        expect(await h.state(id)).toBe('WAITING_CONTROLLED');
        // Nobody else is given the step (AC-4): there is no approver of last resort and no substitute.
        expect(await alertsOf(step.id)).toBe(0);

        await h.sweep();
        const [alert] = await h.audit('ACCESS_REQUEST.STEP_WAIT_ALERTED', step.id);
        expect(alert).toMatchObject({
          actor_kind: 'SYSTEM',
          after: {
            requestId: id,
            stepKind: 'SPEND_APPROVAL',
            waitingReason: 'NO_SPENDING_APPROVER',
            configurationHint: 'CONFIGURE_SPENDING_APPROVER',
            notify: 'SUPER_ADMIN',
          },
        });
        // Nobody but the Super Admin is told, and no IT Admin is looked for (D-S20).
        expect(alert.after).not.toHaveProperty('itAdminEmployeeId');
        expect(await alertsOf(step.id)).toBe(1);
        expect(await waitsFor(step.id)).toMatchObject({
          requestId: id,
          stepKind: 'SPEND_APPROVAL',
          waitingReason: 'NO_SPENDING_APPROVER',
          configurationHint: 'CONFIGURE_SPENDING_APPROVER',
          requester: { employeeId: unit.member.employeeId },
          department: { id: unit.department.id },
        });
        expect((await waitsFor(step.id))?.alertedAt).not.toBeNull();

        // Thirty days go by: the step is looked at again every day and nothing is decided, refused or cancelled, nor told twice.
        await h.ctx.sql.query(
          `UPDATE access_request_steps SET created_at = created_at - interval '30 days' WHERE id = $1`,
          [step.id],
        );
        for (let day = 0; day < 3; day += 1) await h.sweep();

        expect(await h.state(id)).toBe('WAITING_CONTROLLED');
        expect(await h.stepOf(id, 'SPEND_APPROVAL')).toMatchObject({ state: 'WAITING', assignee_employee_id: null });
        expect(
          Number(
            (
              await h.ctx.sql.query<{ count: string }>(`SELECT count(*) FROM spend_decisions WHERE request_id = $1`, [
                id,
              ])
            ).rows[0].count,
          ),
        ).toBe(0);
        expect(await alertsOf(step.id)).toBe(1);
        expect(await h.audit('ACCESS_REQUEST.STEP_WAIT_ALERTED', step.id)).toHaveLength(1);
      });

      // The Super Admin configures the approver: the step is given at once, and its age is that of the step, not of the wait (AC-3).
      const step = await h.stepOf(id, 'SPEND_APPROVAL');
      expect(step).toMatchObject({
        state: 'PENDING',
        assignee_employee_id: h.boss.employeeId,
        waiting_reason: null,
        waiting_since: null,
      });
      expect(await h.state(id)).toBe('AWAITING_SPEND_DECISION');
      expect(step.created_at.getTime()).toBeLessThan(Date.now() - 29 * 86_400_000);
      const [given] = await h.audit('ACCESS_REQUEST.STEP_ASSIGNED_FROM_WAIT', step.id);
      expect(given).toMatchObject({
        after: {
          trigger: 'ROLE_HOLDER_CHANGED',
          assigneeEmployeeId: h.boss.employeeId,
          stepCreatedAt: step.created_at.toISOString(),
        },
      });
      expect(await waitsFor(step.id)).toBeUndefined();
    });

    it('is given at once, with no wait and no alert, when the approver is configured (AC-5)', async () => {
      const unit = await unitWithBudget();
      const id = await h.paidRequest(unit, paid, { amount: 5 * M });
      const alerts = await h.ctx.sql.query(`SELECT 1 FROM controlled_wait_alerts`);

      await h.route(id, unit.head.account);
      await h.sweep();

      const step = await h.stepOf(id, 'SPEND_APPROVAL');
      expect(step).toMatchObject({ state: 'PENDING', assignee_employee_id: h.boss.employeeId, waiting_since: null });
      expect((await h.ctx.sql.query(`SELECT 1 FROM controlled_wait_alerts`)).rowCount).toBe(alerts.rowCount);
    });

    it('never gives the spend step to a person who has left, though the role still names them', async () => {
      const unit = await unitWithBudget();
      const id = await h.paidRequest(unit, paid, { amount: 5 * M });
      n += 1;
      const departed = await h.staff(await h.departmentWithUnit(`P-DEP${n}`), `DEP-${n}`);
      await h.setRole('SPENDING_APPROVER', departed);
      await h.leave(departed.employeeId, { announce: false });
      try {
        await h.route(id, unit.head.account);

        expect(await h.stepOf(id, 'SPEND_APPROVAL')).toMatchObject({
          state: 'WAITING',
          assignee_employee_id: null,
          waiting_reason: 'NO_SPENDING_APPROVER',
        });
        expect(await h.state(id)).toBe('WAITING_CONTROLLED');
      } finally {
        await h.setRole('SPENDING_APPROVER', h.boss);
      }
      expect(await h.stepOf(id, 'SPEND_APPROVAL')).toMatchObject({ assignee_employee_id: h.boss.employeeId });
    });
  });

  describe('the need step of a head who sends for themselves (AC-8, US-05-03 AC-13)', () => {
    it('waits for the spending approver and is not given to anybody else, then goes to the approver when one is configured', async () => {
      const unit = await h.departmentWithHead(`P-H${(n += 1)}`);

      await sentWhileEmpty('SPENDING_APPROVER', async () => {
        const sent = await h.sent(unit.head, internal);

        const step = await h.stepOf(sent.id, 'NEED');
        expect(step).toMatchObject({
          state: 'WAITING',
          assignee_employee_id: null,
          waiting_reason: 'NO_SPENDING_APPROVER',
        });
        expect(await h.state(sent.id)).toBe('WAITING_CONTROLLED');
        await h.sweep();
        expect((await h.audit('ACCESS_REQUEST.STEP_WAIT_ALERTED', step.id))[0].after).toMatchObject({
          configurationHint: 'CONFIGURE_SPENDING_APPROVER',
          notify: 'SUPER_ADMIN',
        });
        expect(await waitsFor(step.id)).toMatchObject({ stepKind: 'NEED' });
        // Nobody can decide it: not the head who sent it, not a person who holds no role.
        await h.decide(sent.id, APPROVE, bystander.account).expect(404);
      });

      const sentRows = await h.ctx.sql.query<{ id: string }>(
        `SELECT id FROM access_requests WHERE requester_employee_id = $1`,
        [unit.head.employeeId],
      );
      const step = await h.stepOf(sentRows.rows[0].id, 'NEED');
      expect(step).toMatchObject({ state: 'PENDING', assignee_employee_id: h.boss.employeeId, routing_row: 2 });
      expect(await h.state(sentRows.rows[0].id)).toBe('PENDING');
    });
  });

  describe('a department with no head (AC-6, AC-7, D-S20)', () => {
    it('alerts the Super Admin once when a need step waits with NO_DEPARTMENT_HEAD, shows the row to the IT Admin in charge and to nobody else, and loses it when the requester withdraws', async () => {
      n += 1;
      const headless = await h.departmentWithUnit(`P-HL${n}`);
      const e4 = await h.staff(headless, `HL-E${n}`);
      const itInCharge = { employeeId: h.it1.employeeId, account: h.it1 };
      await h.setItAdminInCharge(headless, itInCharge);
      const otherDepartment = await h.departmentWithUnit(`P-OT${n}`);
      const itElsewhere = await h.staff(otherDepartment, `IT-OT${n}`, 'IT_ADMIN');
      await h.setItAdminInCharge(otherDepartment, itElsewhere);

      const sent = await h.sent(e4, internal);
      const step = await h.stepOf(sent.id, 'NEED');
      // Nobody takes the step in place of a head: it waits on row 4, with the request under control.
      expect(step).toMatchObject({
        state: 'WAITING',
        assignee_employee_id: null,
        routing_row: 4,
        waiting_reason: 'NO_DEPARTMENT_HEAD',
      });
      expect(await h.state(sent.id)).toBe('WAITING_CONTROLLED');

      await h.sweep();
      const [alert] = await h.audit('ACCESS_REQUEST.STEP_WAIT_ALERTED', step.id);
      expect(alert.after).toMatchObject({
        stepKind: 'NEED',
        waitingReason: 'NO_DEPARTMENT_HEAD',
        configurationHint: 'ASSIGN_DEPARTMENT_HEAD',
        notify: 'SUPER_ADMIN',
      });
      // The Super Admin is the one told: the audit event names nobody else, and the IT Admin in charge is not looked for.
      expect(alert.after).not.toHaveProperty('itAdminEmployeeId');
      expect(await alertsOf(step.id)).toBe(1);
      await h.sweep();
      await h.sweep();
      expect(await alertsOf(step.id)).toBe(1);
      expect(await h.audit('ACCESS_REQUEST.STEP_WAIT_ALERTED', step.id)).toHaveLength(1);

      expect(await waitsFor(step.id, h.admin)).toMatchObject({
        requestId: sent.id,
        waitingReason: 'NO_DEPARTMENT_HEAD',
        configurationHint: 'ASSIGN_DEPARTMENT_HEAD',
        department: { id: headless.id },
      });
      expect(await waitsFor(step.id, h.it1)).toMatchObject({ requestId: sent.id, department: { id: headless.id } });
      expect(await waitsFor(step.id, itElsewhere.account)).toBeUndefined();
      await request(h.server()).get('/api/v1/controlled-waits').set(h.as(h.finance)).expect(403);
      await request(h.server()).get('/api/v1/controlled-waits').set(h.as(h.employee)).expect(403);

      // The requester withdraws while it waits: the request ends, the step is closed and leaves the queue, nobody is told again.
      await h.withdrawRequest(sent.id, {}, e4.account).expect(200);
      expect(await h.state(sent.id)).toBe('WITHDRAWN');
      expect(await h.stepOf(sent.id, 'NEED')).toMatchObject({ state: 'CLOSED', waiting_since: null });
      expect(await waitsFor(step.id)).toBeUndefined();
      await h.sweep();
      expect(await alertsOf(step.id)).toBe(1);
    });
  });

  describe('an event leaves nobody valid to hold a step that was held (US-05-12 AC-8)', () => {
    it('makes the step wait in the transaction of the change, tells it at once, decides nothing, and gives it to the head who is named after', async () => {
      const unit = await h.departmentWithHead(`P-EV${(n += 1)}`);
      const successor = await h.staff(unit.department, `EV-S${n}`);
      const sent = await h.sent(unit.member, internal);
      expect((await h.stepOf(sent.id, 'NEED')).assignee_employee_id).toBe(unit.head.employeeId);

      await h.vacateHead(unit.department.id).expect(200);

      const step = await h.stepOf(sent.id, 'NEED');
      expect(step).toMatchObject({
        state: 'WAITING',
        assignee_employee_id: null,
        waiting_reason: 'NO_DEPARTMENT_HEAD',
      });
      expect(await h.state(sent.id)).toBe('WAITING_CONTROLLED');
      const [waiting] = await h.audit('ACCESS_REQUEST.STEP_WAITING', step.id);
      expect(waiting).toMatchObject({
        before: { assigneeEmployeeId: unit.head.employeeId },
        after: { trigger: 'HEAD_CHANGED', waitingReason: 'NO_DEPARTMENT_HEAD', requestState: 'WAITING_CONTROLLED' },
      });
      // The alert is raised with the change, not by the next pass of the worker.
      expect(await alertsOf(step.id)).toBe(1);
      expect(await h.audit('ACCESS_REQUEST.STEP_WAIT_ALERTED', step.id)).toHaveLength(1);
      // Nobody decides it meanwhile: the head who went no longer sees it.
      await h.decide(sent.id, APPROVE, unit.head.account).expect(404);

      await h.makeHead(unit.department, successor);
      expect(await h.stepOf(sent.id, 'NEED')).toMatchObject({
        state: 'PENDING',
        assignee_employee_id: successor.employeeId,
        waiting_reason: null,
        waiting_since: null,
      });
      expect(await h.state(sent.id)).toBe('PENDING');
      expect(await h.audit('ACCESS_REQUEST.STEP_ASSIGNED_FROM_WAIT', step.id)).toHaveLength(1);
    });
  });

  describe('nobody holds the role of Finance (AC-9)', () => {
    it('makes the review wait for Finance without opening a spend step, leaves a request that needs no review alone, and gives the review to Finance once the role is granted and the account can act', async () => {
      const exceptional = await unitWithBudget({ held: 20 * M, spent: 40 * M });
      const ordinary = await unitWithBudget();
      const r4 = await h.paidRequest(exceptional, paid, { amount: 45 * M });
      const r6 = await h.paidRequest(ordinary, paid, { amount: 5 * M });
      n += 1;
      const first = await h.staff(await h.departmentWithUnit(`P-F${n}`), `FIN-A${n}`);
      const second = await h.staff(await h.departmentWithUnit(`P-F${n + 1000}`), `FIN-B${n}`);
      await h.changeRoleOf(h.finance.appUserId, 'EMPLOYEE').expect(200);
      try {
        await h.route(r4, exceptional.head.account);
        await h.route(r6, ordinary.head.account);

        const review = await h.stepOf(r4, 'FINANCE_REVIEW');
        expect(review).toMatchObject({ state: 'WAITING', waiting_reason: 'NO_FINANCE_REVIEWER' });
        expect(await h.state(r4)).toBe('WAITING_CONTROLLED');
        expect(
          (
            await h.ctx.sql.query(
              `SELECT 1 FROM access_request_steps WHERE request_id = $1 AND kind = 'SPEND_APPROVAL'`,
              [r4],
            )
          ).rowCount,
        ).toBe(0);
        expect(await h.stepOf(r6, 'SPEND_APPROVAL')).toMatchObject({
          state: 'PENDING',
          assignee_employee_id: h.boss.employeeId,
        });
        await h.sweep();
        expect((await h.audit('ACCESS_REQUEST.STEP_WAIT_ALERTED', review.id))[0].after).toMatchObject({
          configurationHint: 'GRANT_FINANCE_ROLE',
          notify: 'SUPER_ADMIN',
        });

        // The role is granted to an account that has not been activated yet: the review keeps waiting.
        await h.ctx.sql.query(`UPDATE app_users SET activation_state = 'INVITED' WHERE id = $1`, [
          first.account.appUserId,
        ]);
        await h.changeRoleOf(first.account.appUserId, 'FINANCE').expect(200);
        expect(await h.stepOf(r4, 'FINANCE_REVIEW')).toMatchObject({ state: 'WAITING', assignee_employee_id: null });

        // The account is activated: the sweep gives it, since no change of the role announces an activation.
        await h.ctx.sql.query(`UPDATE app_users SET activation_state = 'ACTIVATED' WHERE id = $1`, [
          first.account.appUserId,
        ]);
        await h.sweep();
        expect(await h.stepOf(r4, 'FINANCE_REVIEW')).toMatchObject({
          state: 'PENDING',
          assignee_employee_id: first.employeeId,
          waiting_reason: null,
          waiting_since: null,
        });
        expect(await h.state(r4)).toBe('AWAITING_FINANCE_REVIEW');

        // The review that is held is not taken from Finance when the role changes person.
        await h.changeRoleOf(first.account.appUserId, 'EMPLOYEE').expect(200);
        await h.changeRoleOf(second.account.appUserId, 'FINANCE').expect(200);
        expect(await h.stepOf(r4, 'FINANCE_REVIEW')).toMatchObject({ assignee_employee_id: first.employeeId });
      } finally {
        await h.changeRoleOf(second.account.appUserId, 'EMPLOYEE');
        await h.changeRoleOf(h.finance.appUserId, 'FINANCE');
      }
    });
  });

  describe('the queue (API)', () => {
    it('lists the steps that wait, the longest first, with a stable order, in pages that add up, and shows no amount', async () => {
      n += 1;
      const headless = await h.departmentWithUnit(`P-Q${n}`);
      for (let index = 0; index < 4; index += 1) await h.sent(await h.staff(headless, `Q-E${n}-${index}`), internal);
      const all = await listed(h.admin, { pageSize: 100 });
      const expected = (
        await h.ctx.sql.query<{ id: string }>(
          `SELECT id FROM access_request_steps WHERE state = 'WAITING' ORDER BY waiting_since, id`,
        )
      ).rows.map((row) => row.id);

      expect(all.items.map((item) => item.stepId)).toEqual(expected);
      expect(all.pagination.totalItems).toBe(expected.length);
      const pages: string[] = [];
      for (let page = 1; page <= Math.ceil(expected.length / 2); page += 1) {
        pages.push(...(await listed(h.admin, { page, pageSize: 2 })).items.map((item) => item.stepId));
      }
      expect(pages).toEqual(expected);
      expect(JSON.stringify(all)).not.toMatch(/amount|currency|budget|check/i);
    });

    it('refuses a page that is out of bounds, and answers a page past the end with no rows', async () => {
      for (const query of [{ page: 0 }, { pageSize: 0 }, { pageSize: 101 }, { page: 'x' }]) {
        const response = await request(h.server()).get('/api/v1/controlled-waits').query(query).set(h.as(h.it1));
        expect({ query, status: response.status, code: h.codeOf(response) }).toEqual({
          query,
          status: 422,
          code: 'VALIDATION_ERROR',
        });
      }
      expect((await listed(h.admin, { page: 999, pageSize: 100 })).items).toEqual([]);
    });

    it('reads a number of statements that does not depend on the number of rows, and never the budget or the checks', async () => {
      n += 1;
      const headless = await h.departmentWithUnit(`P-N${n}`);
      const read = () => counter.run(() => listed(h.admin, { pageSize: 100 }));
      await h.sent(await h.staff(headless, `N-E${n}-0`), internal);
      const few = await read();
      for (let index = 1; index < 6; index += 1) await h.sent(await h.staff(headless, `N-E${n}-${index}`), internal);
      const many = await read();

      expect(many.result.items.length).toBeGreaterThan(few.result.items.length);
      expect(dataStatements(many.statements)).toHaveLength(dataStatements(few.statements).length);
      const tables = new Set(dataStatements(many.statements).flatMap(tablesOf));
      for (const forbidden of [
        'budget_commitments',
        'request_budget_checks',
        'request_budget_check_years',
        'spend_decisions',
      ]) {
        expect(tables.has(forbidden)).toBe(false);
      }
      expect(tables.has('access_request_steps')).toBe(true);
    });
  });
});
