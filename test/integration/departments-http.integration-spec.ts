import request from 'supertest';
import { Client } from 'pg';
import { ApiAccount, adminToken, createActivatedAccount } from '../support/api-accounts';
import {
  HttpTestApp,
  SeededInstallation,
  createHttpTestApp,
  insertEmployeeFixture,
  seedInstallation,
} from '../support/http-test-app';
import { OrganizationHistoryService } from '../../src/modules/organization/organization-history.service';
import { findPlacementCoverageViolations } from '../support/placement-coverage';
import { HR_BASIS } from '../support/hr-basis';
import { UseFacts, registerUseReaders } from '../support/organization-use-readers';

interface DepartmentWire {
  id: string;
  code: string;
  name: string;
  function: string | null;
  status: string;
  /** The Cost Center Finance created for the department; null while it has none (`QĐ-87d(1)`). */
  costCenter: { id: string; code: string; name: string; status: string } | null;
  itAdmin: { employeeId: string; employeeCode: string; fullName: string; usable: boolean } | null;
  head: { employeeId: string; employeeCode: string; fullName: string; since: string } | null;
  memberCount: number;
  warnings: string[];
  headHistory: { employeeCode: string; validFrom: string; validTo: string | null }[];
  projects: { id: string; name: string; description: string | null; status: string; departments: { code: string }[] }[];
  /** The person named to take over from a day after today; null when nobody is (`QĐ-87` `D-5`). */
  successor: { employeeId: string; employeeCode: string; since: string } | null;
  deactivatedAt: string | null;
}

interface ErrorBody {
  error: { code: string; details?: Record<string, unknown> };
}

const ORG_TIME_ZONE = 'Asia/Ho_Chi_Minh';

/** Today in the organization's calendar, like the application computes it. */
function today(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: ORG_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? '';

  return `${pick('year')}-${pick('month')}-${pick('day')}`;
}

function addDays(date: string, days: number): string {
  const moved = new Date(`${date}T00:00:00.000Z`);
  moved.setUTCDate(moved.getUTCDate() + days);

  return moved.toISOString().slice(0, 10);
}

describe('department profiles, heads and the derived MANAGER role over HTTP (integration, real PostgreSQL)', () => {
  let ctx: HttpTestApp;
  let seed: SeededInstallation;
  let admin: string;
  let finance: ApiAccount;
  let it1: ApiAccount;
  let it2: ApiAccount;
  let counter = 0;
  const server = () => ctx.app.getHttpServer();
  const asFinance = () => ({ Authorization: `Bearer ${finance.accessToken}` });
  const asIt = () => ({ Authorization: `Bearer ${it1.accessToken}` });
  const asAdmin = () => ({ Authorization: `Bearer ${admin}` });
  const as = (account: ApiAccount) => ({ Authorization: `Bearer ${account.accessToken}` });
  let useFacts: UseFacts;

  /**
   * Every change the Super Admin makes to a department or a project cites its HR basis (`QĐ-87b(1)`): the request carries one unless
   * the case names `hrBasis` itself (`hrBasis: undefined` leaves it out). Reads and the other routes go as they are.
   */
  const api = () => {
    const writes = (test: request.Test, path: string): request.Test =>
      /^\/api\/v1\/(departments|projects)/.test(path) ? test.send({ hrBasis: HR_BASIS }) : test;

    const agent = request(server());

    return {
      get: (path: string) => agent.get(path),
      delete: (path: string) => agent.delete(path),
      post: (path: string) => writes(agent.post(path), path),
      patch: (path: string) => writes(agent.patch(path), path),
    };
  };

  beforeAll(async () => {
    ctx = await createHttpTestApp();
    seed = await seedInstallation(ctx.app);
    admin = await adminToken(ctx, seed);
    finance = await createActivatedAccount(ctx, seed, {
      code: 'E-FIN',
      email: 'fin@acme.vn',
      roles: ['FINANCE'],
      admin,
    });
    it1 = await createActivatedAccount(ctx, seed, { code: 'E-IT1', email: 'it1@acme.vn', roles: ['IT_ADMIN'], admin });
    it2 = await createActivatedAccount(ctx, seed, { code: 'E-IT2', email: 'it2@acme.vn', roles: ['IT_ADMIN'], admin });
    // What keeps a department or a Cost Center in use lives in other modules: every group answers with nothing unless a case says so.
    useFacts = registerUseReaders(ctx.app);
  }, 120000);

  afterEach(() => {
    useFacts.openWork = [];
    useFacts.subscriptions = [];
  });

  afterAll(async () => {
    await ctx?.close();
  });

  const unique = (prefix: string): string => {
    counter += 1;

    return `${prefix}-${counter}`;
  };
  const errorOf = (response: request.Response) => (response.body as ErrorBody).error;
  const dataOf = (response: request.Response) => (response.body as { data: DepartmentWire }).data;
  const messageOf = (response: request.Response) => (response.body as { message: string }).message;

  /** What Finance sends to create the Cost Center of a department. */
  const createCostCenterFor = async (departmentId: string, kind = 'UNIT'): Promise<{ id: string; code: string }> => {
    const code = unique('CCX');
    const response = await api()
      .post('/api/v1/cost-centers')
      .set(asFinance())
      .send({ code, name: `Name of ${code}`, kind, departmentId })
      .expect(201);

    return { id: (response.body as { data: { id: string } }).data.id, code };
  };

  /** What the Super Admin sends to create a department: no Cost Center, and the HR basis it is created from. */
  const departmentBody = (overrides: Record<string, unknown> = {}) => ({
    code: unique('P'),
    name: 'Design',
    hrBasis: HR_BASIS,
    ...overrides,
  });
  const createDepartment = (body: object, headers: Record<string, string> = asAdmin()) =>
    api().post('/api/v1/departments').set(headers).send(body);
  /** A department with the Cost Center Finance created for it, as the profile shows it. */
  const newDepartment = async (overrides: Record<string, unknown> = {}): Promise<DepartmentWire> => {
    const created = dataOf(await createDepartment(departmentBody(overrides)).expect(201));
    await createCostCenterFor(created.id);

    return getDepartment(created.id);
  };
  const getDepartment = async (id: string, headers: Record<string, string> = asAdmin()): Promise<DepartmentWire> =>
    dataOf(await api().get(`/api/v1/departments/${id}`).set(headers).expect(200));

  /** A person entered into a department the way the IT Admin does, through the form. */
  const enter = async (departmentCode: string, overrides: Record<string, unknown> = {}) => {
    const code = unique('E-D');
    const body = {
      employeeCode: code,
      fullName: `Person ${code}`,
      workEmail: `${code.toLowerCase()}@acme.vn`,
      employmentType: 'STAFF',
      hireDate: '2026-10-01',
      departmentCode,
      jobTitle: 'Administrator',
      hrBasis: HR_BASIS,
      ...overrides,
    };
    const response = await api().post('/api/v1/employees').set(asAdmin()).send(body).expect(201);

    return { employeeId: (response.body as { data: { id: string } }).data.id, code, email: body.workEmail };
  };

  /** A member of the department with an account that holds no role. */
  const accountIn = async (departmentCode: string): Promise<ApiAccount & { code: string }> => {
    const person = await enter(departmentCode);
    const account = await createActivatedAccount(ctx, seed, {
      code: person.code,
      email: person.email,
      roles: [],
      admin,
      employeeId: person.employeeId,
    });

    return { ...account, code: person.code };
  };

  const assignHead = (departmentId: string, employeeId: string, effectiveFrom = today(), headers = asAdmin()) =>
    api().post(`/api/v1/departments/${departmentId}/head-assignments`).set(headers).send({ employeeId, effectiveFrom });

  const rolesOf = async (account: ApiAccount): Promise<{ derived: string[]; effective: string[] }> =>
    (
      (await api().get('/api/v1/me').set(as(account)).expect(200)).body as {
        data: { roles: { derived: string[]; effective: string[] } };
      }
    ).data.roles;

  const auditOf = async (resourceId: string): Promise<{ action: string; before: unknown; after: unknown }[]> =>
    (
      await ctx.sql.query<{ action: string; before: unknown; after: unknown }>(
        'SELECT action, before, after FROM audit_events WHERE resource_id = $1 ORDER BY occurred_at, id',
        [resourceId],
      )
    ).rows;

  /** What the termination flow (a later slice) does: the person who has left has no open placement. */
  const closePlacements = (employeeId: string) =>
    ctx.sql.query('UPDATE employee_placements SET valid_to = $2 WHERE employee_id = $1 AND valid_to IS NULL', [
      employeeId,
      today(),
    ]);

  const rowCount = async (table: string): Promise<number> =>
    (await ctx.sql.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n;

  describe('creating a department (US-03-06 AC-1 → AC-3, QĐ-87d(1))', () => {
    it('creates one with no Cost Center, with who is in charge, records the HR basis, and shows the Cost Center Finance then creates for it (AC-1)', async () => {
      const body = departmentBody({
        name: '  Thiết kế ',
        function: 'thiết kế sản phẩm',
        itAdminEmployeeId: it1.employeeId,
      });

      const response = await createDepartment(body).expect(201);

      expect(messageOf(response)).toBe('DEPARTMENT.CREATED');
      expect(dataOf(response)).toMatchObject({
        code: body.code,
        name: 'Thiết kế',
        function: 'thiết kế sản phẩm',
        status: 'ACTIVE',
        costCenter: null,
        itAdmin: { employeeId: it1.employeeId, usable: true },
        head: null,
        memberCount: 0,
        warnings: ['MISSING_HEAD', 'MISSING_COST_CENTER'],
        successor: null,
        headHistory: [],
        headHistoryHasMore: false,
        projects: [],
        projectTotal: 0,
      });
      expect(await auditOf(dataOf(response).id)).toEqual([
        {
          action: 'DEPARTMENT.CREATED',
          before: null,
          after: {
            code: body.code,
            name: 'Thiết kế',
            function: 'thiết kế sản phẩm',
            itAdminEmployeeId: it1.employeeId,
            hrBasis: HR_BASIS,
          },
        },
      ]);

      // Finance creates the Cost Center FOR the department: it is the department's current one from then on.
      const costCenter = await createCostCenterFor(dataOf(response).id);
      expect((await getDepartment(dataOf(response).id)).costCenter).toMatchObject({
        id: costCenter.id,
        code: costCenter.code,
        status: 'ACTIVE',
      });
      const centers = await api().get(`/api/v1/cost-centers?search=${costCenter.code}`).set(asFinance()).expect(200);
      expect(
        (centers.body as { data: { items: { department: { code: string } | null }[] } }).data.items[0].department,
      ).toMatchObject({ code: body.code });
    });

    it("is the Super Admin's, takes the HR basis, and takes no Cost Center: anything else is turned back and nothing is created (QĐ-87b, QĐ-87d(1))", async () => {
      const before = await rowCount('departments');

      // A body that names a Cost Center, or has no HR basis, is not a body of this operation.
      const named = await createDepartment({
        ...departmentBody(),
        costCenterId: '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11',
      });
      const withoutBasis = await createDepartment({ code: unique('P'), name: 'Design', hrBasis: undefined });
      expect([named.status, withoutBasis.status]).toEqual([422, 422]);
      expect([errorOf(named).code, errorOf(withoutBasis).code]).toEqual(['VALIDATION_ERROR', 'VALIDATION_ERROR']);

      // Only the Super Admin creates a department: not the IT Admin, not Finance.
      expect((await createDepartment(departmentBody(), asIt())).status).toBe(403);
      expect((await createDepartment(departmentBody(), asFinance())).status).toBe(403);

      expect(await rowCount('departments')).toBe(before);
    });

    it('keeps the code unique and refuses a name that is empty or too long', async () => {
      const first = await newDepartment();

      const taken = await createDepartment(departmentBody({ code: first.code })).expect(409);
      const blank = await createDepartment(departmentBody({ name: '   ' })).expect(422);
      const long = await createDepartment(departmentBody({ name: 'N'.repeat(201) })).expect(422);

      expect(errorOf(taken).code).toBe('DEPARTMENT.CODE_TAKEN');
      expect(errorOf(blank).code).toBe('DEPARTMENT.NAME_INVALID');
      expect(errorOf(long).code).toBe('DEPARTMENT.NAME_INVALID');
    });

    it('refuses an IT Admin in charge who is not an IT Admin who can sign in (US-01-11)', async () => {
      const noAccount = await enter('P-OPS');

      for (const itAdminEmployeeId of [noAccount.employeeId, finance.employeeId, seed.superAdmin.employeeId]) {
        const response = await createDepartment(departmentBody({ itAdminEmployeeId })).expect(422);
        expect(errorOf(response).code).toBe('DEPARTMENT.IT_ADMIN_INVALID');
      }
      const left = await insertEmployeeFixture(ctx.app, seed, {
        code: unique('E-LEFT'),
        email: null,
        terminated: true,
      });
      await closePlacements(left.employeeId);
      const response = await createDepartment(departmentBody({ itAdminEmployeeId: left.employeeId })).expect(422);
      expect(errorOf(response).code).toBe('DEPARTMENT.IT_ADMIN_INVALID');
    });

    it('warns about a department with no IT Admin in charge, and about one with no head (AC-9, AC-15)', async () => {
      const created = await newDepartment();

      expect(created.itAdmin).toBeNull();
      expect(created.warnings.sort()).toEqual(['MISSING_HEAD', 'MISSING_IT_ADMIN']);
    });
  });

  describe('keeping the profile (AC-4, US-01-11 AC-7)', () => {
    it('renames, redescribes and changes who is in charge without touching the cost center or the members, and records before and after', async () => {
      const department = await newDepartment({ function: 'old duty', itAdminEmployeeId: it1.employeeId });
      const member = await enter(department.code);

      const response = await api()
        .patch(`/api/v1/departments/${department.id}`)
        .set(asAdmin())
        .send({ name: 'Sáng tạo', function: 'new duty', itAdminEmployeeId: it2.employeeId })
        .expect(200);

      expect(messageOf(response)).toBe('DEPARTMENT.UPDATED');
      expect(dataOf(response)).toMatchObject({
        name: 'Sáng tạo',
        function: 'new duty',
        itAdmin: { employeeId: it2.employeeId },
        costCenter: { id: department.costCenter?.id },
        memberCount: 1,
      });
      expect(
        (
          await ctx.sql.query(
            'SELECT 1 FROM employee_placements p JOIN employees e ON e.id = p.employee_id WHERE e.id = $1 AND p.department_id = $2',
            [member.employeeId, department.id],
          )
        ).rows,
      ).toHaveLength(1);
      expect((await auditOf(department.id))[1]).toEqual({
        action: 'DEPARTMENT.UPDATED',
        before: { name: 'Design', function: 'old duty', itAdminEmployeeId: it1.employeeId },
        after: { name: 'Sáng tạo', function: 'new duty', itAdminEmployeeId: it2.employeeId, hrBasis: HR_BASIS },
      });
    });

    it('can clear the IT Admin in charge, which brings the warning back (AC-15)', async () => {
      const department = await newDepartment({ itAdminEmployeeId: it1.employeeId });
      expect(department.warnings).not.toContain('MISSING_IT_ADMIN');

      const response = await api()
        .patch(`/api/v1/departments/${department.id}`)
        .set(asAdmin())
        .send({ itAdminEmployeeId: null })
        .expect(200);

      expect(dataOf(response).itAdmin).toBeNull();
      expect(dataOf(response).warnings).toContain('MISSING_IT_ADMIN');
    });

    it('answers a change that changes nothing with the profile and records nothing', async () => {
      const department = await newDepartment();

      await api()
        .patch(`/api/v1/departments/${department.id}`)
        .set(asAdmin())
        .send({ name: `  ${department.name} ` })
        .expect(200);

      expect(await auditOf(department.id)).toHaveLength(1);
    });

    it('refuses an empty change, a name that is empty, and an IT Admin who cannot be one', async () => {
      const department = await newDepartment();
      const patch = (body: object) => api().patch(`/api/v1/departments/${department.id}`).set(asAdmin()).send(body);

      expect(errorOf(await patch({}).expect(422)).code).toBe('DEPARTMENT.UPDATE_EMPTY');
      expect(errorOf(await patch({ name: ' ' }).expect(422)).code).toBe('DEPARTMENT.NAME_INVALID');
      expect(errorOf(await patch({ itAdminEmployeeId: finance.employeeId }).expect(422)).code).toBe(
        'DEPARTMENT.IT_ADMIN_INVALID',
      );
      expect(await auditOf(department.id)).toHaveLength(1);
    });

    it('is 404 for a department that does not exist', async () => {
      const response = await api()
        .patch('/api/v1/departments/3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11')
        .set(asAdmin())
        .send({ name: 'x' })
        .expect(404);

      expect(errorOf(response).code).toBe('DEPARTMENT.NOT_FOUND');
    });

    it('refuses Finance, an employee, a department head and the IT Admin, and changes nothing (AC-16, F10)', async () => {
      const department = await newDepartment();
      const head = await accountIn(department.code);
      await assignHead(department.id, head.employeeId).expect(200);
      const employee = await accountIn('P-OPS');

      for (const headers of [asFinance(), as(employee), as(head), asIt()]) {
        await api().patch(`/api/v1/departments/${department.id}`).set(headers).send({ name: 'Hacked' }).expect(403);
        await assignHead(department.id, employee.employeeId, today(), headers).expect(403);
      }
      // Creating a department is the Super Admin's (QĐ-87b): everyone else is refused, the IT Admin included.
      for (const headers of [asFinance(), as(employee), as(head), asIt()]) {
        await createDepartment(departmentBody(), headers).expect(403);
      }

      expect((await getDepartment(department.id)).name).toBe('Design');
    });

    it('takes no change without its HR basis, or with one that lacks a part: 422 and nothing written (QĐ-87b(1), F10)', async () => {
      const department = await newDepartment();
      const bases = [undefined, { ...HR_BASIS, reference: undefined }, { ...HR_BASIS, issuedOn: 'not a date' }];

      for (const hrBasis of bases) {
        const response = await api()
          .patch(`/api/v1/departments/${department.id}`)
          .set(asAdmin())
          .send({ name: 'No basis', hrBasis })
          .expect(422);
        expect(errorOf(response).code).toBe('VALIDATION_ERROR');
        await api()
          .post(`/api/v1/departments/${department.id}/deactivate`)
          .set(asAdmin())
          .send({ hrBasis })
          .expect(422);
        await api()
          .post(`/api/v1/departments/${department.id}/head-vacancies`)
          .set(asAdmin())
          .send({ effectiveFrom: today(), hrBasis })
          .expect(422);
      }

      expect(await auditOf(department.id)).toHaveLength(1);
      expect((await getDepartment(department.id)).name).toBe('Design');
    });
  });

  describe('listing and warnings (AC-9, AC-15)', () => {
    it('lists in code order with the head, the people count and the warnings, and filters by status', async () => {
      const department = await newDepartment();

      const response = await api()
        .get(`/api/v1/departments?search=${department.code.toLowerCase()}`)
        .set(asIt())
        .expect(200);
      const page = (response.body as { data: { items: DepartmentWire[]; pagination: { totalItems: number } } }).data;

      expect(page.items).toHaveLength(1);
      expect(page.items[0]).toMatchObject({ id: department.id, head: null, memberCount: 0 });
      expect(page.pagination.totalItems).toBe(1);
      const retired = (
        (await api().get('/api/v1/departments?status=INACTIVE').set(asIt()).expect(200)).body as {
          data: { items: DepartmentWire[] };
        }
      ).data.items;
      expect(retired.every((item) => item.status === 'INACTIVE')).toBe(true);
    });

    it('shows the IT Admin and the Super Admin the warnings, and nobody else (SoD-1)', async () => {
      const department = await newDepartment();

      for (const headers of [asIt(), asAdmin()]) {
        const response = await api().get('/api/v1/department-warnings').set(headers).expect(200);
        const items = (response.body as { data: { items: { departmentId: string; warning: string }[] } }).data.items;

        expect(
          items
            .filter((item) => item.departmentId === department.id)
            .map((item) => item.warning)
            .sort(),
        ).toEqual(['MISSING_HEAD', 'MISSING_IT_ADMIN']);
        expect(Object.keys(items[0]).sort()).toEqual(['code', 'departmentId', 'name', 'warning']);
      }
      await api().get('/api/v1/department-warnings').set(asFinance()).expect(403);
    });

    it('stops warning once the department has a head and an IT Admin in charge', async () => {
      const department = await newDepartment({ itAdminEmployeeId: it1.employeeId });
      const member = await enter(department.code);

      await assignHead(department.id, member.employeeId).expect(200);

      const response = await api().get('/api/v1/department-warnings').set(asIt()).expect(200);
      const items = (response.body as { data: { items: { departmentId: string }[] } }).data.items;
      expect(items.some((item) => item.departmentId === department.id)).toBe(false);
    });
  });

  describe('retiring a department (AC-19, AC-20)', () => {
    it('is refused while anyone is a member, naming them, and changes nothing', async () => {
      const department = await newDepartment();
      const member = await enter(department.code);

      const response = await api().post(`/api/v1/departments/${department.id}/deactivate`).set(asAdmin()).expect(409);

      const error = (response.body as { error: { code: string; message: string; details: Record<string, unknown> } })
        .error;
      expect(error.code).toBe('DEPARTMENT.IN_USE');
      expect(error.message).toBe(
        'The department still has members, service accounts, open work or subscriptions that owe a payment.',
      );
      // Members, the service accounts the department owns (QĐ-86c), open work and the subscriptions that owe a payment (US-03-06
      // AC-19, QĐ-90e), each with its total. Shared accounts are out of scope since QĐ-75, so that key is absent.
      expect(Object.keys(error.details).sort()).toEqual([
        'members',
        'openWork',
        'serviceAccounts',
        'subscriptions',
        'totalMembers',
        'totalOpenWork',
        'totalServiceAccounts',
        'totalSubscriptions',
      ]);
      expect(Object.hasOwn(error.details, 'sharedAccounts')).toBe(false);
      expect(response.text).not.toContain('sharedAccounts');
      expect(error.details).toEqual({
        totalMembers: 1,
        members: [{ employeeCode: member.code, fullName: expect.any(String) as unknown }],
        totalServiceAccounts: 0,
        serviceAccounts: [],
        openWork: [],
        totalOpenWork: 0,
        subscriptions: [],
        totalSubscriptions: 0,
      });
      expect((await getDepartment(department.id)).status).toBe('ACTIVE');
      expect(await auditOf(department.id)).toHaveLength(1);
    });

    it.each<[string, 'openWork' | 'subscriptions', string]>([
      ['a Request that is not over, a personnel event waiting or an open task', 'openWork', 'ACCESS_REQUEST'],
      ['a subscription or a purchase that still owes a payment', 'subscriptions', 'SUBSCRIPTION'],
    ])('is refused while it has %s, listing it with its total (QĐ-90e, F15)', async (_name, group, kind) => {
      const department = await newDepartment();
      useFacts[group] = Array.from({ length: 21 }, (_unused, index) => ({ kind, id: `${kind}-${index}`, label: null }));

      const error = errorOf(
        await api().post(`/api/v1/departments/${department.id}/deactivate`).set(asAdmin()).expect(409),
      );

      const details = error.details as Record<string, unknown>;
      const total = group === 'openWork' ? 'totalOpenWork' : 'totalSubscriptions';
      expect(error.code).toBe('DEPARTMENT.IN_USE');
      expect(details[total]).toBe(21);
      expect(details[group]).toHaveLength(20);
      expect((details[group] as { kind: string }[])[0]).toEqual({ kind, id: `${kind}-0`, label: null });
      expect(details.totalMembers).toBe(0);
      expect((await getDepartment(department.id)).status).toBe('ACTIVE');

      // Once the work is done or the subscription is cancelled or has ended, the department can be retired.
      useFacts[group] = [];
      await api().post(`/api/v1/departments/${department.id}/deactivate`).set(asAdmin()).expect(200);
    });

    it('retires an empty one, keeps its history, takes nobody in afterwards, and answers the same the second time', async () => {
      const department = await newDepartment();

      const first = await api().post(`/api/v1/departments/${department.id}/deactivate`).set(asAdmin()).expect(200);
      const second = await api().post(`/api/v1/departments/${department.id}/deactivate`).set(asAdmin()).expect(200);

      expect(dataOf(first)).toMatchObject({ status: 'INACTIVE', warnings: [] });
      expect(dataOf(second).deactivatedAt).toBe(dataOf(first).deactivatedAt);
      expect((await auditOf(department.id)).map((event) => event.action)).toEqual([
        'DEPARTMENT.CREATED',
        'DEPARTMENT.DEACTIVATED',
      ]);
      const entry = await api()
        .post('/api/v1/employees')
        .set(asAdmin())
        .send({
          hrBasis: HR_BASIS,
          employeeCode: unique('E-LATE'),
          fullName: 'Late Joiner',
          employmentType: 'STAFF',
          hireDate: '2026-10-01',
          departmentCode: department.code,
          jobTitle: 'Administrator',
        })
        .expect(422);
      expect((errorOf(entry).details as { reasons: unknown }).reasons).toEqual([
        { field: 'departmentCode', code: 'DEPARTMENT_INACTIVE' },
      ]);
      await api()
        .patch(`/api/v1/departments/${department.id}`)
        .set(asAdmin())
        .send({ name: 'Renamed after retirement' })
        .expect(409);
    });

    it('lets the database refuse a placement into a retired department, whatever the application does', async () => {
      const department = await newDepartment();
      await api().post(`/api/v1/departments/${department.id}/deactivate`).set(asAdmin()).expect(200);
      const person = await insertEmployeeFixture(ctx.app, seed, { code: unique('E-SQL'), email: null });

      await expect(
        ctx.sql.query(
          `INSERT INTO employee_placements (id, organization_id, employee_id, department_id, valid_from)
           VALUES (gen_random_uuid(), $1, $2, $3, '2099-01-01')`,
          [seed.organizationId, person.employeeId, department.id],
        ),
      ).rejects.toMatchObject({ code: '23514' });
    });

    it('has no way to merge or split departments, or to delete one: a retired department is all there is', async () => {
      const department = await newDepartment();

      for (const [method, path] of [
        ['post', '/api/v1/departments/merge'],
        ['post', `/api/v1/departments/${department.id}/split`],
        ['delete', `/api/v1/departments/${department.id}`],
      ] as const) {
        await api()[method](path).set(asAdmin()).send({}).expect(404);
      }
    });
  });

  describe('naming the head of a department (AC-5 → AC-9, AC-18)', () => {
    it('heads the department from today with a member, and records it (AC-5)', async () => {
      const department = await newDepartment();
      const member = await accountIn(department.code);

      const response = await assignHead(department.id, member.employeeId).expect(200);

      expect(messageOf(response)).toBe('DEPARTMENT.HEAD_ASSIGNED');
      expect(dataOf(response).head).toMatchObject({ employeeId: member.employeeId, since: today() });
      expect(dataOf(response).warnings).not.toContain('MISSING_HEAD');
      expect(dataOf(response).headHistory).toEqual([
        expect.objectContaining({ employeeCode: member.code, validFrom: today(), validTo: null }),
      ]);
      expect((await auditOf(department.id)).at(-1)).toMatchObject({
        action: 'DEPARTMENT.HEAD_ASSIGNED',
        before: { head: null },
        after: { head: member.code, effectiveFrom: today() },
      });
    });

    it('ends the head before the day the next one begins: one head on each day, no overlap (AC-5)', async () => {
      const department = await newDepartment();
      const first = await accountIn(department.code);
      const second = await accountIn(department.code);
      const from = addDays(today(), 3);
      await assignHead(department.id, first.employeeId).expect(200);

      const response = await assignHead(department.id, second.employeeId, from).expect(200);

      // Until day `from` the first is still the head; the second is the head from `from`.
      expect(dataOf(response).head).toMatchObject({ employeeCode: first.code });
      expect(dataOf(response).headHistory).toEqual([
        expect.objectContaining({ employeeCode: second.code, validFrom: from, validTo: null }),
        expect.objectContaining({ employeeCode: first.code, validFrom: today(), validTo: from }),
      ]);
      const overlap = await ctx.sql.query(
        `SELECT 1 FROM department_head_periods a JOIN department_head_periods b
           ON a.department_id = b.department_id AND a.id < b.id
          AND daterange(a.valid_from, a.valid_to, '[)') && daterange(b.valid_from, b.valid_to, '[)')
        WHERE a.department_id = $1`,
        [department.id],
      );
      expect(overlap.rows).toEqual([]);
    });

    it('replaces a head who has not begun yet, instead of leaving two plans on the same days', async () => {
      const department = await newDepartment();
      const planned = await accountIn(department.code);
      const instead = await accountIn(department.code);
      const from = addDays(today(), 5);
      await assignHead(department.id, planned.employeeId, from).expect(200);

      const response = await assignHead(department.id, instead.employeeId, addDays(today(), 2)).expect(200);

      expect(dataOf(response).headHistory).toEqual([
        expect.objectContaining({ employeeCode: instead.code, validFrom: addDays(today(), 2), validTo: null }),
      ]);
      expect((await auditOf(department.id)).at(-1)).toMatchObject({
        after: { cancelledPeriods: [`${planned.code}@${from}`] },
      });
    });

    it('answers the person who already heads it with the profile and records nothing', async () => {
      const department = await newDepartment();
      const head = await accountIn(department.code);
      await assignHead(department.id, head.employeeId).expect(200);
      const events = (await auditOf(department.id)).length;

      await assignHead(department.id, head.employeeId, addDays(today(), 4)).expect(200);

      expect(await auditOf(department.id)).toHaveLength(events);
      expect((await getDepartment(department.id)).headHistory).toHaveLength(1);
    });

    it('refuses a person who is not a member of the department on that day, and does not move them (AC-18)', async () => {
      const department = await newDepartment();
      const elsewhere = await accountIn('P-OPS');
      const first = await accountIn(department.code);
      await assignHead(department.id, first.employeeId).expect(200);

      const response = await assignHead(department.id, elsewhere.employeeId).expect(422);

      expect(errorOf(response).code).toBe('DEPARTMENT.HEAD_NOT_A_MEMBER_ON_DATE');
      expect((await getDepartment(department.id)).head).toMatchObject({ employeeCode: first.code });
      const placements = await ctx.sql.query(
        'SELECT department_id FROM employee_placements WHERE employee_id = $1 AND valid_to IS NULL',
        [elsewhere.employeeId],
      );
      expect(placements.rows).toEqual([{ department_id: seed.departmentId }]);
    });

    it('refuses a date before the person became a member, and a date in the past (AC-18)', async () => {
      const department = await newDepartment();
      const member = await accountIn(department.code);

      const past = await assignHead(department.id, member.employeeId, addDays(today(), -1)).expect(422);

      expect(errorOf(past).code).toBe('DEPARTMENT.HEAD_DATE_IN_PAST');
      expect((await getDepartment(department.id)).head).toBeNull();
    });

    it('refuses the Super Admin as a head and leaves the department as it was (AC-7)', async () => {
      const response = await assignHead(seed.departmentId, seed.superAdmin.employeeId).expect(422);

      expect(errorOf(response).code).toBe('DEPARTMENT.HEAD_SUPER_ADMIN_CANNOT_HEAD');
      expect(
        (
          await ctx.sql.query('SELECT 1 FROM department_head_periods WHERE employee_id = $1', [
            seed.superAdmin.employeeId,
          ])
        ).rows,
      ).toEqual([]);
    });

    it('refuses a person who has left, a person who does not exist, and a retired department (AC-8)', async () => {
      const department = await newDepartment();
      const left = await insertEmployeeFixture(ctx.app, seed, {
        code: unique('E-GONE'),
        email: null,
        terminated: true,
      });
      await closePlacements(left.employeeId);

      expect(errorOf(await assignHead(seed.departmentId, left.employeeId).expect(422)).code).toBe(
        'DEPARTMENT.HEAD_EMPLOYEE_NOT_ACTIVE',
      );
      expect(errorOf(await assignHead(department.id, '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11').expect(422)).code).toBe(
        'DEPARTMENT.HEAD_EMPLOYEE_NOT_FOUND',
      );
      await api().post(`/api/v1/departments/${department.id}/deactivate`).set(asAdmin()).expect(200);
      const member = await insertEmployeeFixture(ctx.app, seed, { code: unique('E-OK'), email: null });
      expect(errorOf(await assignHead(department.id, member.employeeId).expect(409)).code).toBe('DEPARTMENT.INACTIVE');
    });

    it('records that nobody heads it from a day on, and warns (AC-9)', async () => {
      const department = await newDepartment();
      const head = await accountIn(department.code);
      await assignHead(department.id, head.employeeId).expect(200);

      const response = await api()
        .post(`/api/v1/departments/${department.id}/head-vacancies`)
        .set(asAdmin())
        .send({ effectiveFrom: addDays(today(), 2) })
        .expect(200);

      // Until that day the head stays; from it the history shows the end and the warning appears.
      expect(dataOf(response).head).toMatchObject({ employeeCode: head.code });
      expect(dataOf(response).headHistory).toEqual([
        expect.objectContaining({ employeeCode: head.code, validFrom: today(), validTo: addDays(today(), 2) }),
      ]);
      expect((await auditOf(department.id)).at(-1)).toMatchObject({
        action: 'DEPARTMENT.HEAD_VACATED',
        before: { head: head.code },
        after: { head: null, effectiveFrom: addDays(today(), 2) },
      });
      const nobody = await api()
        .post(`/api/v1/departments/${department.id}/head-vacancies`)
        .set(asAdmin())
        .send({ effectiveFrom: today() })
        .expect(200);
      expect(dataOf(nobody).head).toBeNull();
      expect(dataOf(nobody).warnings).toContain('MISSING_HEAD');
    });

    it('answers a vacancy that ends nothing with the profile and records nothing', async () => {
      const department = await newDepartment();
      const events = (await auditOf(department.id)).length;

      await api()
        .post(`/api/v1/departments/${department.id}/head-vacancies`)
        .set(asAdmin())
        .send({ effectiveFrom: today() })
        .expect(200);

      expect(await auditOf(department.id)).toHaveLength(events);
    });
  });

  describe('the successor of the head (QĐ-87 D-5, AC-5, AC-22)', () => {
    const designate = (departmentId: string, employeeId: string, effectiveFrom: string, headers = asAdmin()) =>
      api()
        .post(`/api/v1/departments/${departmentId}/successor-designations`)
        .set(headers)
        .send({ employeeId, effectiveFrom });
    const clear = (departmentId: string, headers = asAdmin()) =>
      api().post(`/api/v1/departments/${departmentId}/successor-clearances`).set(headers);

    it('names the successor from a later day, ends the head the day before, shows it on the profile, and takes it back', async () => {
      const department = await newDepartment();
      const head = await accountIn(department.code);
      const next = await accountIn(department.code);
      const from = addDays(today(), 10);
      await assignHead(department.id, head.employeeId).expect(200);

      const named = await designate(department.id, next.employeeId, from).expect(200);

      expect(messageOf(named)).toBe('DEPARTMENT.SUCCESSOR_DESIGNATED');
      expect(dataOf(named).head).toMatchObject({ employeeId: head.employeeId });
      expect(dataOf(named).successor).toMatchObject({
        employeeId: next.employeeId,
        employeeCode: next.code,
        since: from,
      });
      expect(dataOf(named).headHistory).toEqual([
        expect.objectContaining({ employeeCode: next.code, validFrom: from, validTo: null }),
        expect.objectContaining({ employeeCode: head.code, validFrom: today(), validTo: from }),
      ]);
      expect((await auditOf(department.id)).at(-1)).toEqual({
        action: 'DEPARTMENT.SUCCESSOR_DESIGNATED',
        before: { head: head.code, successor: null },
        after: { head: head.code, successor: next.code, effectiveFrom: from, hrBasis: HR_BASIS },
      });

      const cleared = await clear(department.id).expect(200);

      expect(messageOf(cleared)).toBe('DEPARTMENT.SUCCESSOR_CLEARED');
      expect(dataOf(cleared).successor).toBeNull();
      expect(dataOf(cleared).headHistory).toEqual([
        expect.objectContaining({ employeeCode: head.code, validFrom: today(), validTo: null }),
      ]);
      expect((await auditOf(department.id)).at(-1)).toEqual({
        action: 'DEPARTMENT.SUCCESSOR_CLEARED',
        before: { successor: next.code, effectiveFrom: from },
        after: { successor: null, head: head.code, hrBasis: HR_BASIS },
      });
      // Nobody is named any more: clearing again changes and records nothing.
      const count = (await auditOf(department.id)).length;
      await clear(department.id).expect(200);
      expect(await auditOf(department.id)).toHaveLength(count);
    });

    it.each([
      ['today', () => today(), 'DEPARTMENT.HEAD_SUCCESSOR_DATE_NOT_FUTURE'],
      ['a day in the past', () => addDays(today(), -3), 'DEPARTMENT.HEAD_SUCCESSOR_DATE_NOT_FUTURE'],
    ])('refuses a successor from %s', async (_name, day, code) => {
      const department = await newDepartment();
      const head = await accountIn(department.code);
      const next = await accountIn(department.code);
      await assignHead(department.id, head.employeeId).expect(200);

      const response = await designate(department.id, next.employeeId, day()).expect(422);

      expect(errorOf(response).code).toBe(code);
      expect((await getDepartment(department.id)).successor).toBeNull();
    });

    it('refuses when nobody heads the department, when it is the head themself, and when one is already named', async () => {
      const department = await newDepartment();
      const head = await accountIn(department.code);
      const next = await accountIn(department.code);
      const other = await accountIn(department.code);
      const from = addDays(today(), 10);

      expect(errorOf(await designate(department.id, next.employeeId, from).expect(422)).code).toBe(
        'DEPARTMENT.HEAD_SUCCESSOR_NEEDS_A_HEAD',
      );
      await assignHead(department.id, head.employeeId).expect(200);
      expect(errorOf(await designate(department.id, head.employeeId, from).expect(422)).code).toBe(
        'DEPARTMENT.HEAD_SUCCESSOR_IS_THE_HEAD',
      );
      await designate(department.id, next.employeeId, from).expect(200);
      expect(errorOf(await designate(department.id, other.employeeId, addDays(today(), 12)).expect(409)).code).toBe(
        'DEPARTMENT.HEAD_SUCCESSOR_ALREADY_NAMED',
      );
    });

    it('judges the successor like any head: a member that day, working, and not the Super Admin', async () => {
      const department = await newDepartment();
      const head = await accountIn(department.code);
      const elsewhere = await accountIn('P-OPS');
      await assignHead(department.id, head.employeeId).expect(200);
      const from = addDays(today(), 10);

      const notMember = await designate(department.id, elsewhere.employeeId, from).expect(422);
      const superAdmin = await designate(department.id, seed.superAdmin.employeeId, from).expect(422);

      expect(errorOf(notMember).code).toBe('DEPARTMENT.HEAD_NOT_A_MEMBER_ON_DATE');
      expect(errorOf(superAdmin).code).toBe('DEPARTMENT.HEAD_SUPER_ADMIN_CANNOT_HEAD');
      expect((await getDepartment(department.id)).successor).toBeNull();
    });

    it('is the Super Admin’s alone, with an HR basis, and 404 for a department that does not exist (F10, F13)', async () => {
      const department = await newDepartment();
      const head = await accountIn(department.code);
      const next = await accountIn(department.code);
      await assignHead(department.id, head.employeeId).expect(200);
      const from = addDays(today(), 10);

      for (const headers of [asIt(), asFinance(), as(head)]) {
        await designate(department.id, next.employeeId, from, headers).expect(403);
        await clear(department.id, headers).expect(403);
      }
      await designate(department.id, next.employeeId, from).send({ hrBasis: undefined }).expect(422);
      await designate('3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11', next.employeeId, from).expect(404);
      await clear('3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11').expect(404);
      expect((await getDepartment(department.id)).successor).toBeNull();
    });
  });

  describe('the notices kept for a department with no head are handed to its first head (T-11, F67)', () => {
    const hold = (departmentId: string, key: string) =>
      ctx.sql.query(
        `INSERT INTO held_department_notifications (id, organization_id, department_id, code, subject_type, subject_id, params, event_key)
         VALUES (gen_random_uuid(), $1, $2, 'BUDGET_PROPOSAL_TASK_ASSIGNED', NULL, NULL, '{}'::jsonb, $3)`,
        [seed.organizationId, departmentId, key],
      );

    it('writes an in-app notice for the person named head, in the transaction that names them, and for nobody else', async () => {
      const department = await newDepartment();
      const head = await accountIn(department.code);
      const other = await accountIn(department.code);
      await hold(department.id, `held-${department.id}`);

      await assignHead(department.id, head.employeeId).expect(200);

      const notices = await ctx.sql.query<{ recipient_employee_id: string }>(
        `SELECT recipient_employee_id FROM in_app_notifications
          WHERE code = 'BUDGET_PROPOSAL_TASK_ASSIGNED' AND recipient_employee_id = ANY($1::uuid[])`,
        [[head.employeeId, other.employeeId]],
      );
      expect(notices.rows.map((row) => row.recipient_employee_id)).toEqual([head.employeeId]);
      const held = await ctx.sql.query<{ delivered_to_employee_id: string | null }>(
        `SELECT delivered_to_employee_id FROM held_department_notifications WHERE department_id = $1`,
        [department.id],
      );
      expect(held.rows).toEqual([{ delivered_to_employee_id: head.employeeId }]);

      // Naming another head later hands over nothing more: what was kept was delivered once.
      await assignHead(department.id, other.employeeId, addDays(today(), 2)).expect(200);
      expect(
        (
          await ctx.sql.query(
            `SELECT 1 FROM in_app_notifications WHERE recipient_employee_id = $1 AND code = 'BUDGET_PROPOSAL_TASK_ASSIGNED'`,
            [other.employeeId],
          )
        ).rows,
      ).toEqual([]);
    });

    /**
     * T-11 (spec amendment): the notices kept for a department are handed to the head when their period STARTS: in the transaction of the
     * assignment when it begins today, otherwise at the announcement of the day (the sweep). Nothing is handed to a head who heads nothing yet.
     */
    describe('when the head period starts (spec amendment of T-11)', () => {
      const keptRows = async (key: string) =>
        (
          await ctx.sql.query<{ delivered_to_employee_id: string | null }>(
            `SELECT delivered_to_employee_id FROM held_department_notifications WHERE event_key = $1`,
            [key],
          )
        ).rows;
      const receivers = async (key: string) =>
        (
          await ctx.sql.query<{ recipient_employee_id: string }>(
            `SELECT recipient_employee_id FROM in_app_notifications WHERE event_key = $1 ORDER BY recipient_employee_id`,
            [key],
          )
        ).rows.map((row) => row.recipient_employee_id);
      /** The announcement pass of `day`, as the hourly sweep runs it when that day has come. */
      const announce = (day: string) =>
        ctx.app.get(OrganizationHistoryService, { strict: false }).announceDueChanges(day);

      it('hands nothing over when the first head is named for a day that has not come, and hands it over at the announcement of that day', async () => {
        const department = await newDepartment();
        const head = await accountIn(department.code);
        const from = addDays(today(), 3);
        const before = `held-before-${department.id}`;
        const between = `held-between-${department.id}`;
        await hold(department.id, before);

        await assignHead(department.id, head.employeeId, from).expect(200);
        // A notice held on a day between the assignment and the start: nobody heads the department yet, so it is kept as well.
        await hold(department.id, between);

        expect(await keptRows(before)).toEqual([{ delivered_to_employee_id: null }]);
        expect(await keptRows(between)).toEqual([{ delivered_to_employee_id: null }]);
        expect(await receivers(before)).toEqual([]);
        expect(await receivers(between)).toEqual([]);
        await announce(addDays(today(), 2));
        expect(await receivers(before)).toEqual([]);

        await announce(from);

        expect(await receivers(before)).toEqual([head.employeeId]);
        expect(await receivers(between)).toEqual([head.employeeId]);
        expect(await keptRows(before)).toEqual([{ delivered_to_employee_id: head.employeeId }]);
        expect(await keptRows(between)).toEqual([{ delivered_to_employee_id: head.employeeId }]);
        // Told again, the day hands over nothing more and tells nobody twice.
        await announce(from);
        expect(await receivers(before)).toEqual([head.employeeId]);
      });

      it('hands the kept notices to the head of a later assignment for today when the period of the first was to begin later and is taken back', async () => {
        const department = await newDepartment();
        const planned = await accountIn(department.code);
        const real = await accountIn(department.code);
        const from = addDays(today(), 5);
        const key = `held-cancelled-${department.id}`;
        await hold(department.id, key);
        await assignHead(department.id, planned.employeeId, from).expect(200);
        expect(await receivers(key)).toEqual([]);

        // The later assignment, for today, takes the future period back: the person who really begins first is handed what was kept.
        await assignHead(department.id, real.employeeId).expect(200);

        expect(await receivers(key)).toEqual([real.employeeId]);
        expect(await keptRows(key)).toEqual([{ delivered_to_employee_id: real.employeeId }]);
        // The day of the period taken back comes: nobody is told, and the notice is not handed over a second time.
        await announce(from);
        expect(await receivers(key)).toEqual([real.employeeId]);
        expect(
          (
            await ctx.sql.query(
              `SELECT 1 FROM in_app_notifications WHERE recipient_employee_id = $1 AND event_key = $2`,
              [planned.employeeId, key],
            )
          ).rows,
        ).toEqual([]);
      });

      it('hands the kept notices over in the transaction of the assignment when the period begins today, not at a later pass', async () => {
        const department = await newDepartment();
        const head = await accountIn(department.code);
        const key = `held-today-${department.id}`;
        await hold(department.id, key);

        await assignHead(department.id, head.employeeId).expect(200);

        expect(await receivers(key)).toEqual([head.employeeId]);
        expect(await keptRows(key)).toEqual([{ delivered_to_employee_id: head.employeeId }]);
      });

      it('leaves what was kept when the assignment is refused or rolled back: nobody is handed a notice for a head who is not named', async () => {
        const department = await newDepartment();
        const elsewhere = await accountIn('P-OPS');
        const key = `held-refused-${department.id}`;
        await hold(department.id, key);

        await assignHead(department.id, elsewhere.employeeId).expect(422);

        expect(await receivers(key)).toEqual([]);
        expect(await keptRows(key)).toEqual([{ delivered_to_employee_id: null }]);
      });
    });
  });

  describe('the head is the department MANAGER, and only for as long as they head it (US-01-02)', () => {
    it('gives the role from the day the period begins and takes it back when the period ends (AC-2, AC-3)', async () => {
      const department = await newDepartment();
      const first = await accountIn(department.code);
      const second = await accountIn(department.code);
      expect((await rolesOf(first)).derived).toEqual([]);
      await assignHead(department.id, first.employeeId).expect(200);
      expect((await rolesOf(first)).derived).toEqual(['MANAGER']);

      // The next head is named for three days ahead: until then nothing changes for either.
      await assignHead(department.id, second.employeeId, addDays(today(), 3)).expect(200);
      expect((await rolesOf(first)).derived).toEqual(['MANAGER']);
      expect((await rolesOf(second)).derived).toEqual([]);

      // Three days pass: the periods slide back by four days, so the first ended yesterday and the second began yesterday.
      // The members have been in the department that long too, or the database would refuse the earlier periods.
      await ctx.sql.query('UPDATE employee_placements SET valid_from = valid_from - 10 WHERE department_id = $1', [
        department.id,
      ]);
      await ctx.sql.query(
        `UPDATE department_head_periods SET valid_from = valid_from - 4, valid_to = valid_to - 4
          WHERE department_id = $1 AND valid_to IS NOT NULL`,
        [department.id],
      );
      await ctx.sql.query(
        `UPDATE department_head_periods SET valid_from = valid_from - 4 WHERE department_id = $1 AND valid_to IS NULL`,
        [department.id],
      );
      expect((await rolesOf(first)).derived).toEqual([]);
      expect((await rolesOf(second)).derived).toEqual(['MANAGER']);
      // The members did not change when the head did.
      expect((await getDepartment(department.id)).memberCount).toBe(2);
      // The one who lost the role cannot use a Manager route (AC-3).
      await api().get(`/api/v1/departments/${department.id}`).set(as(first)).expect(403);
      await api().get(`/api/v1/departments/${department.id}`).set(as(second)).expect(200);
      // Put the members back as they were recorded, so the coverage check at the end still holds.
      await ctx.sql.query('DELETE FROM department_head_periods WHERE department_id = $1', [department.id]);
      await ctx.sql.query('UPDATE employee_placements SET valid_from = valid_from + 10 WHERE department_id = $1', [
        department.id,
      ]);
    });

    it('is no longer selfServiceOnly once the person heads a department', async () => {
      const department = await newDepartment();
      const member = await accountIn(department.code);
      const before = (await api().get('/api/v1/me').set(as(member)).expect(200)).body as {
        data: { selfServiceOnly: boolean };
      };
      await assignHead(department.id, member.employeeId).expect(200);

      const after = (await api().get('/api/v1/me').set(as(member)).expect(200)).body as {
        data: { selfServiceOnly: boolean; roles: { effective: string[] } };
      };

      expect(before.data.selfServiceOnly).toBe(true);
      expect(after.data).toMatchObject({ selfServiceOnly: false, roles: { effective: ['MANAGER'] } });
    });

    it('never gives the role to the Super Admin, even if the data says they head a department (FR-8.7)', async () => {
      const department = await newDepartment();
      // Written by SQL on purpose: the application refuses it, so only a defect or a hand edit can produce it.
      await ctx.sql.query(
        `INSERT INTO department_head_periods (id, organization_id, department_id, employee_id, valid_from)
         VALUES (gen_random_uuid(), $1, $2, $3, '2026-02-01')`,
        [seed.organizationId, seed.departmentId, seed.superAdmin.employeeId],
      );

      const me = await api().get('/api/v1/me').set(asAdmin()).expect(200);

      expect((me.body as { data: { roles: { derived: string[]; effective: string[] } } }).data.roles).toEqual({
        direct: ['SUPER_ADMIN'],
        derived: [],
        effective: ['SUPER_ADMIN'],
      });
      await ctx.sql.query('DELETE FROM department_head_periods WHERE employee_id = $1', [seed.superAdmin.employeeId]);
      expect(department.status).toBe('ACTIVE');
    });

    it('shows the head their own department and its people, and nobody else’s (AC-17, AC-7 of US-01-02)', async () => {
      const department = await newDepartment();
      const other = await newDepartment();
      const head = await accountIn(department.code);
      const colleague = await enter(department.code, { workEmail: null });
      await enter(other.code);
      await assignHead(department.id, head.employeeId).expect(200);

      const own = await api().get(`/api/v1/departments/${department.id}`).set(as(head)).expect(200);
      const foreign = await api().get(`/api/v1/departments/${other.id}`).set(as(head)).expect(403);
      const list = await api()
        .get(`/api/v1/departments/${department.id}/employees?pageSize=100`)
        .set(as(head))
        .expect(200);
      const foreignList = await api().get(`/api/v1/departments/${other.id}/employees`).set(as(head)).expect(403);

      expect(dataOf(own).memberCount).toBe(2);
      expect(errorOf(foreign).code).toBe('DEPARTMENT.OUT_OF_SCOPE');
      expect(errorOf(foreignList).code).toBe('DEPARTMENT.OUT_OF_SCOPE');
      const items = (list.body as { data: { items: Record<string, unknown>[] } }).data.items;
      expect(items.map((item) => item.employeeCode)).toEqual([head.code, colleague.code].sort());
      for (const item of items) {
        expect(Object.keys(item).sort()).toEqual([
          'employeeCode',
          'fullName',
          'hasWorkEmail',
          'memberSince',
          'status',
          'workState',
        ]);
      }
      expect(items.find((item) => item.employeeCode === colleague.code)).toMatchObject({
        hasWorkEmail: false,
        memberSince: today(),
        status: 'ACTIVE',
      });
      // The head is one of the people in the department (AC-9).
      expect(items.some((item) => item.employeeCode === head.code)).toBe(true);
    });

    it('does not let Finance or an employee read a department or its people, nor the IT Admin read its people in full (AC-7, F12)', async () => {
      const department = await newDepartment();
      const employee = await accountIn('P-OPS');

      for (const headers of [asFinance(), as(employee)]) {
        await api().get(`/api/v1/departments/${department.id}/employees`).set(headers).expect(403);
        await api().get(`/api/v1/departments/${department.id}`).set(headers).expect(403);
        await api().get(`/api/v1/departments/${department.id}/technical-members`).set(headers).expect(403);
      }
      await api().get(`/api/v1/departments/${department.id}/employees`).set(asIt()).expect(403);
    });

    it('lets the Super Admin read any department and its people in full (QĐ-87b(4), F12)', async () => {
      const department = await newDepartment({ itAdminEmployeeId: it2.employeeId });
      const member = await enter(department.code);

      const profile = await api().get(`/api/v1/departments/${department.id}`).set(asAdmin()).expect(200);
      const people = await api().get(`/api/v1/departments/${department.id}/employees`).set(asAdmin()).expect(200);

      expect(dataOf(profile).id).toBe(department.id);
      const items = (people.body as { data: { items: { employeeCode: string }[] } }).data.items;
      expect(items.map((item) => item.employeeCode)).toEqual([member.code]);
    });

    describe('the IT Admin reads only the departments they are in charge of or stand in for, and only the minimum (F12)', () => {
      it('reads the technical view of the people of a department they are in charge of: no grounds, email or hire date', async () => {
        const department = await newDepartment({ itAdminEmployeeId: it1.employeeId });
        const member = await enter(department.code);

        const response = await api()
          .get(`/api/v1/departments/${department.id}/technical-members`)
          .set(asIt())
          .expect(200);

        const page = (
          response.body as { message: string; data: { items: Record<string, unknown>[]; pagination: unknown } }
        ).data;
        expect((response.body as { message: string }).message).toBe('DEPARTMENT.TECHNICAL_MEMBERS_LISTED');
        expect(page.items).toEqual([
          {
            id: member.employeeId,
            code: member.code,
            fullName: `Person ${member.code}`,
            departmentId: department.id,
            employmentStatus: 'WORKING',
            effectiveOn: today(),
          },
        ]);
        expect(page.pagination).toEqual({ page: 1, pageSize: 20, totalItems: 1, totalPages: 1 });
        expect(response.text).not.toMatch(/workEmail|hasWorkEmail|hireDate|employmentType|grounds/);
      });

      it('answers 404 for a department another IT Admin is in charge of, as if it did not exist, in every read', async () => {
        const theirs = await newDepartment({ itAdminEmployeeId: it2.employeeId });
        await enter(theirs.code);

        for (const path of [`/departments/${theirs.id}`, `/departments/${theirs.id}/technical-members`]) {
          const response = await api().get(`/api/v1${path}`).set(asIt()).expect(404);
          expect(errorOf(response).code).toBe('DEPARTMENT.NOT_FOUND');
        }
        // The list and the warnings do not name it either.
        const list = await api().get(`/api/v1/departments?search=${theirs.code}`).set(asIt()).expect(200);
        expect((list.body as { data: { items: unknown[] } }).data.items).toEqual([]);
        // ...while the Super Admin and the IT Admin in charge read it.
        await api().get(`/api/v1/departments/${theirs.id}`).set(asAdmin()).expect(200);
        await api().get(`/api/v1/departments/${theirs.id}`).set(as(it2)).expect(200);
      });

      it('stands in for a department nobody usable is in charge of, so the shared queue can be worked', async () => {
        const unattended = await newDepartment();
        await enter(unattended.code);

        await api().get(`/api/v1/departments/${unattended.id}`).set(asIt()).expect(200);
        const people = await api()
          .get(`/api/v1/departments/${unattended.id}/technical-members`)
          .set(asIt())
          .expect(200);

        expect((people.body as { data: { items: unknown[] } }).data.items).toHaveLength(1);
      });

      it('is told by the service, not only by the route: a caller with no reading role gets the same 403 as the guard', async () => {
        const department = await newDepartment();
        const employee = await accountIn('P-OPS');

        const response = await api()
          .get(`/api/v1/departments/${department.id}/technical-members`)
          .set(as(employee))
          .expect(403);

        expect(errorOf(response).code).toBe('AUTHORIZATION.FORBIDDEN');
      });
    });
  });

  describe('projects described on a profile (AC-14)', () => {
    it('describes a project with the departments that take part, and shows it on each of their profiles', async () => {
      const design = await newDepartment();
      const finance2 = await newDepartment();

      const created = await api()
        .post('/api/v1/projects')
        .set(asAdmin())
        .send({
          name: ' Alpha ',
          description: 'Rebuild the portal',
          departmentIds: [design.id, finance2.id, design.id],
        })
        .expect(201);
      const project = (created.body as { data: { id: string; name: string; status: string; departments: unknown[] } })
        .data;

      expect(project).toMatchObject({ name: 'Alpha', status: 'RUNNING' });
      expect(project.departments).toHaveLength(2);
      for (const department of [design, finance2]) {
        expect((await getDepartment(department.id)).projects).toEqual([
          expect.objectContaining({ id: project.id, name: 'Alpha', description: 'Rebuild the portal' }),
        ]);
      }
      expect((await auditOf(project.id))[0]).toMatchObject({ action: 'PROJECT.CREATED' });
    });

    it('is not a cost center, has no members and adds nothing to any department', async () => {
      const costCenters = await rowCount('cost_centers');
      const placements = await rowCount('employee_placements');
      const department = await newDepartment();
      const centersAfterDepartment = await rowCount('cost_centers');

      await api()
        .post('/api/v1/projects')
        .set(asAdmin())
        .send({ name: 'Beta', departmentIds: [department.id] })
        .expect(201);

      expect(await rowCount('cost_centers')).toBe(centersAfterDepartment);
      expect(centersAfterDepartment).toBe(costCenters + 1);
      expect(await rowCount('employee_placements')).toBe(placements);
      expect((await getDepartment(department.id)).memberCount).toBe(0);
    });

    it('changes the status and the departments, records before and after, and filters the list by department', async () => {
      const first = await newDepartment();
      const second = await newDepartment();
      const created = await api()
        .post('/api/v1/projects')
        .set(asAdmin())
        .send({ name: unique('Gamma'), departmentIds: [first.id] })
        .expect(201);
      const id = (created.body as { data: { id: string } }).data.id;

      const updated = await api()
        .patch(`/api/v1/projects/${id}`)
        .set(asAdmin())
        .send({ status: 'FINISHED', departmentIds: [second.id] })
        .expect(200);

      expect((updated.body as { data: { status: string; departments: { id: string }[] } }).data).toMatchObject({
        status: 'FINISHED',
        departments: [{ id: second.id }],
      });
      const forSecond = await api().get(`/api/v1/projects?departmentId=${second.id}`).set(asAdmin()).expect(200);
      const forFirst = await api().get(`/api/v1/projects?departmentId=${first.id}`).set(asAdmin()).expect(200);
      expect((forSecond.body as { data: { items: unknown[] } }).data.items).toHaveLength(1);
      expect((forFirst.body as { data: { items: unknown[] } }).data.items).toHaveLength(0);
      expect((await auditOf(id)).at(-1)).toMatchObject({
        action: 'PROJECT.UPDATED',
        before: { status: 'RUNNING', departmentIds: [first.id] },
        after: { status: 'FINISHED', departmentIds: [second.id] },
      });
    });

    it('refuses a name that is empty, a department that does not exist, and everyone but the Super Admin (F10)', async () => {
      const department = await newDepartment();
      const post = (body: object, headers = asAdmin()) => api().post('/api/v1/projects').set(headers).send(body);

      expect(errorOf(await post({ name: ' ', departmentIds: [department.id] }).expect(422)).code).toBe(
        'PROJECT.INVALID_NAME',
      );
      expect(
        errorOf(await post({ name: 'Delta', departmentIds: ['3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11'] }).expect(422))
          .code,
      ).toBe('PROJECT.INVALID_DEPARTMENT_NOT_FOUND');
      await post({ name: 'Epsilon', departmentIds: [department.id] }, asFinance()).expect(403);
      await post({ name: 'Epsilon', departmentIds: [department.id] }, asIt()).expect(403);
      await api().get('/api/v1/projects').set(asIt()).expect(403);
      await api()
        .post('/api/v1/projects')
        .set(asAdmin())
        .send({ name: 'No basis', departmentIds: [], hrBasis: undefined })
        .expect(422);
      await api()
        .patch('/api/v1/projects/3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11')
        .set(asAdmin())
        .send({ name: 'x' })
        .expect(404);
    });
  });

  /**
   * H4.2 characterization: the `/v1/projects` contract and the projects on a profile, pinned on the code before the
   * project capability moved out of the module root. The same tests run unchanged after the move.
   */
  describe('project contract kept by the H4.2 move', () => {
    type ProjectWire = {
      id: string;
      name: string;
      description: string | null;
      status: string;
      departments: { id: string; code: string; name: string }[];
      createdAt: string;
      updatedAt: string;
    };
    const PROJECT_KEYS = ['createdAt', 'departments', 'description', 'id', 'name', 'status', 'updatedAt'];
    const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
    const projectOf = (response: request.Response) => (response.body as { data: ProjectWire }).data;
    const itemsOf = (response: request.Response) => (response.body as { data: { items: ProjectWire[] } }).data.items;
    const createProject = async (body: object) =>
      projectOf(await api().post('/api/v1/projects').set(asAdmin()).send(body).expect(201));
    const byCode = (a: { code: string }, b: { code: string }) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0);

    const expectWire = (project: ProjectWire) => {
      expect(Object.keys(project).sort()).toEqual(PROJECT_KEYS);
      expect(project.createdAt).toMatch(ISO_INSTANT);
      expect(project.updatedAt).toMatch(ISO_INSTANT);
      for (const department of project.departments)
        expect(Object.keys(department).sort()).toEqual(['code', 'id', 'name']);
      expect(project.departments).toEqual([...project.departments].sort(byCode));
    };

    it('answers the exact wire, departments ordered by code, with the creation and its audit', async () => {
      const first = await newDepartment();
      const second = await newDepartment();
      const project = await createProject({ name: unique('Wire'), departmentIds: [second.id, first.id] });

      expectWire(project);
      expect(project).toMatchObject({ description: null, status: 'RUNNING' });
      expect(project.departments).toEqual(
        [
          { id: first.id, code: first.code, name: first.name },
          { id: second.id, code: second.code, name: second.name },
        ].sort(byCode),
      );
      expect(await auditOf(project.id)).toEqual([
        {
          action: 'PROJECT.CREATED',
          before: null,
          after: { name: project.name, status: 'RUNNING', departmentIds: [second.id, first.id], hrBasis: HR_BASIS },
        },
      ]);
    });

    it('lists a page of projects by name, then id, without the description, when no department is named', async () => {
      const department = await newDepartment();
      const prefix = unique('Order');
      const later = await createProject({ name: `${prefix}-B`, departmentIds: [department.id] });
      const earlier = await createProject({ name: `${prefix}-A`, departmentIds: [] });

      const items = itemsOf(await api().get('/api/v1/projects').set(asAdmin()).expect(200));
      const ids = items.map((item) => item.id);

      for (const item of items) {
        expect(Object.keys(item).sort()).toEqual(['departments', 'id', 'name', 'status', 'updatedAt']);
        expect(item.updatedAt).toMatch(ISO_INSTANT);
      }
      expect(ids).toContain(later.id);
      expect(ids.indexOf(earlier.id)).toBeLessThan(ids.indexOf(later.id));
      expect(items.find((item) => item.id === earlier.id)?.departments).toEqual([]);
      expect(
        itemsOf(await api().get(`/api/v1/projects?departmentId=${department.id}`).set(asAdmin()).expect(200)).map(
          (item) => item.id,
        ),
      ).toEqual([later.id]);
    });

    it('composes and trims the name, keeps line breaks in the description, and stores a blank description as none', async () => {
      const department = await newDepartment();
      const ideographicSpace = String.fromCharCode(0x3000);
      const decomposed = 'Kế toán'.normalize('NFD');

      const project = await createProject({
        name: `${ideographicSpace}${decomposed}${ideographicSpace} ${ideographicSpace}plan `,
        description: `  ${decomposed}\n  second line  `,
        departmentIds: [department.id],
      });
      const blank = await createProject({ name: unique('Blank'), description: '   ', departmentIds: [] });

      expect(project.name).toBe('Kế toán plan');
      expect(project.description).toBe('Kế toán\n  second line');
      expect(blank.description).toBeNull();
    });

    it('writes nothing and audits nothing when an update changes nothing', async () => {
      const first = await newDepartment();
      const second = await newDepartment();
      const project = await createProject({
        name: unique('Still'),
        description: 'Same',
        departmentIds: [first.id, second.id],
      });

      const unchanged = projectOf(
        await api()
          .patch(`/api/v1/projects/${project.id}`)
          .set(asAdmin())
          .send({
            name: ` ${project.name} `,
            description: 'Same',
            status: 'RUNNING',
            departmentIds: [second.id, first.id],
          })
          .expect(200),
      );

      expect(unchanged).toEqual(project);
      expect(await auditOf(project.id)).toHaveLength(1);
    });

    it('records only what changed, and refuses a description that is too long or an unknown project', async () => {
      const department = await newDepartment();
      const project = await createProject({ name: unique('Change'), departmentIds: [department.id] });

      const renamed = projectOf(
        await api()
          .patch(`/api/v1/projects/${project.id}`)
          .set(asAdmin())
          .send({ name: `${project.name} v2`, status: 'RUNNING' })
          .expect(200),
      );

      expect(renamed.name).toBe(`${project.name} v2`);
      expect(Date.parse(renamed.updatedAt)).toBeGreaterThanOrEqual(Date.parse(project.updatedAt));
      expect((await auditOf(project.id)).at(-1)).toEqual({
        action: 'PROJECT.UPDATED',
        before: { name: project.name },
        after: { name: `${project.name} v2`, hrBasis: HR_BASIS },
      });
      expect(
        errorOf(
          await api()
            .patch(`/api/v1/projects/${project.id}`)
            .set(asAdmin())
            .send({ description: 'x'.repeat(2001) })
            .expect(422),
        ).code,
      ).toBe('PROJECT.INVALID_DESCRIPTION');
      expect(
        errorOf(
          await api()
            .patch('/api/v1/projects/3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11')
            .set(asAdmin())
            .send({ name: 'x' })
            .expect(404),
        ).code,
      ).toBe('PROJECT.NOT_FOUND');
    });

    it('shows the projects on a profile in the same wire as the project routes', async () => {
      const department = await newDepartment();
      const other = await newDepartment();
      const project = await createProject({ name: unique('Profile'), departmentIds: [other.id, department.id] });

      const profile = (await getDepartment(department.id)) as unknown as { projects: ProjectWire[] };

      profile.projects.forEach(expectWire);
      expect(profile.projects).toEqual([project]);
    });
  });

  /**
   * Wave 3 characterization (H4.6, H4.7): the exact department wire, paging, member page and audit payloads, pinned on
   * the code before the department capability left the module root and `Page<T>` moved to core. The same tests run
   * unchanged after the move.
   */
  describe('department contract kept by the Wave 3 move', () => {
    const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
    const LIST_KEYS = [
      'code',
      'costCenter',
      'createdAt',
      'deactivatedAt',
      'function',
      'head',
      'id',
      'itAdmin',
      'memberCount',
      'name',
      'status',
      'updatedAt',
      'warnings',
    ];
    const PROFILE_KEYS = [
      ...LIST_KEYS,
      'headHistory',
      'headHistoryHasMore',
      'projects',
      'projectTotal',
      'successor',
    ].sort();
    const vacate = (departmentId: string, effectiveFrom: string) =>
      api().post(`/api/v1/departments/${departmentId}/head-vacancies`).set(asAdmin()).send({ effectiveFrom });

    it('answers a new department with the exact profile wire', async () => {
      const body = departmentBody({
        function: '  line one\nline two  ',
        itAdminEmployeeId: it2.employeeId,
      });

      const profile = (
        (await createDepartment(body).expect(201)).body as { data: Record<string, unknown> & { createdAt: string } }
      ).data;

      expect(Object.keys(profile).sort()).toEqual(PROFILE_KEYS);
      expect(profile).toEqual({
        id: expect.any(String) as unknown,
        code: body.code,
        name: 'Design',
        function: 'line one\nline two',
        status: 'ACTIVE',
        costCenter: null,
        itAdmin: {
          employeeId: it2.employeeId,
          employeeCode: 'E-IT2',
          fullName: expect.any(String) as unknown,
          usable: true,
        },
        head: null,
        memberCount: 0,
        warnings: ['MISSING_HEAD', 'MISSING_COST_CENTER'],
        createdAt: expect.stringMatching(ISO_INSTANT) as unknown,
        updatedAt: profile.createdAt,
        deactivatedAt: null,
        successor: null,
        headHistory: [],
        headHistoryHasMore: false,
        projects: [],
        projectTotal: 0,
      });
    });

    it('pages the list in code order with the exact pagination, and searches code and name ignoring case', async () => {
      const tag = unique('PG');
      const word = `Zulu${counter}x`;
      for (const suffix of ['C', 'A', 'B']) {
        await newDepartment({ code: `${tag}-${suffix}`, name: `${word} ${suffix}` });
      }

      const second = (
        (
          await api()
            .get(`/api/v1/departments?search=${tag.toLowerCase()}&page=2&pageSize=2`)
            .set(asAdmin())
            .expect(200)
        ).body as { message: string; data: { items: Record<string, unknown>[]; pagination: unknown } }
      ).data;
      expect(second.pagination).toEqual({ page: 2, pageSize: 2, totalItems: 3, totalPages: 2 });
      expect(second.items.map((item) => item.code)).toEqual([`${tag}-C`]);
      expect(Object.keys(second.items[0]).sort()).toEqual(LIST_KEYS);

      const byName = (
        (await api().get(`/api/v1/departments?search=${word.toUpperCase()}`).set(asAdmin()).expect(200)).body as {
          data: { items: { code: string }[]; pagination: unknown };
        }
      ).data;
      expect(byName.items.map((item) => item.code)).toEqual([`${tag}-A`, `${tag}-B`, `${tag}-C`]);
      expect(byName.pagination).toEqual({ page: 1, pageSize: 20, totalItems: 3, totalPages: 1 });
    });

    it('pages the members in code order with the exact member wire', async () => {
      const department = await newDepartment();
      const withEmail = await enter(department.code);
      const withoutEmail = await enter(department.code, { workEmail: undefined });
      const [, second] = [withEmail, withoutEmail].sort((a, b) => (a.code < b.code ? -1 : 1));

      const page = (
        await api().get(`/api/v1/departments/${department.id}/employees?page=2&pageSize=1`).set(asAdmin()).expect(200)
      ).body as { message: string; data: unknown };

      expect(page.message).toBe('DEPARTMENT.MEMBERS_LISTED');
      expect(page.data).toEqual({
        items: [
          {
            employeeCode: second.code,
            fullName: `Person ${second.code}`,
            status: 'ACTIVE',
            workState: 'WORKING',
            hasWorkEmail: second === withEmail,
            memberSince: today(),
          },
        ],
        pagination: { page: 2, pageSize: 1, totalItems: 2, totalPages: 2 },
      });
    });

    it('records the exact head audit: the period ended, the plan cancelled, the vacancy', async () => {
      const department = await newDepartment();
      const first = await accountIn(department.code);
      const planned = await accountIn(department.code);
      const next = await accountIn(department.code);

      await assignHead(department.id, first.employeeId).expect(200);
      await assignHead(department.id, planned.employeeId, addDays(today(), 6)).expect(200);
      await assignHead(department.id, next.employeeId, addDays(today(), 3)).expect(200);
      await vacate(department.id, addDays(today(), 5)).expect(200);

      expect(await auditOf(department.id)).toEqual([
        expect.objectContaining({ action: 'DEPARTMENT.CREATED' }),
        {
          action: 'DEPARTMENT.HEAD_ASSIGNED',
          before: { head: null },
          after: { head: first.code, effectiveFrom: today(), endedPeriods: 0, cancelledPeriods: [], hrBasis: HR_BASIS },
        },
        {
          action: 'DEPARTMENT.HEAD_ASSIGNED',
          before: { head: first.code },
          after: {
            head: planned.code,
            effectiveFrom: addDays(today(), 6),
            endedPeriods: 1,
            cancelledPeriods: [],
            hrBasis: HR_BASIS,
          },
        },
        {
          action: 'DEPARTMENT.HEAD_ASSIGNED',
          before: { head: first.code },
          after: {
            head: next.code,
            effectiveFrom: addDays(today(), 3),
            endedPeriods: 1,
            cancelledPeriods: [`${planned.code}@${addDays(today(), 6)}`],
            hrBasis: HR_BASIS,
          },
        },
        {
          action: 'DEPARTMENT.HEAD_VACATED',
          before: { head: next.code },
          after: { head: null, effectiveFrom: addDays(today(), 5), cancelledPeriods: [], hrBasis: HR_BASIS },
        },
      ]);
      expect((await getDepartment(department.id)).headHistory).toEqual([
        expect.objectContaining({
          employeeCode: next.code,
          validFrom: addDays(today(), 3),
          validTo: addDays(today(), 5),
        }),
        expect.objectContaining({ employeeCode: first.code, validFrom: today(), validTo: addDays(today(), 3) }),
      ]);
    });

    it('records the exact retirement audit', async () => {
      const department = await newDepartment();

      await api().post(`/api/v1/departments/${department.id}/deactivate`).set(asAdmin()).expect(200);

      expect((await auditOf(department.id)).at(-1)).toEqual({
        action: 'DEPARTMENT.DEACTIVATED',
        before: { status: 'ACTIVE' },
        after: { status: 'INACTIVE', hrBasis: HR_BASIS },
      });
    });

    it('names at most twenty members, in code order, when it refuses to retire a department', async () => {
      const department = await newDepartment();
      const codes: string[] = [];
      for (let index = 0; index < 21; index += 1) codes.push((await enter(department.code)).code);

      const error = errorOf(
        await api().post(`/api/v1/departments/${department.id}/deactivate`).set(asAdmin()).expect(409),
      );

      const listed = (error.details as { members: { employeeCode: string }[]; totalMembers: number }).members;
      expect(error.code).toBe('DEPARTMENT.IN_USE');
      expect((error.details as { totalMembers: number }).totalMembers).toBe(21);
      expect(listed.map((member) => member.employeeCode)).toEqual([...codes].sort().slice(0, 20));
    });

    it('lists the warnings in code order, a missing head before a missing IT Admin', async () => {
      await newDepartment();

      const items = (
        (await api().get('/api/v1/department-warnings').set(asIt()).expect(200)).body as {
          data: { items: { code: string; warning: string }[] };
        }
      ).data.items;

      const keys = items.map((item) => `${item.code}|${item.warning}`);
      expect(keys).toEqual(
        [...items]
          .sort((a, b) => (a.code === b.code ? a.warning.localeCompare(b.warning) : a.code < b.code ? -1 : 1))
          .map((item) => `${item.code}|${item.warning}`),
      );
      expect(items.length).toBeGreaterThan(1);
    });
  });

  describe('what the database keeps true by itself (INV-19, QĐ-66a)', () => {
    const insertPeriod = (departmentId: string, employeeId: string, from: string, to: string | null) =>
      ctx.sql.query(
        `INSERT INTO department_head_periods (id, organization_id, department_id, employee_id, valid_from, valid_to)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)`,
        [seed.organizationId, departmentId, employeeId, from, to],
      );

    it('allows one head at a time: a second period over the same days is refused', async () => {
      const department = await newDepartment();
      const first = await enter(department.code);
      const second = await enter(department.code);
      // Days are relative to today: a member's placement starts today, so a fixed calendar date goes stale.
      const start = addDays(today(), 10);
      const end = addDays(today(), 40);
      await insertPeriod(department.id, first.employeeId, start, end);

      await expect(insertPeriod(department.id, second.employeeId, addDays(today(), 25), null)).rejects.toMatchObject({
        code: '23P01',
      });
      await expect(insertPeriod(department.id, second.employeeId, end, null)).resolves.toBeDefined();
    });

    it('lets a person head only one department on any day: the member rule and the exclusion both refuse overlap', async () => {
      const first = await newDepartment();
      const second = await newDepartment();
      const person = await enter(first.code);
      const transfer = addDays(today(), 40);
      // The same person is a member of the second department from a later day (a transfer), by SQL.
      await ctx.sql.query(`UPDATE employee_placements SET valid_to = $2 WHERE employee_id = $1 AND valid_to IS NULL`, [
        person.employeeId,
        transfer,
      ]);
      await ctx.sql.query(
        `INSERT INTO employee_placements (id, organization_id, employee_id, department_id, valid_from)
         VALUES (gen_random_uuid(), $1, $2, $3, $4)`,
        [seed.organizationId, person.employeeId, second.id, transfer],
      );
      await insertPeriod(first.id, person.employeeId, today(), transfer);

      // Heading the second department before the transfer is refused: not a member yet (a second guard, the
      // exclusion on the person, would refuse it too if the placements ever overlapped).
      const refusal: unknown = await insertPeriod(second.id, person.employeeId, addDays(today(), 30), null).catch(
        (error: unknown) => error,
      );
      expect(['23514', '23P01']).toContain((refusal as { code?: string }).code);
      await expect(insertPeriod(second.id, person.employeeId, transfer, null)).resolves.toBeDefined();
      await ctx.sql.query('DELETE FROM department_head_periods WHERE employee_id = $1', [person.employeeId]);
      await ctx.sql.query('DELETE FROM employee_placements WHERE employee_id = $1 AND valid_from = $2', [
        person.employeeId,
        transfer,
      ]);
      await ctx.sql.query('UPDATE employee_placements SET valid_to = NULL WHERE employee_id = $1', [person.employeeId]);
    });

    it('refuses a head who is not a member of the department for the whole period', async () => {
      const department = await newDepartment();
      const elsewhere = await enter('P-OPS');
      const member = await enter(department.code);
      const periodStart = addDays(today(), 10);
      const placementEnd = addDays(today(), 20);

      await expect(insertPeriod(department.id, elsewhere.employeeId, periodStart, null)).rejects.toMatchObject({
        code: '23514',
      });
      // A closed placement that ends before the period does.
      await ctx.sql.query(`UPDATE employee_placements SET valid_to = $2 WHERE employee_id = $1 AND valid_to IS NULL`, [
        member.employeeId,
        placementEnd,
      ]);
      await expect(insertPeriod(department.id, member.employeeId, periodStart, null)).rejects.toMatchObject({
        code: '23514',
      });
      await expect(insertPeriod(department.id, member.employeeId, today(), placementEnd)).resolves.toBeDefined();
      await ctx.sql.query('DELETE FROM department_head_periods WHERE employee_id = $1', [member.employeeId]);
      await ctx.sql.query('UPDATE employee_placements SET valid_to = NULL WHERE employee_id = $1', [member.employeeId]);
    });

    it('refuses an empty or backwards period', async () => {
      const department = await newDepartment();
      const member = await enter(department.code);

      const day = addDays(today(), 10);

      await expect(insertPeriod(department.id, member.employeeId, day, day)).rejects.toMatchObject({
        code: '23514',
      });
    });
  });

  describe('the lock protocol: two heads named at once', () => {
    let holder: Client;

    beforeAll(async () => {
      holder = new Client({ connectionString: ctx.database.url });
      await holder.connect();
    });

    afterAll(async () => {
      await holder?.end();
    });

    afterEach(async () => {
      await holder.query('ROLLBACK').catch(() => undefined);
    });

    async function waitForWaiters(observer: Client, count: number, timeoutMs = 10000): Promise<void> {
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        const { rows } = await observer.query<{ waiting: number }>(
          'SELECT count(*)::int AS waiting FROM pg_locks WHERE NOT granted',
        );
        if (rows[0].waiting >= count) return;
        if (Date.now() > deadline) throw new Error(`Fewer than ${count} backends reached a lock wait in time.`);
        await new Promise<void>((resolve) => setImmediate(resolve));
      }
    }

    it('leaves exactly one head on each day, in either order, with no deadlock', async () => {
      const deadlocks = async () =>
        (
          await ctx.sql.query<{ n: number }>(
            'SELECT deadlocks::int AS n FROM pg_stat_database WHERE datname = current_database()',
          )
        ).rows[0].n;
      const deadlocksBefore = await deadlocks();
      for (let round = 0; round < 4; round += 1) {
        const department = await newDepartment();
        const first = await enter(department.code);
        const second = await enter(department.code);

        await holder.query('BEGIN');
        await holder.query('SELECT id FROM departments WHERE id = $1 FOR UPDATE', [department.id]);
        const a = assignHead(department.id, first.employeeId).then((r) => r);
        const b = assignHead(department.id, second.employeeId).then((r) => r);
        await waitForWaiters(ctx.sql, 2);
        await holder.query('COMMIT');
        const [one, two] = await Promise.all([a, b]);

        // Both are accepted one after the other; the later one is the head and the earlier one's period is gone,
        // because both began today and the later decision replaces the earlier one.
        expect([one.status, two.status]).toEqual([200, 200]);
        const periods = await ctx.sql.query<{ employee_id: string; valid_to: string | null }>(
          'SELECT employee_id, valid_to FROM department_head_periods WHERE department_id = $1',
          [department.id],
        );
        expect(periods.rows).toHaveLength(1);
        expect(periods.rows[0].valid_to).toBeNull();
        expect([first.employeeId, second.employeeId]).toContain(periods.rows[0].employee_id);
      }
      expect(await deadlocks()).toBe(deadlocksBefore);
    });
  });

  it('leaves every employee with exactly the placements the invariant I-2 asks for', async () => {
    expect(await findPlacementCoverageViolations(ctx.sql)).toEqual([]);
  });
});
