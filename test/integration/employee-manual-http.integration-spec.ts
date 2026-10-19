import request from 'supertest';
import type { AuthenticatedPrincipal } from '../../src/infrastructure/security/tokens/access-token-verifier.port';
import {
  EmployeeManualService,
  ManualEmployeeInput,
} from '../../src/modules/organization/employee/employee-manual.service';
import { bodyOf } from '../support/api-body';
import {
  ACCOUNT_PASSWORD,
  ApiAccount,
  activateInvitedAccount,
  adminToken,
  createActivatedAccount,
  loginAs,
} from '../support/api-accounts';
import { HttpTestApp, SeededInstallation, createHttpTestApp, seedInstallation } from '../support/http-test-app';
import { findPlacementCoverageViolations } from '../support/placement-coverage';

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
  jobTitle: { id: string; name: string };
}

describe('manual employee entry over HTTP (integration, real PostgreSQL)', () => {
  let ctx: HttpTestApp;
  let seed: SeededInstallation;
  let it1: ApiAccount;
  let finance: ApiAccount;
  let admin: string;
  let counter = 0;
  const server = () => ctx.app.getHttpServer();
  const asIt = () => ({ Authorization: `Bearer ${it1.accessToken}` });

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
      jobTitleId: seed.jobTitleId,
      ...overrides,
    };
  };

  const enter = (body: object, headers: Record<string, string> = asIt()) =>
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
                (SELECT count(*)::int FROM departments) AS departments, (SELECT count(*)::int FROM cost_centers) AS cost_centers,
                (SELECT count(*)::int FROM job_titles) AS job_titles`,
      )
    ).rows[0] as Record<string, number>;

  const createTitle = async (name: string): Promise<string> =>
    (
      (await request(server()).post('/api/v1/job-titles').set(asIt()).send({ name }).expect(201)).body as {
        data: { id: string };
      }
    ).data.id;

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
        jobTitle: { id: seed.jobTitleId, name: 'Administrator' },
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
        ].sort(),
      );
      expect(await sideTables()).toEqual(before);
      expect((await ctx.sql.query('SELECT count(*)::int AS n FROM employees')).rows[0]).toEqual({ n: employees.n + 1 });
      expect((await ctx.sql.query('SELECT count(*)::int AS n FROM employee_placements')).rows[0]).toEqual({
        n: placements.n + 1,
      });
      // The department's own cost center is what the person is charged to; the client never sends one.
      const placement = await ctx.sql.query(
        `SELECT d.code, p.valid_to, p.job_title_id FROM employee_placements p JOIN departments d ON d.id = p.department_id
          WHERE p.employee_id = $1`,
        [dataOf(response).id],
      );
      expect(placement.rows).toEqual([{ code: 'P-OPS', valid_to: null, job_title_id: seed.jobTitleId }]);
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
        actor_app_user_id: it1.appUserId,
        actor_roles: ['IT_ADMIN'],
        before: null,
        after: {
          employeeCode: 'E-NOMAIL',
          employmentType: 'STAFF',
          hireDate: '2026-10-01',
          department: 'P-OPS',
          jobTitle: 'Administrator',
        },
      });
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
            jobTitle: data.jobTitle.name,
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
      ['no job title', { jobTitleId: undefined }, [{ field: 'jobTitleId', code: 'JOB_TITLE_REQUIRED' }]],
      [
        'a job title that does not exist',
        { jobTitleId: '4f24d10d-63ad-49b1-a7a1-c988765990ae' },
        [{ field: 'jobTitleId', code: 'JOB_TITLE_NOT_FOUND' }],
      ],
      [
        'a job title id that is not an id',
        { jobTitleId: 'not-an-id' },
        [{ field: 'jobTitleId', code: 'JOB_TITLE_NOT_FOUND' }],
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

    it('refuses a deactivated job title, and takes the person once it is reactivated (US-02-07 AC-7, AC-8)', async () => {
      const titleId = await createTitle('Seasonal Hire');
      await request(server()).post(`/api/v1/job-titles/${titleId}/deactivate`).set(asIt()).expect(200);

      const refused = await enter(row({ jobTitleId: titleId })).expect(422);

      expect(reasonsOf(refused)).toEqual([{ field: 'jobTitleId', code: 'JOB_TITLE_INACTIVE' }]);
      await request(server()).post(`/api/v1/job-titles/${titleId}/reactivate`).set(asIt()).expect(200);
      await enter(row({ jobTitleId: titleId })).expect(201);
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
        row({ employeeCode: 'E-TWICE', workEmail: 'twice@acme.vn', departmentCode: 'P-NOPE', jobTitleId: undefined }),
      ).expect(422);

      expect(reasonsOf(response)).toEqual([
        { field: 'departmentCode', code: 'DEPARTMENT_NOT_FOUND' },
        { field: 'jobTitleId', code: 'JOB_TITLE_REQUIRED' },
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
      subject: it1.appUserId,
      appUserId: it1.appUserId,
      sessionId: 'clock-test-session',
      employeeId: it1.employeeId,
      directRoles: ['IT_ADMIN'],
      derivedRoles: [],
      roles: ['IT_ADMIN'],
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
      ['the Super Admin', () => ({ Authorization: `Bearer ${admin}` })],
      ['the finance officer', () => ({ Authorization: `Bearer ${finance.accessToken}` })],
    ])('refuses %s with 403 and writes nothing', async (_name, headers) => {
      const before = await sideTables();
      const people = (await ctx.sql.query<{ n: number }>('SELECT count(*)::int AS n FROM employees')).rows[0];

      await enter(row(), headers()).expect(403);

      expect(await sideTables()).toEqual(before);
      expect((await ctx.sql.query('SELECT count(*)::int AS n FROM employees')).rows[0]).toEqual(people);
    });
  });

  describe('the first Finance officer (QĐ-67c, QĐ-73b)', () => {
    it('is entered by hand by an IT Admin, given an account and the FINANCE role by the Super Admin, and signs in', async () => {
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
