import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { ApiAccount } from '../support/api-accounts';
import { ProvisioningHarness } from '../support/provisioning-harness';

const h = new ProvisioningHarness();

describe('the grant of a seat over HTTP (integration, real PostgreSQL)', () => {
  let designer: string;
  let a1Employee: string;
  let e5: string;
  let e6: string;
  let e7: string;

  const count = async (sql: string, values: unknown[] = []): Promise<number> =>
    Number((await h.ctx.sql.query<{ n: string }>(sql, values)).rows[0].n);
  const tasksOf = (subscriptionId: string) =>
    count(
      `SELECT count(*) AS n FROM provisioning_tasks t JOIN license_assignments a ON a.id = t.assignment_id
        WHERE a.subscription_id = $1`,
      [subscriptionId],
    );
  const assignmentsOf = (employeeId: string) =>
    count(`SELECT count(*) AS n FROM license_assignments WHERE employee_id = $1`, [employeeId]);
  const k2 = async (quantity = 5) => {
    const subscriptionId = await h.subscription(quantity, 'K2');

    return { subscriptionId, planId: await h.planOf(subscriptionId) };
  };

  beforeAll(async () => {
    await h.start();
    designer = await h.jobTitle('Designer');
    a1Employee = await h.person('E-A1');
    await h.account('E-A1', a1Employee, ['IT_ADMIN']);
    await h.department('P-DES', a1Employee);
    await h.department('P-NOIT');
    e5 = await h.member('P-DES', 'E-5', designer);
    e6 = await h.member('P-NOIT', 'E-6', designer);
    e7 = await h.member('P-DES', 'E-7', designer);
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  it('AC-1 (US-07-01): takes the seat from today and queues a manual task for the IT Admin in charge, who is named', async () => {
    const { subscriptionId, planId } = await k2(1);
    const response = await h.grant({ requestId: h.gate.grantable(e5, planId), subscriptionId }).expect(201);
    const { task, warnings } = h.dataOf<{
      task: Record<string, unknown>;
      warnings: string[];
    }>(response);

    expect(warnings).toEqual([]);
    expect(task).toMatchObject({
      kind: 'GRANT',
      channel: 'MANUAL',
      status: 'QUEUED',
      subscriptionId,
      accountIdentifier: 'e-5@acme.vn',
      defaultResponsibleEmployeeId: a1Employee,
      inGeneralQueue: false,
      beneficiary: { employeeId: e5, employeeCode: 'E-5' },
      plan: { provisioningType: 'K2' },
      claimedBy: null,
      completedBy: null,
    });
    expect(await h.freeSeats(subscriptionId)).toBe(0);

    const assignments = h.dataOf<{ items: Record<string, unknown>[] }>(
      await request(h.server())
        .get('/api/v1/license-assignments')
        .query({ subscriptionId })
        .set(h.as(h.it1))
        .expect(200),
    ).items;
    expect(assignments).toHaveLength(1);
    expect(assignments[0]).toMatchObject({
      id: task.assignmentId,
      source: 'REQUEST',
      kind: 'PERSONAL',
      employeeId: e5,
      effectiveFrom: h.today(),
      effectiveFromBasis: 'ACTUAL',
      grantedOn: h.today(),
      predecessorId: null,
    });
  });

  it('AC-15 (US-07-01): the assignment of a request is not marked as a baseline one while the baseline is open', async () => {
    const { subscriptionId, planId } = await k2();
    const task = await h.granted(e5, planId, { subscriptionId });

    const row = (
      await h.ctx.sql.query<{ source: string; baseline_import_id: string | null }>(
        `SELECT source, baseline_import_id FROM license_assignments WHERE id = $1`,
        [task.assignmentId],
      )
    ).rows[0];
    expect(row).toEqual({ source: 'REQUEST', baseline_import_id: null });
  });

  it('audits the assignment and the task in the same transaction, without the account of the vendor', async () => {
    const { subscriptionId, planId } = await k2();
    const task = await h.granted(e7, planId, { subscriptionId });

    const forAssignment = await h.auditEvents('LicenseAssignment', task.assignmentId);
    const forTask = await h.auditEvents('ProvisioningTask', task.id);
    expect(forAssignment.map((event) => event.action)).toEqual(['LICENSE_ASSIGNMENT.CREATED']);
    expect(forAssignment[0].after).toMatchObject({ source: 'REQUEST', requestId: task.requestId });
    expect(JSON.stringify(forAssignment[0].after)).not.toContain('e-7@acme.vn');
    expect(forTask.map((event) => event.action)).toEqual(['PROVISIONING_TASK.CREATED']);
    expect(forTask[0]).toMatchObject({
      actor_app_user_id: h.it1.appUserId,
      before: null,
      after: { requestId: task.requestId, channel: 'MANUAL', defaultResponsibleEmployeeId: a1Employee },
    });
  });

  it('AC-2 (US-07-01): two IT Admins granting the last seat at once: exactly one succeeds, the other is told the seats are gone', async () => {
    const { subscriptionId, planId } = await k2(1);

    const answers = await Promise.all([
      h.grant({ requestId: h.gate.grantable(e5, planId), subscriptionId }),
      h.grant({ requestId: h.gate.grantable(e7, planId), subscriptionId }),
    ]);

    expect(answers.map((answer) => answer.status).sort()).toEqual([201, 409]);
    const refused = answers.find((answer) => answer.status === 409);
    expect(refused && h.codeOf(refused)).toBe('LICENSE_ASSIGNMENT.SEAT_CAPACITY');
    expect(await tasksOf(subscriptionId)).toBe(1);
    expect(await h.freeSeats(subscriptionId)).toBe(0);
  });

  it('AC-4 (US-07-01): refuses a second seat for the person who already holds one on the subscription', async () => {
    const { subscriptionId, planId } = await k2();
    await h.granted(e5, planId, { subscriptionId });

    const second = await h.grant({ requestId: h.gate.grantable(e5, planId), subscriptionId }).expect(422);

    expect(h.codeOf(second)).toBe('LICENSE_ASSIGNMENT.OVERLAP');
    expect(await tasksOf(subscriptionId)).toBe(1);
  });

  it('AC-6 (US-07-01): grants a seat again after the old one ended, as a new assignment that leaves the old one whole', async () => {
    const { subscriptionId, planId } = await k2();
    const oldId = randomUUID();
    await h.ctx.sql.query(
      `INSERT INTO license_assignments (id, organization_id, kind, source, plan_id, subscription_id, employee_id,
         account_identifier, normalized_account_identifier, valid_from, valid_from_basis, valid_until,
         created_by_app_user_id)
       VALUES ($1, $2, 'PERSONAL', 'REQUEST', $3, $4, $5, 'e-6@acme.vn', 'e-6@acme.vn', '2026-01-05', 'ACTUAL',
         '2026-02-01', $6)`,
      [oldId, h.seed.organizationId, planId, subscriptionId, e6, randomUUID()],
    );

    const task = await h.granted(e6, planId, { subscriptionId });

    const rows = (
      await h.ctx.sql.query<{ id: string; predecessor_id: string | null; valid_until: string | null }>(
        `SELECT id, predecessor_id, to_char(valid_until, 'YYYY-MM-DD') AS valid_until
           FROM license_assignments WHERE subscription_id = $1 ORDER BY valid_from`,
        [subscriptionId],
      )
    ).rows;
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ id: oldId, predecessor_id: null });
    expect(rows[0].valid_until).toBe('2026-02-01');
    expect(rows[1]).toMatchObject({ id: task.assignmentId, predecessor_id: null, valid_until: null });
  });

  it('AC-7, AC-8 (US-07-01) and AC-4 (US-07-02): the card has the steps of the kind of provisioning, in the name of whoever works', async () => {
    const k1 = await h.subscription(5, 'K1');
    const k1Task = await h.granted(e5, await h.planOf(k1), { subscriptionId: k1 });
    const { subscriptionId, planId } = await k2();
    const k2Task = await h.granted(e5, planId, { subscriptionId });
    const k5Task = await h.granted(e5, await h.plan('K5'));

    expect(k1Task.steps).toEqual([
      { code: 'BUY_ON_COMPANY_ACCOUNT', accountIdentifier: 'e-5@acme.vn' },
      { code: 'CONFIRM_WITH_EVIDENCE' },
    ]);
    expect(k1Task.doneWhen).toBe('PURCHASE_CONFIRMED');
    expect(k2Task.steps).toEqual([
      { code: 'ADD_TO_WORKSPACE', accountIdentifier: 'e-5@acme.vn', adminIdentity: 'ACTING_IT_ADMIN' },
      { code: 'CONFIRM_WITH_EVIDENCE' },
    ]);
    expect(k2Task.doneWhen).toBe('MEMBER_ACTIVE');
    expect(k5Task.steps.map((step) => step.code)).toEqual(['GRANT_IN_INTERNAL_SOFTWARE', 'CONFIRM_WITH_EVIDENCE']);
  });

  it('AC-8 (US-07-01): no field of a grant can carry a password or any secret', async () => {
    const { subscriptionId, planId } = await k2();

    const response = await h
      .grant({ requestId: h.gate.grantable(e5, planId), subscriptionId, password: 'hunter2' })
      .expect(422);

    expect(h.codeOf(response)).toBe('VALIDATION_ERROR');
    expect(await tasksOf(subscriptionId)).toBe(0);
  });

  it('AC-11 (US-07-01): K5 needs no subscription, takes no seat anywhere, and refuses one if named', async () => {
    const k5 = await h.plan('K5');
    const { subscriptionId } = await k2();

    const task = await h.granted(e6, k5);

    expect(task).toMatchObject({ subscriptionId: null, plan: { provisioningType: 'K5' }, status: 'QUEUED' });
    expect(
      (
        await h.ctx.sql.query<{ subscription_id: string | null }>(
          `SELECT subscription_id FROM license_assignments WHERE id = $1`,
          [task.assignmentId],
        )
      ).rows[0].subscription_id,
    ).toBeNull();
    const named = await h.grant({ requestId: h.gate.grantable(e7, k5), subscriptionId }).expect(422);
    expect(h.codeOf(named)).toBe('PROVISIONING.SUBSCRIPTION_NOT_ALLOWED');
  });

  it('refuses a K1 or K2 grant with no subscription, with one of another plan, or with none that exists', async () => {
    const { planId } = await k2();
    const other = await h.subscription(5, 'K2');

    const none = await h.grant({ requestId: h.gate.grantable(e5, planId) }).expect(422);
    const mismatch = await h.grant({ requestId: h.gate.grantable(e5, planId), subscriptionId: other }).expect(422);
    const missing = await h
      .grant({ requestId: h.gate.grantable(e5, planId), subscriptionId: randomUUID() })
      .expect(404);

    expect(h.codeOf(none)).toBe('PROVISIONING.SUBSCRIPTION_REQUIRED');
    expect(h.codeOf(mismatch)).toBe('PROVISIONING.SUBSCRIPTION_PLAN_MISMATCH');
    expect(h.codeOf(missing)).toBe('SUBSCRIPTION.NOT_FOUND');
    expect(await tasksOf(other)).toBe(0);
  });

  it('refuses K4, which needs the key store and a company device, and keeps no assignment or task', async () => {
    const subscriptionId = await h.subscription(5, 'K4');
    const planId = await h.planOf(subscriptionId);

    const refused = await h.grant({ requestId: h.gate.grantable(e5, planId), subscriptionId }).expect(409);

    expect(h.codeOf(refused)).toBe('PROVISIONING.TYPE_NOT_SUPPORTED');
    expect(h.detailsOf(refused)).toMatchObject({ provisioningType: 'K4' });
    expect(await tasksOf(subscriptionId)).toBe(0);
  });

  it('AC-9 (US-07-01): grants only to a company account: a personal one, another company or no work email is refused', async () => {
    const { subscriptionId, planId } = await k2();
    const noMail = await h.member('P-DES', 'E-NOMAIL', designer);
    await h.ctx.sql.query(`UPDATE employees SET work_email = NULL, normalized_work_email = NULL WHERE id = $1`, [
      noMail,
    ]);
    const attempts = [
      () =>
        h.grant({ requestId: h.gate.grantable(e5, planId), subscriptionId, accountIdentifier: 'e5.private@gmail.com' }),
      () => h.grant({ requestId: h.gate.grantable(e5, planId), subscriptionId, accountIdentifier: 'e5@khac.vn' }),
      () => h.grant({ requestId: h.gate.grantable(noMail, planId), subscriptionId }),
    ];

    for (const attempt of attempts) {
      const refused = await attempt().expect(422);
      expect(h.codeOf(refused)).toBe('PROVISIONING.PERSONAL_ACCOUNT');
    }
    expect(await tasksOf(subscriptionId)).toBe(0);
    expect(await h.freeSeats(subscriptionId)).toBe(5);

    const alias = await h.granted(e5, planId, { subscriptionId, accountIdentifier: 'e5.alias@acme.vn' });
    expect(alias.accountIdentifier).toBe('e5.alias@acme.vn');
  });

  it('AC-17 (US-07-01): does not grant to someone who has left, and points to closing the request as cancelled', async () => {
    const { subscriptionId, planId } = await k2();
    const gone = await h.member('P-DES', 'E-GONE', designer);
    await h.ctx.sql.query(`UPDATE employees SET status = 'TERMINATED' WHERE id = $1`, [gone]);
    const requestId = h.gate.grantable(gone, planId);

    const refused = await h.grant({ requestId, subscriptionId }).expect(409);

    expect(h.codeOf(refused)).toBe('PROVISIONING.BENEFICIARY_DEPARTED');
    expect(h.detailsOf(refused)).toEqual({ requestId, nextStep: 'CANCEL_REQUEST' });
    expect(await assignmentsOf(gone)).toBe(0);
    expect(await tasksOf(subscriptionId)).toBe(0);
  });

  it('US-02-02 AC-15: does not grant to someone who starts after today, and writes nothing', async () => {
    const { subscriptionId, planId } = await k2();
    const newcomer = await h.member('P-DES', 'E-NEW', designer);
    const startsOn = (
      await h.ctx.sql.query<{ day: string }>(
        `UPDATE employees SET hire_date = $2::date + 3 WHERE id = $1 RETURNING to_char(hire_date, 'YYYY-MM-DD') AS day`,
        [newcomer, h.today()],
      )
    ).rows[0].day;
    const requestId = h.gate.grantable(newcomer, planId);

    const refused = await h.grant({ requestId, subscriptionId }).expect(409);

    expect(h.codeOf(refused)).toBe('PROVISIONING.BENEFICIARY_NOT_STARTED');
    expect(h.detailsOf(refused)).toEqual({ requestId, startsOn });
    expect(await assignmentsOf(newcomer)).toBe(0);
    expect(await tasksOf(subscriptionId)).toBe(0);

    await h.ctx.sql.query(`UPDATE employees SET hire_date = $2::date WHERE id = $1`, [newcomer, h.today()]);
    await h.grant({ requestId, subscriptionId }).expect(201);
  });

  it('AC-3, AC-16 (US-07-01): the way the gate answers is the way the grant refuses, and nothing is written', async () => {
    const { subscriptionId, planId } = await k2();
    const before = await count(`SELECT count(*) AS n FROM license_assignments`);
    const notApproved = h.gate.answer({ status: 'NOT_APPROVED' });
    const ended = h.gate.answer({ status: 'ENDED' });

    expect(h.codeOf(await h.grant({ requestId: notApproved, subscriptionId }).expect(409))).toBe(
      'PROVISIONING.REQUEST_NOT_APPROVED',
    );
    expect(h.codeOf(await h.grant({ requestId: ended, subscriptionId }).expect(409))).toBe(
      'PROVISIONING.REQUEST_ENDED',
    );
    expect(h.codeOf(await h.grant({ requestId: randomUUID(), subscriptionId }).expect(404))).toBe('REQUEST.NOT_FOUND');
    expect(
      h.codeOf(await h.grant({ requestId: h.gate.grantable(randomUUID(), planId), subscriptionId }).expect(404)),
    ).toBe('EMPLOYEE.NOT_FOUND');
    expect(h.codeOf(await h.grant({ requestId: h.gate.grantable(e5, randomUUID()), subscriptionId }).expect(404))).toBe(
      'PLAN.NOT_FOUND',
    );
    expect(await count(`SELECT count(*) AS n FROM license_assignments`)).toBe(before);
  });

  it('asks time-limited staff for the expected end date, which the seat needs (INV-07)', async () => {
    const { subscriptionId, planId } = await k2();
    const contractor = await h.member('P-DES', 'E-CONTRACT', designer);
    await h.ctx.sql.query(`UPDATE employees SET employment_type = 'CONTRACTOR' WHERE id = $1`, [contractor]);

    const without = await h.grant({ requestId: h.gate.grantable(contractor, planId), subscriptionId }).expect(422);
    expect(h.codeOf(without)).toBe('LICENSE_ASSIGNMENT.EXPECTED_END_REQUIRED');

    const withDate = await h.grant({
      requestId: h.gate.grantable(contractor, planId),
      subscriptionId,
      expectedEndDate: '2027-03-31',
    });
    expect(withDate.status).toBe(201);
  });

  it('US-01-11 AC-4: a department with no IT Admin in charge still gets the task, in the general queue, with a warning', async () => {
    const { subscriptionId, planId } = await k2();
    const response = await h.grant({ requestId: h.gate.grantable(e6, planId), subscriptionId }).expect(201);
    const { task, warnings } = h.dataOf<{
      task: { defaultResponsibleEmployeeId: string | null; inGeneralQueue: boolean };
      warnings: string[];
    }>(response);

    expect(task).toMatchObject({ defaultResponsibleEmployeeId: null, inGeneralQueue: true });
    expect(warnings).toEqual(['DEPARTMENT_WITHOUT_IT_ADMIN']);
  });

  it('is for the IT Admin only: Finance, an employee and the Super Admin are refused and nothing is written', async () => {
    const { subscriptionId, planId } = await k2();
    const superAdmin: ApiAccount = { ...h.it1, accessToken: h.admin };

    for (const account of [h.finance, h.employee, superAdmin]) {
      const refused = await h.grant({ requestId: h.gate.grantable(e5, planId), subscriptionId }, account).expect(403);
      expect(h.codeOf(refused)).toBe('AUTHORIZATION.FORBIDDEN');
    }
    expect(await tasksOf(subscriptionId)).toBe(0);
  });

  it('AC-13 (US-07-01): once the baseline is closed an assignment with no request is refused by the API and by the database, and one of a request still works', async () => {
    const { subscriptionId, planId } = await k2();
    const baselineRow = { employee_code: 'E-5', account_identifier: 'e-5@acme.vn' };
    expect(h.dataOf<{ id: string }>(await h.upload({ subscriptionId }, h.file([baselineRow])).expect(201)).id).toEqual(
      expect.any(String),
    );
    await request(h.server()).post('/api/v1/seat-baseline/close').set(h.as(h.it1)).expect(200);
    const held = await assignmentsOf(e5);

    expect(h.codeOf(await h.grant({ subscriptionId }).expect(422))).toBe('VALIDATION_ERROR');
    expect(h.codeOf(await h.upload({ subscriptionId }, h.file([baselineRow])).expect(409))).toBe(
      'SEAT_BASELINE.CLOSED',
    );
    // Not even a writer that skips the API can add a seat with no request: the database refuses the row.
    await expect(
      h.ctx.sql.query(
        `INSERT INTO license_assignments (id, organization_id, kind, source, plan_id, subscription_id, employee_id,
           account_identifier, normalized_account_identifier, valid_from, valid_from_basis, created_by_app_user_id)
         VALUES (gen_random_uuid(), $1, 'PERSONAL', 'BASELINE', $2, $3, $4, 'late@acme.vn', 'late@acme.vn', $5, 'RECORDED', $6)`,
        [h.seed.organizationId, planId, subscriptionId, e5, h.today(), randomUUID()],
      ),
    ).rejects.toMatchObject({ code: '55000' });
    expect(await tasksOf(subscriptionId)).toBe(0);
    expect(await assignmentsOf(e5)).toBe(held);

    const task = await h.granted(e5, planId, { subscriptionId });
    expect(task.status).toBe('QUEUED');
    expect(
      (
        await h.ctx.sql.query<{ source: string }>(`SELECT source FROM license_assignments WHERE id = $1`, [
          task.assignmentId,
        ])
      ).rows[0].source,
    ).toBe('REQUEST');
  });
});
