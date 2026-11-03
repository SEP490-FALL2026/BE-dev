import { findPlacementCoverageViolations } from './placement-coverage';
import request from 'supertest';
import { ApiAccount, adminToken, createActivatedAccount } from './api-accounts';
import { HttpTestApp, SeededInstallation, createHttpTestApp, seedInstallation } from './http-test-app';
import { registerUseReaders } from './organization-use-readers';

/** The people import over HTTP: the file header, the calendar and the set-up the import specs share. */
export interface ImportWire {
  id: string;
  fileName: string;
  status: 'PREVIEW' | 'COMPLETED' | 'CANCELLED';
  previewVersion: number;
  ignoredColumns: string[];
  summary: {
    totalRows: number;
    valid: number;
    errors: number;
    existingSame: number;
    existingDifferent: number;
    newPeopleByDepartment: { departmentCode: string; count: number }[];
    departmentsWithoutHead: { code: string; name: string }[];
    duplicateOf: { importId: string; fileName: string } | null;
  };
  result: {
    created: number;
    existingSame: number;
    existingDifferent: number;
    errors: number;
    createdByDepartment: { departmentCode: string; count: number }[];
    departmentsWithoutHead: { code: string }[];
  } | null;
}

export interface RowWire {
  line: number;
  outcome: string;
  cells: Record<string, string>;
  errors: { column: string; code: string }[];
  differences: { column: string; current: string; incoming: string }[] | null;
}

export interface ErrorBody {
  error: { code: string; details?: Record<string, unknown> };
}

export const ORG_TIME_ZONE = 'Asia/Ho_Chi_Minh';

export const HEADER = 'employee_code,full_name,work_email,employment_type,hire_date,department_code,job_title';

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
export class EmployeeImportHttpHarness {
  ctx!: HttpTestApp;

  seed!: SeededInstallation;

  admin!: string;

  adminAppUserId!: string;

  it1!: ApiAccount;

  finance!: ApiAccount;

  counter = 0;

  server = () => this.ctx.app.getHttpServer();

  as = (account: ApiAccount) => ({ Authorization: `Bearer ${account.accessToken}` });

  asIt = () => this.as(this.it1);

  asSuper = () => ({ Authorization: `Bearer ${this.admin}` });

  unique = (prefix: string): string => {
    this.counter += 1;

    return `${prefix}${this.counter}`;
  };

  errorOf = (response: request.Response) => (response.body as ErrorBody).error;

  importOf = (response: request.Response) => (response.body as { data: ImportWire }).data;

  /** A department the Super Admin creates and the Cost Center Finance creates for it, through the API the way the two roles do it. */
  newDepartment = async (): Promise<string> => {
    const code = this.unique('PI-');
    const created = await request(this.server())
      .post('/api/v1/departments')
      .set(this.asSuper())
      .send({ code, name: `Department ${code}` })
      .expect(201);
    const centerCode = this.unique('CCI-');
    await request(this.server())
      .post('/api/v1/cost-centers')
      .set(this.as(this.finance))
      .send({
        code: centerCode,
        name: `Center ${centerCode}`,
        kind: 'UNIT',
        departmentId: (created.body as { data: { id: string } }).data.id,
      })
      .expect(201);

    return code;
  };

  /** The Super Admin retires a department that has no member yet: what a row of a preview that names it finds changed. */
  retireDepartment = async (code: string): Promise<void> => {
    const id = (await this.ctx.sql.query<{ id: string }>('SELECT id FROM departments WHERE code = $1', [code])).rows[0]
      .id;
    await request(this.server()).post(`/api/v1/departments/${id}/deactivate`).set(this.asSuper()).expect(200);
  };

  personRow = (overrides: Partial<Record<string, string>> = {}): string => {
    this.counter += 1;
    const fields = {
      employee_code: `EI-${this.counter}`,
      full_name: `Import Person ${this.counter}`,
      work_email: `import.person.${this.counter}@acme.vn`,
      employment_type: 'STAFF',
      hire_date: '2026-09-01',
      department_code: 'P-OPS',
      job_title: 'Administrator',
      ...overrides,
    };

    return [
      fields.employee_code,
      fields.full_name,
      fields.work_email,
      fields.employment_type,
      fields.hire_date,
      fields.department_code,
      fields.job_title,
    ]
      .map((value) => (/[,"\n]/.test(value ?? '') ? `"${(value ?? '').replaceAll('"', '""')}"` : (value ?? '')))
      .join(',');
  };

  csv = (rows: string[], header = HEADER) => `${header}\n${rows.join('\n')}\n`;

  upload = (content: string, fileName = 'people.csv', headers = this.asSuper()) =>
    request(this.server()).post('/api/v1/employee-imports').set(headers).attach('file', Buffer.from(content), fileName);

  confirm = (
    id: string,
    body: { previewVersion: number; idempotencyKey: string; acknowledgeDuplicateFile?: boolean; hrBasis?: unknown },
    headers = this.asSuper(),
  ) => request(this.server()).post(`/api/v1/employee-imports/${id}/confirmations`).set(headers).send(body);

  rowsOf = async (id: string, outcome?: string): Promise<RowWire[]> =>
    (
      (
        await request(this.server())
          .get(`/api/v1/employee-imports/${id}/rows?pageSize=200${outcome ? `&outcome=${outcome}` : ''}`)
          .set(this.asSuper())
          .expect(200)
      ).body as { data: { items: RowWire[] } }
    ).data.items;

  count = async (table: string): Promise<number> =>
    (await this.ctx.sql.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n;

  /** The employees whose placements are not exactly what the invariant I-2 asks for, over everything this file made. */
  placementViolations = () => findPlacementCoverageViolations(this.ctx.sql);

  async start() {
    this.ctx = await createHttpTestApp();
    this.seed = await seedInstallation(this.ctx.app);
    this.admin = await adminToken(this.ctx, this.seed);
    this.adminAppUserId = (
      await this.ctx.sql.query<{ id: string }>(
        `SELECT u.id FROM app_users u JOIN role_grants g ON g.app_user_id = u.id AND g.role = 'SUPER_ADMIN' AND g.revoked_at IS NULL`,
      )
    ).rows[0].id;
    this.it1 = await createActivatedAccount(this.ctx, this.seed, {
      code: 'E-IT1',
      email: 'it1@acme.vn',
      roles: ['IT_ADMIN'],
      admin: this.admin,
    });
    this.finance = await createActivatedAccount(this.ctx, this.seed, {
      code: 'E-FIN',
      email: 'fin@acme.vn',
      roles: ['FINANCE'],
      admin: this.admin,
    });
    // What keeps a department in use lives in other modules: nothing, unless a case says so.
    registerUseReaders(this.ctx.app);
  }

  async stop() {
    await this.ctx?.close();
  }
}
