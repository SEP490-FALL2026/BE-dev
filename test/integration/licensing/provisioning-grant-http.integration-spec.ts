import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { ApiAccount } from '../../support/api-accounts';
import { effectiveEndOf } from '../../../src/core/term-limit';
import { pretendBusinessToday } from '../../support/pretend-today';
import { ProvisioningHarness } from '../../support/provisioning-harness';

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
    await h.account('E-A1', a1Employee, 'IT_ADMIN');
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

  // Rewritten for P0-05: the subscription is optional (it was 422 SUBSCRIPTION_REQUIRED); the cases of another plan and of none that exists stay.
  it('takes the subscription of the plan when a K1 or K2 grant names none; refuses one of another plan, or none that exists, or a plan with nothing to take a seat from', async () => {
    const { subscriptionId: own, planId } = await k2();
    const other = await h.subscription(5, 'K2');

    const none = await h.grant({ requestId: h.gate.grantable(e5, planId) }).expect(201);
    const mismatch = await h.grant({ requestId: h.gate.grantable(e6, planId), subscriptionId: other }).expect(422);
    const missing = await h
      .grant({ requestId: h.gate.grantable(e6, planId), subscriptionId: randomUUID() })
      .expect(404);
    const draftPlan = await h.planOf(await h.draftSubscription('K2'));
    const nothing = await h.grant({ requestId: h.gate.grantable(e6, draftPlan) }).expect(404);

    expect(h.dataOf<{ task: { subscriptionId: string } }>(none).task.subscriptionId).toBe(own);
    expect(h.codeOf(mismatch)).toBe('PROVISIONING.SUBSCRIPTION_PLAN_MISMATCH');
    expect(h.codeOf(missing)).toBe('SUBSCRIPTION.NOT_FOUND');
    expect(h.codeOf(nothing)).toBe('SUBSCRIPTION.NOT_FOUND');
    expect(await tasksOf(other)).toBe(0);
  });

  // Rewritten for BR-MF1-09 / QĐ-103d: K4 is granted from the key pool (k4-key-pool-grant.integration-spec.ts); K3 stays refused.
  it('refuses K3, which is only specified, and keeps no assignment or task', async () => {
    const subscriptionId = await h.subscription(5, 'K4');
    const planId = await h.planOf(subscriptionId);
    await h.ctx.sql.query(`UPDATE plans SET provisioning_type = 'K3', pricing_model = NULL WHERE id = $1`, [planId]);

    const refused = await h.grant({ requestId: h.gate.grantable(e5, planId), subscriptionId }).expect(409);

    expect(h.codeOf(refused)).toBe('PROVISIONING.TYPE_NOT_SUPPORTED');
    expect(h.detailsOf(refused)).toMatchObject({ provisioningType: 'K3' });
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

  describe('the end of the seat comes from the request (INV-07, R-15, QĐ-98)', () => {
    /** The seat of a person of the request, as the database keeps it. */
    const seatEndOf = async (employeeId: string) =>
      (
        await h.ctx.sql.query<{ expected_end_date: string | null }>(
          `SELECT expected_end_date::text FROM license_assignments WHERE employee_id = $1`,
          [employeeId],
        )
      ).rows.map((row) => row.expected_end_date);
    /** The last day of the term the request asked for (6 months in `grantable`): never cut at the end of the calendar year (`QĐ-104a`). */
    const termEnd = () => effectiveEndOf({ start: h.today(), months: 6 });

    it.each([
      ['a contractor', 'CONTRACTOR'],
      ['an intern', 'INTERN'],
      ['an employee', 'STAFF'],
    ])('gives the seat of %s the last day of the term, today plus the months minus a day', async (_name, type) => {
      const { subscriptionId, planId } = await k2();
      const person = await h.member('P-DES', `E-END-${type}`, designer);
      await h.ctx.sql.query(`UPDATE employees SET employment_type = $2 WHERE id = $1`, [person, type]);

      await h.grant({ requestId: h.gate.grantable(person, planId), subscriptionId }).expect(201);

      expect(await seatEndOf(person)).toEqual([termEnd()]);
    });

    it('gives the seat of free internal software no end by term: it costs nothing and has no term to bind (R-H1)', async () => {
      const planId = await h.plan('K5');
      const person = await h.member('P-DES', 'E-END-FREE', designer);
      const requestId = h.gate.answer({
        status: 'GRANTABLE',
        seat: 'PERSONAL',
        employeeId: person,
        planId,
        departmentId: h.gate.defaultDepartmentId,
        expectedEndDate: null,
        termMonths: 6,
        termBound: false,
      });

      await h.grant({ requestId }).expect(201);

      expect(await seatEndOf(person)).toEqual([null]);
    });

    it('does not cut the end at the end of the calendar year, even when the subscription the seat is taken on is flexible (R-D03)', async () => {
      const { subscriptionId, planId } = await k2();
      await h.ctx.sql.query(`UPDATE subscriptions SET allows_mid_term_reduction = true WHERE id = $1`, [
        subscriptionId,
      ]);
      const person = await h.member('P-DES', 'E-END-FLEX', designer);
      // A fixed day, so that the six months cross 31/12 whatever day the suite runs on (F-010).
      pretendBusinessToday(h.ctx.app, '2026-11-15');
      try {
        await h.grant({ requestId: h.gate.grantable(person, planId), subscriptionId }).expect(201);
      } finally {
        jest.restoreAllMocks();
      }

      expect(await seatEndOf(person)).toEqual(['2027-05-14']);
    });

    it('takes no end day in the body of the grant: the IT Admin has no authority to set the approved term', async () => {
      const { subscriptionId, planId } = await k2();
      const contractor = await h.member('P-DES', 'E-CONTRACT', designer);
      await h.ctx.sql.query(`UPDATE employees SET employment_type = 'CONTRACTOR' WHERE id = $1`, [contractor]);

      const refused = await h
        .grant({ requestId: h.gate.grantable(contractor, planId), subscriptionId, expectedEndDate: '2027-03-31' })
        .expect(422);

      expect(h.codeOf(refused)).toBe('VALIDATION_ERROR');
      expect(await assignmentsOf(contractor)).toBe(0);
    });
  });

  it('does not queue the grant of the own request of an IT Admin while another usable IT Admin can, and writes nothing (R-D1, QĐ-77m)', async () => {
    const { subscriptionId, planId } = await k2();
    const before = await count(`SELECT count(*) AS n FROM license_assignments`);
    const tasks = await tasksOf(subscriptionId);

    const refused = await h
      .grant({ requestId: h.gate.grantable(h.it1.employeeId, planId), subscriptionId })
      .expect(403);

    expect(h.codeOf(refused)).toBe('PROVISIONING.ANOTHER_IT_ADMIN_NEEDED');
    expect(await count(`SELECT count(*) AS n FROM license_assignments`)).toBe(before);
    expect(await tasksOf(subscriptionId)).toBe(tasks);
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

  describe('the day the right begins is the day the task of the grant is completed (BR-MF1-06a, RV-04, S1-01)', () => {
    const seat = async (assignmentId: string) =>
      (
        await h.ctx.sql.query<{ valid_from: string; granted_on: string | null; expected_end_date: string | null }>(
          `SELECT to_char(valid_from, 'YYYY-MM-DD') AS valid_from, to_char(granted_on, 'YYYY-MM-DD') AS granted_on,
                  to_char(expected_end_date, 'YYYY-MM-DD') AS expected_end_date
             FROM license_assignments WHERE id = $1`,
          [assignmentId],
        )
      ).rows[0];
    const grantableTo = (employeeId: string, planId: string, expectedEndDate: string | null) =>
      h.gate.answer({
        status: 'GRANTABLE',
        seat: 'PERSONAL',
        employeeId,
        planId,
        departmentId: h.gate.defaultDepartmentId,
        expectedEndDate,
        termMonths: 0,
        termBound: expectedEndDate !== null,
      });

    it('BR-MF1-06a: a request made on 10/11 and granted on 13/11 begins on 13/11: granted_on is written, valid_from is not touched', async () => {
      const { subscriptionId, planId } = await k2();
      const person = await h.member('P-DES', 'E-GRANTED', designer);
      pretendBusinessToday(h.ctx.app, '2026-11-10');
      let task;
      try {
        task = await h.granted(person, planId, { subscriptionId });
        expect(await seat(task.assignmentId)).toMatchObject({ valid_from: '2026-11-10', granted_on: null });
        pretendBusinessToday(h.ctx.app, '2026-11-13');
        await h.claim(task.id).expect(200);
        await h.complete(task.id, { evidence: 'The account was added by hand' }).expect(200);
      } finally {
        jest.restoreAllMocks();
      }

      expect(await seat(task.assignmentId)).toMatchObject({ valid_from: '2026-11-10', granted_on: '2026-11-13' });
    });

    it('BR-MF1-06a: the end is the end the request asked for, a year from the completion at the latest (QĐ-106b)', async () => {
      const { subscriptionId, planId } = await k2();
      const early = await h.member('P-DES', 'E-GRANTED-EARLY', designer);
      const late = await h.member('P-DES', 'E-GRANTED-LATE', designer);
      pretendBusinessToday(h.ctx.app, '2026-11-10');
      const tasks = [];
      try {
        // 09/11/2027 is the longest end a request sent on 10/11/2026 may ask for; a seat asked to end later is cut a year after completion.
        tasks.push(await h.grant({ requestId: grantableTo(early, planId, '2027-11-09'), subscriptionId }).expect(201));
        tasks.push(await h.grant({ requestId: grantableTo(late, planId, '2028-02-01'), subscriptionId }).expect(201));
        const [first, second] = tasks.map(
          (response) => h.dataOf<{ task: { id: string; assignmentId: string } }>(response).task,
        );
        pretendBusinessToday(h.ctx.app, '2026-11-13');
        await h.claim(first.id).expect(200);
        await h.claim(second.id).expect(200);
        await h.complete(first.id, { evidence: 'Done' }).expect(200);
        await h.complete(second.id, { evidence: 'Done' }).expect(200);

        expect((await seat(first.assignmentId)).expected_end_date).toBe('2027-11-09');
        expect((await seat(second.assignmentId)).expected_end_date).toBe('2027-11-12');
      } finally {
        jest.restoreAllMocks();
      }
    });

    it('BR-MF1-06a: a seat with no end asked for keeps none when it is completed', async () => {
      const { subscriptionId, planId } = await k2();
      const person = await h.member('P-DES', 'E-GRANTED-OPEN', designer);
      const task = h.dataOf<{ task: { id: string; assignmentId: string } }>(
        await h.grant({ requestId: grantableTo(person, planId, null), subscriptionId }).expect(201),
      ).task;

      await h.claim(task.id).expect(200);
      await h.complete(task.id, { evidence: 'Done' }).expect(200);

      expect(await seat(task.assignmentId)).toMatchObject({ expected_end_date: null, granted_on: h.today() });
    });
  });
});
