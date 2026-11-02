import { findPlacementCoverageViolations } from './placement-coverage';
import request from 'supertest';
import { ApiAccount, adminToken, createActivatedAccount } from './api-accounts';
import { ensureManagerGrant } from './builders/account.builder';
import { HttpTestApp, SeededInstallation, createHttpTestApp, seedInstallation } from './http-test-app';
import { UseFacts, registerUseReaders } from './organization-use-readers';

/** The departments, heads and projects over HTTP: the types of the wire, the calendar and the set-up the department specs share. */
export interface DepartmentWire {
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
  /** The person named to take over from a day after today; null when nobody is (`QĐ-87` `D-5`). */
  successor: { employeeId: string; employeeCode: string; since: string } | null;
  deactivatedAt: string | null;
}

export interface ErrorBody {
  error: { code: string; details?: Record<string, unknown> };
}

export const ORG_TIME_ZONE = 'Asia/Ho_Chi_Minh';

/** Today in the organization's calendar, like the application computes it. */
export function today(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: ORG_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? '';

  return `${pick('year')}-${pick('month')}-${pick('day')}`;
}

export function addDays(date: string, days: number): string {
  const moved = new Date(`${date}T00:00:00.000Z`);
  moved.setUTCDate(moved.getUTCDate() + days);

  return moved.toISOString().slice(0, 10);
}

/** The set-up the specs of this file share: the application, its accounts and the calls and reads they make. No assertion lives here. */
export class DepartmentHarness {
  ctx!: HttpTestApp;

  seed!: SeededInstallation;

  admin!: string;

  finance!: ApiAccount;

  it1!: ApiAccount;

  it2!: ApiAccount;

  counter = 0;

  server = () => this.ctx.app.getHttpServer();

  asFinance = () => ({ Authorization: `Bearer ${this.finance.accessToken}` });

  asIt = () => ({ Authorization: `Bearer ${this.it1.accessToken}` });

  asAdmin = () => ({ Authorization: `Bearer ${this.admin}` });

  as = (account: ApiAccount) => ({ Authorization: `Bearer ${account.accessToken}` });

  useFacts!: UseFacts;

  api = () => request(this.server());

  unique = (prefix: string): string => {
    this.counter += 1;

    return `${prefix}-${this.counter}`;
  };

  errorOf = (response: request.Response) => (response.body as ErrorBody).error;

  dataOf = (response: request.Response) => (response.body as { data: DepartmentWire }).data;

  messageOf = (response: request.Response) => (response.body as { message: string }).message;

  /** What Finance sends to create the Cost Center of a department. */
  createCostCenterFor = async (departmentId: string, kind = 'UNIT'): Promise<{ id: string; code: string }> => {
    const code = this.unique('CCX');
    const response = await this.api()
      .post('/api/v1/cost-centers')
      .set(this.asFinance())
      .send({ code, name: `Name of ${code}`, kind, departmentId })
      .expect(201);

    return { id: (response.body as { data: { id: string } }).data.id, code };
  };

  /** What the Super Admin sends to create a department: no Cost Center, and no HR basis (`QĐ-93f`). */
  departmentBody = (overrides: Record<string, unknown> = {}) => ({
    code: this.unique('P'),
    name: 'Design',
    ...overrides,
  });

  createDepartment = (body: object, headers: Record<string, string> = this.asAdmin()) =>
    this.api().post('/api/v1/departments').set(headers).send(body);

  /** A department with the Cost Center Finance created for it, as the profile shows it. */
  newDepartment = async (overrides: Record<string, unknown> = {}): Promise<DepartmentWire> => {
    const created = this.dataOf(await this.createDepartment(this.departmentBody(overrides)).expect(201));
    await this.createCostCenterFor(created.id);

    return this.getDepartment(created.id);
  };

  getDepartment = async (id: string, headers: Record<string, string> = this.asAdmin()): Promise<DepartmentWire> =>
    this.dataOf(await this.api().get(`/api/v1/departments/${id}`).set(headers).expect(200));

  /** A person entered into a department the way the IT Admin does, through the form. */
  enter = async (departmentCode: string, overrides: Record<string, unknown> = {}) => {
    const code = this.unique('E-D');
    const body = {
      employeeCode: code,
      fullName: `Person ${code}`,
      workEmail: `${code.toLowerCase()}@acme.vn`,
      employmentType: 'STAFF',
      hireDate: '2026-10-01',
      departmentCode,
      jobTitle: 'Administrator',
      ...overrides,
    };
    const response = await this.api().post('/api/v1/employees').set(this.asAdmin()).send(body).expect(201);

    return { employeeId: (response.body as { data: { id: string } }).data.id, code, email: body.workEmail };
  };

  /** A member of the department with an account that holds no role. */
  accountIn = async (departmentCode: string): Promise<ApiAccount & { code: string }> => {
    const person = await this.enter(departmentCode);
    const account = await createActivatedAccount(this.ctx, this.seed, {
      code: person.code,
      email: person.email,
      roles: [],
      admin: this.admin,
      employeeId: person.employeeId,
    });

    return { ...account, code: person.code };
  };

  /** `MANAGER` is granted by the Super Admin before a person is named head (QĐ-93a); a person with no account has none to give. */
  grantManager = async (employeeId: string): Promise<void> => {
    const { rowCount } = await this.ctx.sql.query('SELECT 1 FROM app_users WHERE employee_id = $1', [employeeId]);
    if (rowCount === 1) await ensureManagerGrant(this.ctx, this.admin, employeeId);
  };

  /** The call of the route as it is, with no grant given first: what the specs of the refusals send. */
  assignHeadRaw = (departmentId: string, employeeId: string, effectiveFrom = today(), headers = this.asAdmin()) =>
    this.api()
      .post(`/api/v1/departments/${departmentId}/head-assignments`)
      .set(headers)
      .send({ employeeId, effectiveFrom });

  /**
   * The same call, after the Super Admin gave the person `MANAGER` (the seam of QĐ-93a: a head holds the grant). The grant is made when
   * the request is sent, so `.expect(...)` chains as before.
   */
  assignHead = (departmentId: string, employeeId: string, effectiveFrom = today(), headers = this.asAdmin()) => {
    const call = this.assignHeadRaw(departmentId, employeeId, effectiveFrom, headers);
    const send = call.end.bind(call);
    call.end = (callback?: request.CallbackHandler) => {
      void this.grantManager(employeeId).then(
        () => send(callback),
        (error: unknown) => callback?.(error as Error, undefined as unknown as request.Response),
      );

      return call;
    };

    return call;
  };

  /** What `GET /me` says of the account: its granted roles and the department it heads today. */
  meOf = async (
    account: ApiAccount,
  ): Promise<{
    roles: string[];
    managerScope: { departmentId: string; departmentCode: string } | null;
    selfServiceOnly: boolean;
  }> =>
    (
      (await this.api().get('/api/v1/me').set(this.as(account)).expect(200)).body as {
        data: {
          roles: string[];
          managerScope: { departmentId: string; departmentCode: string } | null;
          selfServiceOnly: boolean;
        };
      }
    ).data;

  auditOf = async (resourceId: string): Promise<{ action: string; before: unknown; after: unknown }[]> =>
    (
      await this.ctx.sql.query<{ action: string; before: unknown; after: unknown }>(
        'SELECT action, before, after FROM audit_events WHERE resource_id = $1 ORDER BY occurred_at, id',
        [resourceId],
      )
    ).rows;

  /** What the termination flow (a later slice) does: the person who has left has no open placement. */
  closePlacements = (employeeId: string) =>
    this.ctx.sql.query('UPDATE employee_placements SET valid_to = $2 WHERE employee_id = $1 AND valid_to IS NULL', [
      employeeId,
      today(),
    ]);

  rowCount = async (table: string): Promise<number> =>
    (await this.ctx.sql.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n;

  /** The employees whose placements are not exactly what the invariant I-2 asks for, over everything this file made. */
  placementViolations = () => findPlacementCoverageViolations(this.ctx.sql);

  async start() {
    this.ctx = await createHttpTestApp();
    this.seed = await seedInstallation(this.ctx.app);
    this.admin = await adminToken(this.ctx, this.seed);
    this.finance = await createActivatedAccount(this.ctx, this.seed, {
      code: 'E-FIN',
      email: 'fin@acme.vn',
      roles: ['FINANCE'],
      admin: this.admin,
    });
    this.it1 = await createActivatedAccount(this.ctx, this.seed, {
      code: 'E-IT1',
      email: 'it1@acme.vn',
      roles: ['IT_ADMIN'],
      admin: this.admin,
    });
    this.it2 = await createActivatedAccount(this.ctx, this.seed, {
      code: 'E-IT2',
      email: 'it2@acme.vn',
      roles: ['IT_ADMIN'],
      admin: this.admin,
    });
    // What keeps a department or a Cost Center in use lives in other modules: every group answers with nothing unless a case says so.
    this.useFacts = registerUseReaders(this.ctx.app);
  }

  afterEach() {
    this.useFacts.openWork = [];
    this.useFacts.subscriptions = [];
  }

  async stop() {
    await this.ctx?.close();
  }
}
