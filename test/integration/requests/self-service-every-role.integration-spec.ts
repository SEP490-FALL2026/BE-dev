import request from 'supertest';
import type { ApiAccount } from '../../support/api-accounts';
import { DashboardHarness, OVERVIEW_PATHS } from '../../support/dashboard-harness';
import type { Person } from '../../support/request-harness';

const h = new DashboardHarness();

describe('self-service belongs to every account, with one role per account', () => {
  let unit: Awaited<ReturnType<DashboardHarness['departmentWithHead']>>;
  let manager: Person;
  let employee: Person;
  let unplaced: Person;
  let internal: string;
  let accounts: ApiAccount[];

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    unit = await h.departmentWithHead('P-SS');
    manager = await h.staff(unit.department, 'SS-M2', ['MANAGER']);
    employee = await h.staff(unit.department, 'SS-U3', ['EMPLOYEE']);
    unplaced = await h.unplacedStaff('SS-E10', ['EMPLOYEE']);
    internal = await h.plan('K5');
    accounts = [
      h.it1,
      h.finance,
      unit.head.account,
      manager.account,
      employee.account,
      h.boss.account,
      h.sa,
      unplaced.account,
    ];
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  const right = async (person: Person, target: { planId?: string; subscriptionId?: string }) => {
    const { rows } = await h.ctx.sql.query<{ employee_code: string }>(
      'SELECT employee_code FROM employees WHERE id = $1',
      [person.employeeId],
    );
    return h.rightOf(person, rows[0].employee_code, target);
  };

  it('lets all eight callers read only their own software, requests, overview and inbox', async () => {
    const sent = await h.sent(employee, internal);
    for (const account of accounts) {
      for (const path of ['/api/v1/me/software-rights', '/api/v1/me/access-requests', '/api/v1/notifications']) {
        const response = await request(h.server()).get(path).set(h.as(account)).expect(200);
        if (path.endsWith('access-requests')) {
          const ids = h.dataOf<{ items: { id: string }[] }>(response).items.map((item) => item.id);
          expect(ids.includes(sent.id)).toBe(account.employeeId === employee.employeeId);
          if ([h.sa.appUserId, h.boss.account.appUserId].includes(account.appUserId)) expect(ids).toEqual([]);
        }
      }
      const overview = await h.overviewOf(OVERVIEW_PATHS.employee, account);
      expect(overview.sections.requests.state).toBe('COUNTED');
      if ([h.sa.appUserId, h.boss.account.appUserId].includes(account.appUserId))
        expect(overview.sections.requests.count).toBe(0);
    }
  });

  it('lets IT Admin, Finance, both kinds of MANAGER and Employee send and withdraw their own requests', async () => {
    const people = [
      { employeeId: h.it1.employeeId, account: h.it1 },
      { employeeId: h.finance.employeeId, account: h.finance },
      unit.head,
      manager,
      await h.staff(unit.department, 'SS-U4', ['EMPLOYEE']),
    ];
    for (const person of people) {
      const sent = await h.sent(person, internal);
      if (person === unit.head) {
        expect(sent.needStep.assignee?.employeeId).toBe(h.boss.employeeId);
      }
      expect(sent.needStep.assignee?.employeeId).not.toBe(person.employeeId);
      await h.withdrawRequest(sent.id, { reason: 'The work is cancelled' }, person.account).expect(200);
    }
  });

  it('lets each request-capable role return its own seat and report its own SaaS issue', async () => {
    const people = [
      { employeeId: h.it1.employeeId, account: h.it1 },
      { employeeId: h.finance.employeeId, account: h.finance },
      unit.head,
      manager,
      employee,
    ];
    for (const person of people) {
      const seat = await right(person, { planId: internal });
      await request(h.server())
        .post('/api/v1/return-requests')
        .set(h.as(person.account))
        .send({ assignmentId: seat, reason: 'Work completed' })
        .expect(201);
    }
    const subscription = await h.subscription(10, 'K2', unit.department.id);
    const seedSubscription = await h.subscription(10, 'K2');
    for (const person of people) {
      const target = [h.it1.employeeId, h.finance.employeeId].includes(person.employeeId)
        ? seedSubscription
        : subscription;
      const assignmentId = await right(person, { subscriptionId: target });
      await h.reportOn(person.account, assignmentId);
    }
    const mine = await h.overviewOf(OVERVIEW_PATHS.employee, h.it1);
    const assigned = await h.overviewOf(OVERVIEW_PATHS.itAdmin, h.it1);
    expect(mine.sections.saasIssues.count).toBe(1);
    expect(assigned.sections.saasIssues.count).toBeGreaterThan(1);
    const own = await h.itemsOf<{ reporter: { employeeId: string } }>('/api/v1/saas-issues', h.it1, { scope: 'mine' });
    expect(own).toHaveLength(1);
    expect(own[0].reporter.employeeId).toBe(h.it1.employeeId);
  });

  it('keeps the sending restrictions and writes nothing for rejected senders', async () => {
    const before = await h.requestRows();
    const sa = await h.submit(h.form(internal), h.sa).expect(403);
    expect(h.codeOf(sa)).toBe('ACCESS_REQUEST.SUPER_ADMIN_CANNOT_REQUEST');
    for (const person of [h.boss, unplaced]) {
      const response = await h.submit(h.form(internal), person.account).expect(422);
      expect(h.codeOf(response)).toBe('REQUEST_PARTY.INELIGIBLE');
    }
    const delegated = await request(h.server())
      .post('/api/v1/delegated-requests')
      .set(h.as(unit.head.account))
      .send({
        beneficiaryEmployeeIds: [h.boss.employeeId],
        items: [{ planId: internal }],
        businessReason: 'A new workspace',
        termMonths: 1,
      })
      .expect(422);
    expect(h.codeOf(delegated)).toBe('REQUEST_PARTY.INELIGIBLE');
    expect(await h.requestRows()).toBe(before);
  });

  it('keeps role-specific operations closed to other roles', async () => {
    await request(h.server()).get('/api/v1/spend-queue').set(h.as(manager.account)).expect(403);
    await request(h.server()).get('/api/v1/finance-reviews').set(h.as(h.it1)).expect(403);
    await request(h.server()).get('/api/v1/provisioning-tasks').set(h.as(employee.account)).expect(403);
  });
});
