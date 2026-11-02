import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { AuthenticatedPrincipal } from '../../../src/infrastructure/security/tokens/access-token-verifier.port';
import { EmployeeForbiddenError } from '../../../src/modules/organization/employee/employee.errors';
import {
  EmployeeManualService,
  ManualEmployeeInput,
} from '../../../src/modules/organization/employee/employee-manual.service';
import { NotificationsApi } from '../../../src/modules/notifications/public/notifications.api';
import { bodyOf } from '../../support/api-body';
import {
  ACCOUNT_PASSWORD,
  ApiAccount,
  activateInvitedAccount,
  adminToken,
  createActivatedAccount,
  loginAs,
} from '../../support/api-accounts';
import { HttpTestApp, SeededInstallation, createHttpTestApp, seedInstallation } from '../../support/http-test-app';
import { findPlacementCoverageViolations } from '../../support/placement-coverage';

/** What a form carried before `QĐ-93f`: no entry takes an HR basis any more, so a body that still carries one is refused. */
const HR_BASIS_BODY = {
  type: 'LABOR_CONTRACT',
  reference: 'HD-2026-001',
  issuer: 'HR Department',
  issuedOn: '2026-10-01',
};

interface Reason {
  field: string;
  code: string;
}

interface EmployeeWire {
  id: string;
  employeeCode: string;
  fullName: string;
  workEmail: string | null;
  employmentType: string;
  hireDate: string;
  status: string;
  memberSince: string;
  department: { id: string; code: string; name: string };
  jobTitle: string | null;
}

describe('manual employee entry over HTTP (integration, real PostgreSQL)', () => {
  let ctx: HttpTestApp;
  let seed: SeededInstallation;
  let it1: ApiAccount;
  let finance: ApiAccount;
  let admin: string;
  let adminAccount: { appUserId: string; employeeId: string; employeeCode: string; email: string };
  let counter = 0;
  const server = () => ctx.app.getHttpServer();
  const asIt = () => ({ Authorization: `Bearer ${it1.accessToken}` });
  const asSuperAdmin = () => ({ Authorization: `Bearer ${admin}` });

  beforeAll(async () => {
    ctx = await createHttpTestApp();
    seed = await seedInstallation(ctx.app);
    admin = await adminToken(ctx, seed);
    it1 = await createActivatedAccount(ctx, seed, { code: 'E-IT1', email: 'it1@acme.vn', roles: ['IT_ADMIN'], admin });
    finance = await createActivatedAccount(ctx, seed, {
      code: 'E-FIN',
      email: 'fin@acme.vn',
      roles: ['FINANCE'],
      admin,
    });
    adminAccount = (
      await ctx.sql.query<{ appUserId: string; employeeId: string; employeeCode: string; email: string }>(
        `SELECT u.id AS "appUserId", e.id AS "employeeId", e.employee_code AS "employeeCode", e.work_email AS email
           FROM app_users u JOIN employees e ON e.id = u.employee_id
           JOIN role_grants g ON g.app_user_id = u.id AND g.role = 'SUPER_ADMIN' AND g.revoked_at IS NULL`,
      )
    ).rows[0];
  }, 120000);

  afterAll(async () => {
    await ctx?.close();
  });

  const row = (overrides: Record<string, unknown> = {}): ManualEmployeeInput => {
    counter += 1;

    return {
      employeeCode: `E-M${counter}`,
      fullName: `Manual Person ${counter}`,
      workEmail: `manual.${counter}@acme.vn`,
      employmentType: 'STAFF',
      hireDate: '2026-10-01',
      departmentCode: 'P-OPS',
      jobTitle: 'Administrator',
      ...overrides,
    };
  };

  const enter = (body: object, headers: Record<string, string> = asSuperAdmin()) =>
    request(server()).post('/api/v1/employees').set(headers).send(body);

  const reasonsOf = (response: request.Response): Reason[] =>
    (response.body as { error: { details: { reasons: Reason[] } } }).error.details.reasons;
  const errorCodeOf = (response: request.Response) => (response.body as { error: { code: string } }).error.code;
  const dataOf = (response: request.Response) => (response.body as { data: EmployeeWire }).data;

  /** Counts that a manual entry must leave alone: it creates a person, never a login, a role, a link or a mail. */
  const sideTables = async () =>
    (
      await ctx.sql.query(
        `SELECT (SELECT count(*)::int FROM app_users) AS accounts, (SELECT count(*)::int FROM role_grants) AS grants,
                (SELECT count(*)::int FROM account_action_tokens) AS tokens, (SELECT count(*)::int FROM email_outbox) AS mail,
                (SELECT count(*)::int FROM departments) AS departments, (SELECT count(*)::int FROM cost_centers) AS cost_centers`,
      )
    ).rows[0] as Record<string, number>;

  describe('a valid entry (US-02-02 AC-14)', () => {
    it('creates one employee with one placement, and no account, role, link or mail', async () => {
      const before = await sideTables();
      const employees = (await ctx.sql.query('SELECT count(*)::int AS n FROM employees')).rows[0] as { n: number };
      const placements = (await ctx.sql.query('SELECT count(*)::int AS n FROM employee_placements')).rows[0] as {
        n: number;
      };

      const response = await enter(row({ employeeCode: 'E-ONE', workEmail: 'One.Person@acme.vn' })).expect(201);

      expect((bodyOf(response) as unknown as { message: string }).message).toBe('EMPLOYEE.CREATED');
      expect(dataOf(response)).toMatchObject({
        employeeCode: 'E-ONE',
        workEmail: 'One.Person@acme.vn',
        employmentType: 'STAFF',
        hireDate: '2026-10-01',
        status: 'ACTIVE',
        department: { code: 'P-OPS', name: 'Operations' },
        jobTitle: 'Administrator',
      });
      expect(Object.keys(dataOf(response)).sort()).toEqual(
        [
          'department',
          'employeeCode',
          'employmentType',
          'fullName',
          'hireDate',
          'id',
          'jobTitle',
          'memberSince',
          'status',
          'workEmail',
          'workState',
        ].sort(),
      );
      expect(await sideTables()).toEqual(before);
      expect((await ctx.sql.query('SELECT count(*)::int AS n FROM employees')).rows[0]).toEqual({ n: employees.n + 1 });
      expect((await ctx.sql.query('SELECT count(*)::int AS n FROM employee_placements')).rows[0]).toEqual({
        n: placements.n + 1,
      });
      // The department's own cost center is what the person is charged to, when it has one; the client never sends one. The title
      // is the free text of the person and nothing else: there is no catalogue to name (QĐ-87e).
      const placement = await ctx.sql.query(
        `SELECT d.code, p.valid_to, e.job_title
           FROM employee_placements p JOIN departments d ON d.id = p.department_id JOIN employees e ON e.id = p.employee_id
          WHERE p.employee_id = $1`,
        [dataOf(response).id],
      );
      expect(placement.rows).toEqual([{ code: 'P-OPS', valid_to: null, job_title: 'Administrator' }]);
    });

    it('allows no work email, and records who entered the person (FR-8.3)', async () => {
      const response = await enter(row({ workEmail: undefined, employeeCode: 'E-NOMAIL' })).expect(201);

      expect(dataOf(response).workEmail).toBeNull();
      const audit = await ctx.sql.query<{
        actor_kind: string;
        actor_app_user_id: string;
        actor_roles: string[];
        before: unknown;
        after: Record<string, unknown>;
      }>(
        `SELECT actor_kind, actor_app_user_id, actor_roles, before, after FROM audit_events
          WHERE action = 'EMPLOYEE.CREATED' AND resource_id = $1`,
        [dataOf(response).id],
      );
      expect(audit.rows).toHaveLength(1);
      expect(audit.rows[0]).toMatchObject({
        actor_kind: 'USER',
        actor_app_user_id: adminAccount.appUserId,
        actor_roles: ['SUPER_ADMIN'],
        before: null,
        after: {
          employeeCode: 'E-NOMAIL',
          employmentType: 'STAFF',
          hireDate: '2026-10-01',
          department: 'P-OPS',
          jobTitle: 'Administrator',
        },
      });
      expect(audit.rows[0].after).not.toHaveProperty('hrBasis');
    });

    it('records exactly what was entered, with the department code, the title name and the day of membership', async () => {
      const response = await enter(row()).expect(201);
      const data = dataOf(response);

      const audit = await ctx.sql.query<{ before: unknown; after: Record<string, unknown> }>(
        `SELECT before, after FROM audit_events WHERE action = 'EMPLOYEE.CREATED' AND resource_id = $1`,
        [data.id],
      );
      expect(audit.rows).toEqual([
        {
          before: null,
          after: {
            employeeCode: data.employeeCode,
            fullName: data.fullName,
            workEmail: data.workEmail,
            employmentType: data.employmentType,
            hireDate: data.hireDate,
            department: data.department.code,
            jobTitle: data.jobTitle,
            memberSince: data.memberSince,
          },
        },
      ]);
    });

    it('accepts every employment type', async () => {
      for (const employmentType of ['STAFF', 'CONTRACTOR', 'FREELANCER', 'INTERN']) {
        expect(dataOf(await enter(row({ employmentType })).expect(201)).employmentType).toBe(employmentType);
      }
    });
  });

  describe('a refused entry: every reason of T-16 with its field, and nothing written', () => {
    it.each([
      ['no department', { departmentCode: undefined }, [{ field: 'departmentCode', code: 'DEPARTMENT_REQUIRED' }]],
      ['a blank department', { departmentCode: '  ' }, [{ field: 'departmentCode', code: 'DEPARTMENT_REQUIRED' }]],
      [
        'a department that does not exist',
        { departmentCode: 'P-NOPE' },
        [{ field: 'departmentCode', code: 'DEPARTMENT_NOT_FOUND' }],
      ],
      [
        'a job title longer than 255 characters',
        { jobTitle: 'x'.repeat(256) },
        [{ field: 'jobTitle', code: 'JOB_TITLE_TOO_LONG' }],
      ],
    ])('answers %s with 422 EMPLOYEE.ROW_INVALID', async (_name, overrides, reasons) => {
      const before = await sideTables();
      const people = (await ctx.sql.query<{ n: number }>('SELECT count(*)::int AS n FROM employees')).rows[0];

      const response = await enter(row(overrides)).expect(422);

      expect(errorCodeOf(response)).toBe('EMPLOYEE.ROW_INVALID');
      expect(reasonsOf(response)).toEqual(reasons);
      expect(await sideTables()).toEqual(before);
      expect((await ctx.sql.query('SELECT count(*)::int AS n FROM employees')).rows[0]).toEqual(people);
    });

    it('takes any job title that fits as free text, keeps it in its display form, and needs no catalogue (QĐ-87e)', async () => {
      const entered = dataOf(await enter(row({ jobTitle: '  Chief \u00a0 Happiness\tOfficer ' })).expect(201));
      const sameAgain = dataOf(await enter(row({ jobTitle: 'chief happiness officer' })).expect(201));

      expect([entered.jobTitle, sameAgain.jobTitle]).toEqual(['Chief Happiness Officer', 'chief happiness officer']);
    });

    it.each([
      ['no job title', { jobTitle: undefined }],
      ['a blank job title', { jobTitle: '   ' }],
      ['a null job title', { jobTitle: null }],
    ])(
      'is not refused for %s: the title is optional, and the person has none (QĐ-87e, F03)',
      async (_name, overrides) => {
        const response = await enter(row(overrides)).expect(201);

        expect(dataOf(response).jobTitle).toBeNull();
        expect(
          (await ctx.sql.query(`SELECT job_title FROM employees WHERE id = $1`, [dataOf(response).id])).rows,
        ).toEqual([{ job_title: null }]);
      },
    );

    it.each([
      ['GET', '/api/v1/job-titles'],
      ['POST', '/api/v1/job-titles'],
      ['PATCH', '/api/v1/job-titles/3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11'],
      ['POST', '/api/v1/job-titles/3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11/deactivate'],
      ['POST', '/api/v1/job-titles/3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11/reactivate'],
    ] as const)(
      'has no job title catalogue to keep: %s %s answers 404 like a route that does not exist (QĐ-87e)',
      async (method, path) => {
        const response = await request(server())
          [method === 'GET' ? 'get' : method === 'POST' ? 'post' : 'patch'](path)
          .set(asIt())
          .send({});

        expect(response.status).toBe(404);
      },
    );

    it('does not take the old body that names a catalogue entry: jobTitleId is a field the form no longer has (QĐ-87e)', async () => {
      const people = (await ctx.sql.query<{ n: number }>('SELECT count(*)::int AS n FROM employees')).rows[0];

      const response = await enter(row({ jobTitle: undefined, jobTitleId: randomUUID() })).expect(422);

      expect(errorCodeOf(response)).toBe('VALIDATION_ERROR');
      expect((await ctx.sql.query('SELECT count(*)::int AS n FROM employees')).rows[0]).toEqual(people);
    });

    it('refuses an employee code that is taken, and a work email that is taken however it is written', async () => {
      const first = row({ employeeCode: 'E-DUP', workEmail: 'dup.person@acme.vn' });
      await enter(first).expect(201);

      const sameCode = await enter(row({ employeeCode: 'E-DUP' })).expect(422);
      const sameEmail = await enter(row({ workEmail: '  DUP.Person@ACME.vn ' })).expect(422);

      expect(reasonsOf(sameCode)).toEqual([{ field: 'employeeCode', code: 'EMPLOYEE_CODE_TAKEN' }]);
      expect(reasonsOf(sameEmail)).toEqual([{ field: 'workEmail', code: 'WORK_EMAIL_TAKEN' }]);
    });

    it('reports every reason at once', async () => {
      await enter(row({ employeeCode: 'E-TWICE', workEmail: 'twice@acme.vn' })).expect(201);

      const response = await enter(
        row({
          employeeCode: 'E-TWICE',
          workEmail: 'twice@acme.vn',
          departmentCode: 'P-NOPE',
          jobTitle: 'x'.repeat(256),
        }),
      ).expect(422);

      expect(reasonsOf(response)).toEqual([
        { field: 'departmentCode', code: 'DEPARTMENT_NOT_FOUND' },
        { field: 'jobTitle', code: 'JOB_TITLE_TOO_LONG' },
        { field: 'employeeCode', code: 'EMPLOYEE_CODE_TAKEN' },
        { field: 'workEmail', code: 'WORK_EMAIL_TAKEN' },
      ]);
    });

    it('does not create a department or a cost center for a department it does not know (US-02-03 AC-5)', async () => {
      const before = await sideTables();

      await enter(row({ departmentCode: 'P-INVENTED' })).expect(422);

      const after = await sideTables();
      expect(after.departments).toBe(before.departments);
      expect(after.cost_centers).toBe(before.cost_centers);
    });

    it('refuses to enter the record of the Super Admin who is entering: their code, their email, however written (AC-18)', async () => {
      const before = await sideTables();

      const byCode = await enter(row({ employeeCode: adminAccount.employeeCode })).expect(422);
      const byEmail = await enter(row({ workEmail: ` ${adminAccount.email.toUpperCase()} ` })).expect(422);

      expect(reasonsOf(byCode)).toEqual([{ field: 'employeeCode', code: 'OWN_RECORD' }]);
      expect(reasonsOf(byEmail)).toEqual([{ field: 'workEmail', code: 'OWN_RECORD' }]);
      expect(await sideTables()).toEqual(before);
    });

    it('refuses a body that still carries an HR basis, which no entry takes since QĐ-93f, and writes nothing', async () => {
      const people = (await ctx.sql.query<{ n: number }>('SELECT count(*)::int AS n FROM employees')).rows[0];

      const response = await enter(row({ hrBasis: HR_BASIS_BODY })).expect(422);

      expect(errorCodeOf(response)).toBe('VALIDATION_ERROR');
      expect(JSON.stringify(response.body)).toContain('unrecognized_keys');
      expect((await ctx.sql.query('SELECT count(*)::int AS n FROM employees')).rows[0]).toEqual(people);
    });

    it.each([
      ['a work email that is not an email', { workEmail: 'not an email' }],
      ['a hire date that is not a date', { hireDate: '2026-02-30' }],
      ['an unknown employment type', { employmentType: 'BOSS' }],
      ['a field the form does not have', { costCenterId: '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11' }],
    ])('turns away %s as a malformed request, 422 VALIDATION_ERROR', async (_name, overrides) => {
      expect(errorCodeOf(await enter(row(overrides)).expect(422))).toBe('VALIDATION_ERROR');
    });
  });

  describe('when the person becomes a member of the department (US-02-02 AC-15, T-14)', () => {
    const actor = (): AuthenticatedPrincipal => ({
      subject: adminAccount.appUserId,
      appUserId: adminAccount.appUserId,
      sessionId: 'clock-test-session',
      employeeId: adminAccount.employeeId,
      directRoles: ['SUPER_ADMIN'],
      derivedRoles: [],
      roles: ['SUPER_ADMIN'],
    });
    const service = () => ctx.app.get(EmployeeManualService, { strict: false });
    const placementOf = async (employeeId: string) =>
      (
        await ctx.sql.query<{ valid_from: string; hire_date: string }>(
          `SELECT to_char(p.valid_from, 'YYYY-MM-DD') AS valid_from, to_char(e.hire_date, 'YYYY-MM-DD') AS hire_date
             FROM employee_placements p JOIN employees e ON e.id = p.employee_id WHERE e.id = $1`,
          [employeeId],
        )
      ).rows;
    // 18:30 UTC on 16 October is already 01:30 on 17 October in the organization's own calendar (UTC+7).
    const recordedAt = new Date('2026-10-16T18:30:00.000Z');
    /**
     * The service is given a fixed clock, but the row's own `created_at` is the real time. Moving it to the same
     * instant is what the system would have stored had it really been that moment, so the coverage check (which
     * reads `created_at`) sees what it would see in production.
     */
    const asIfRecordedAt = (employeeId: string) =>
      ctx.sql.query('UPDATE employees SET created_at = $2 WHERE id = $1', [employeeId, recordedAt]);

    it('counts from the day it is recorded, in the organization time zone, even when the hire date is later', async () => {
      const entered = await service().create(actor(), row({ hireDate: '2026-10-28' }), recordedAt);
      await asIfRecordedAt(entered.id);

      expect(entered.memberSince).toBe('2026-10-17');
      expect(await placementOf(entered.id)).toEqual([{ valid_from: '2026-10-17', hire_date: '2026-10-28' }]);
    });

    it('counts from the day it is recorded, even when the hire date is long past: no history is made up', async () => {
      const entered = await service().create(actor(), row({ hireDate: '2020-03-01' }), recordedAt);
      await asIfRecordedAt(entered.id);

      expect(entered.memberSince).toBe('2026-10-17');
      expect(await placementOf(entered.id)).toEqual([{ valid_from: '2026-10-17', hire_date: '2020-03-01' }]);
    });

    it('would catch a placement that starts on neither day: the check is not vacuous', async () => {
      const entered = await service().create(actor(), row({ hireDate: '2020-03-01' }), recordedAt);
      await asIfRecordedAt(entered.id);
      await ctx.sql.query(`UPDATE employee_placements SET valid_from = '2021-05-05' WHERE employee_id = $1`, [
        entered.id,
      ]);

      const violations = await findPlacementCoverageViolations(ctx.sql);

      expect(violations).toEqual([
        {
          employee_id: entered.id,
          problem: 'first placement does not start at hire date or at the day the employee was recorded',
        },
      ]);
      await ctx.sql.query(`UPDATE employee_placements SET valid_from = '2026-10-17' WHERE employee_id = $1`, [
        entered.id,
      ]);
    });

    it('uses the real clock when none is given', async () => {
      const response = await enter(row()).expect(201);

      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
      expect(dataOf(response).memberSince).toBe(today);
    });

    it('keeps I-2 true: every placement starts at the hire date or at the day it was recorded', async () => {
      await expect(findPlacementCoverageViolations(ctx.sql)).resolves.toEqual([]);
    });
  });

  describe('who may enter people', () => {
    it.each([
      ['the IT Admin', () => asIt()],
      ['the finance officer', () => ({ Authorization: `Bearer ${finance.accessToken}` })],
    ])('refuses %s with 403 and writes nothing (AC-14, QĐ-82i)', async (_name, headers) => {
      const before = await sideTables();
      const people = (await ctx.sql.query<{ n: number }>('SELECT count(*)::int AS n FROM employees')).rows[0];

      await enter(row(), headers()).expect(403);

      expect(await sideTables()).toEqual(before);
      expect((await ctx.sql.query('SELECT count(*)::int AS n FROM employees')).rows[0]).toEqual(people);
    });

    it('is told by the service, not only by the route: an actor that is not the Super Admin enters nobody (F13)', async () => {
      const before = await sideTables();
      const people = (await ctx.sql.query<{ n: number }>('SELECT count(*)::int AS n FROM employees')).rows[0];
      const itAdmin: AuthenticatedPrincipal = {
        subject: it1.appUserId,
        appUserId: it1.appUserId,
        sessionId: 'service-level-session',
        employeeId: it1.employeeId,
        directRoles: ['IT_ADMIN'],
        derivedRoles: [],
        roles: ['IT_ADMIN'],
      };

      await expect(ctx.app.get(EmployeeManualService, { strict: false }).create(itAdmin, row())).rejects.toBeInstanceOf(
        EmployeeForbiddenError,
      );

      expect(await sideTables()).toEqual(before);
      expect((await ctx.sql.query('SELECT count(*)::int AS n FROM employees')).rows[0]).toEqual(people);
    });
  });

  describe('the in-app notices of a new record (US-02-02 AC-17, F17)', () => {
    const noticesAbout = async (employeeId: string) =>
      (
        await ctx.sql.query<{ recipient_employee_id: string; params: Record<string, unknown> }>(
          `SELECT recipient_employee_id, params FROM in_app_notifications
            WHERE code = 'EMPLOYEE_PROFILE_CREATED' AND subject_id = $1 ORDER BY recipient_employee_id`,
          [employeeId],
        )
      ).rows;

    it('tells the head of the department and the IT Admin in charge, in the same transaction, with ids only', async () => {
      const department = (await ctx.sql.query<{ id: string }>(`SELECT id FROM departments WHERE code = 'P-OPS'`))
        .rows[0];
      // The department has the IT Admin in charge it needs (a usable one) and a head for the days of the entry.
      await ctx.sql.query(`UPDATE departments SET it_admin_employee_id = $2 WHERE id = $1`, [
        department.id,
        it1.employeeId,
      ]);
      const person = await ctx.sql.query<{ id: string }>(`SELECT id FROM employees WHERE employee_code = 'E-FIN'`);
      await ctx.sql.query(
        `INSERT INTO department_head_periods (id, organization_id, department_id, employee_id, valid_from)
         VALUES (gen_random_uuid(), $1, $2, $3, '2026-01-05')`,
        [seed.organizationId, department.id, person.rows[0].id],
      );

      const response = await enter(row({ employeeCode: 'E-NOTICED' })).expect(201);

      const notices = await noticesAbout(dataOf(response).id);
      expect(notices.map((notice) => notice.recipient_employee_id).sort()).toEqual(
        [it1.employeeId, person.rows[0].id].sort(),
      );
      for (const notice of notices) {
        expect(notice.params).toEqual({ employeeId: dataOf(response).id, departmentId: department.id });
      }
      await ctx.sql.query(`DELETE FROM department_head_periods WHERE department_id = $1`, [department.id]);
      await ctx.sql.query(`UPDATE departments SET it_admin_employee_id = NULL WHERE id = $1`, [department.id]);
    });

    it('tells nobody of a department that has no head and no IT Admin in charge, and writes nothing for a refused entry', async () => {
      const entered = await enter(row({ employeeCode: 'E-QUIET' })).expect(201);
      await enter(row({ employeeCode: 'E-QUIET', departmentCode: 'P-NOPE' })).expect(422);

      expect(await noticesAbout(dataOf(entered).id)).toEqual([]);
      expect(
        (
          await ctx.sql.query(
            `SELECT 1 FROM in_app_notifications WHERE code = 'EMPLOYEE_PROFILE_CREATED' AND subject_id IS NULL`,
          )
        ).rows,
      ).toEqual([]);
    });

    // F17: the notices are written in the transaction of the record. The inbox refuses the SECOND notice, after the first was written:
    // the record goes with it (nothing created, no audit) and the first notice goes too (a record that was rolled back tells nobody).
    it('rolls the record back when a notice fails, and leaves no notice of a record that was rolled back', async () => {
      const department = (await ctx.sql.query<{ id: string }>(`SELECT id FROM departments WHERE code = 'P-OPS'`))
        .rows[0];
      await ctx.sql.query(`UPDATE departments SET it_admin_employee_id = $2 WHERE id = $1`, [
        department.id,
        it1.employeeId,
      ]);
      const head = await ctx.sql.query<{ id: string }>(`SELECT id FROM employees WHERE employee_code = 'E-FIN'`);
      await ctx.sql.query(
        `INSERT INTO department_head_periods (id, organization_id, department_id, employee_id, valid_from)
         VALUES (gen_random_uuid(), $1, $2, $3, '2026-01-05')`,
        [seed.organizationId, department.id, head.rows[0].id],
      );
      const countOf = async (text: string) => (await ctx.sql.query<{ n: number }>(text)).rows[0].n;
      const notices = () =>
        countOf(`SELECT count(*)::int AS n FROM in_app_notifications WHERE code = 'EMPLOYEE_PROFILE_CREATED'`);
      const audited = () => countOf(`SELECT count(*)::int AS n FROM audit_events WHERE action = 'EMPLOYEE.CREATED'`);
      const [noticesBefore, auditedBefore] = [await notices(), await audited()];
      const inbox = ctx.app.get(NotificationsApi, { strict: false });
      const written = inbox.notifyInApp.bind(inbox);
      let calls = 0;
      const failing = jest.spyOn(inbox, 'notifyInApp').mockImplementation((tx, input) => {
        calls += 1;

        return calls === 2 ? Promise.reject(new Error('the inbox refused the second notice')) : written(tx, input);
      });
      let status: number;
      try {
        status = (await enter(row({ employeeCode: 'E-ROLLED' }))).status;
      } finally {
        failing.mockRestore();
        await ctx.sql.query(`DELETE FROM department_head_periods WHERE department_id = $1`, [department.id]);
        await ctx.sql.query(`UPDATE departments SET it_admin_employee_id = NULL WHERE id = $1`, [department.id]);
      }

      expect(status).toBe(500);
      expect(calls).toBe(2);
      expect((await ctx.sql.query(`SELECT 1 FROM employees WHERE employee_code = 'E-ROLLED'`)).rows).toEqual([]);
      expect(await audited()).toBe(auditedBefore);
      expect(await notices()).toBe(noticesBefore);
    });
  });

  describe('the first Finance officer (QĐ-67c, QĐ-73b)', () => {
    it('is entered by hand by the Super Admin, given an account and the FINANCE role by them, and signs in', async () => {
      // An installation holds one Finance officer (QĐ-52d). The one this suite made to prove a refusal steps down.
      await request(server())
        .delete(`/api/v1/app-users/${finance.appUserId}/role-grants/FINANCE`)
        .set({ Authorization: `Bearer ${admin}` })
        .expect(200);
      const entered = await enter(
        row({ employeeCode: 'E-FIRST-FIN', workEmail: 'first.finance@acme.vn', fullName: 'First Finance' }),
      ).expect(201);
      const employeeId = dataOf(entered).id;

      const account = await request(server())
        .post('/api/v1/app-users')
        .set({ Authorization: `Bearer ${admin}` })
        .send({ employeeId, roles: ['FINANCE'] })
        .expect(201);
      const appUserId = (account.body as { data: { id: string } }).data.id;
      await activateInvitedAccount(ctx, appUserId);
      const token = await loginAs(ctx.app, 'first.finance@acme.vn', ACCOUNT_PASSWORD);

      const me = await request(server()).get('/api/v1/me').set('Authorization', `Bearer ${token}`).expect(200);
      expect((me.body as { data: unknown }).data).toMatchObject({
        loginEmail: 'first.finance@acme.vn',
        employee: {
          id: employeeId,
          employeeCode: 'E-FIRST-FIN',
          department: { code: 'P-OPS' },
          jobTitle: 'Administrator',
        },
        roles: { direct: ['FINANCE'], effective: ['FINANCE'] },
        selfServiceOnly: false,
      });
    });
  });

  it('leaves every employee with a coherent placement history (I-2 coverage)', async () => {
    await expect(findPlacementCoverageViolations(ctx.sql)).resolves.toEqual([]);
  });
});
