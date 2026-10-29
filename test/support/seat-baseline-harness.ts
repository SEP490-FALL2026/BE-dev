import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { TransactionRunner } from '../../src/infrastructure/database/transaction-runner';
import { OrganizationApi } from '../../src/modules/organization/public/organization.api';
import type { ApiAccount } from './api-accounts';
import { buildActivatedAccount, signIn } from './builders/account.builder';
import { declareApplication, declarePlan, declareSubscription } from './builders/catalog.builder';
import { createCostCenter } from './builders/organization.builder';
import {
  HttpTestApp,
  SeededInstallation,
  createHttpTestApp,
  insertEmployeeFixture,
  seedInstallation,
} from './http-test-app';

const NO = { personToPersonMessaging: false, callsOrMeetings: false, mailbox: false };

export interface ImportWire {
  id: string;
  status: string;
  previewVersion: number;
  target: { kind: string; subscriptionId: string | null; planId: string; provisioningType: string };
  ignoredColumns: string[];
  summary: {
    totalRows: number;
    valid: number;
    errors: number;
    byCode: Record<string, number>;
    seats: { purchased: number; occupiedBefore: number; freeBefore: number; freeAfter: number } | null;
    recordedOn: string;
  };
  result: { created: number; errors: number; occupied: number | null; free: number | null } | null;
}

export interface AssignmentWire {
  id: string;
  source: string;
  kind: string;
  planId: string;
  subscriptionId: string | null;
  employeeId: string;
  accountIdentifier: string;
  reason: string | null;
  costCenterId: string | null;
  effectiveFrom: string;
  effectiveFromBasis: string;
  grantedOn: string | null;
  effectiveFromLabel: string | null;
  validUntil: string | null;
  expectedEndDate: string | null;
  predecessorId: string | null;
}

/** An installation with an IT Admin, Finance, an employee and the helpers every seat baseline test needs. */
export class SeatHarness {
  ctx!: HttpTestApp;
  seed!: SeededInstallation;
  admin!: string;
  it1!: ApiAccount;
  finance!: ApiAccount;
  employee!: ApiAccount;
  businessOwner!: string;
  private counter = 0;
  private readonly people = new Map<string, string>();

  server = () => this.ctx.app.getHttpServer();
  as = (account: ApiAccount) => ({ Authorization: `Bearer ${account.accessToken}` });
  unique = (prefix: string): string => `${prefix} ${(this.counter += 1)}`;
  dataOf = <T>(response: request.Response): T => (response.body as { data: T }).data;
  codeOf = (response: request.Response): string => (response.body as { error: { code: string } }).error.code;
  detailsOf = (response: request.Response) =>
    (response.body as { error: { details: Record<string, unknown> } }).error.details;

  async start(options: Parameters<typeof createHttpTestApp>[0] = {}): Promise<void> {
    this.ctx = await createHttpTestApp(options);
    this.seed = await seedInstallation(this.ctx.app);
    // T2.2: the people every suite starts with are built and signed in through the services, not through HTTP.
    this.admin = await signIn(this.ctx, this.seed.superAdmin.email, this.seed.superAdmin.password);
    this.it1 = await buildActivatedAccount(this.ctx, this.seed, {
      code: 'E-IT1',
      email: 'it1@acme.vn',
      roles: ['IT_ADMIN'],
    });
    this.finance = await buildActivatedAccount(this.ctx, this.seed, {
      code: 'E-FIN',
      email: 'fin@acme.vn',
      roles: ['FINANCE'],
    });
    this.employee = await buildActivatedAccount(this.ctx, this.seed, {
      code: 'E-EMP',
      email: 'emp@acme.vn',
      roles: [],
    });
    this.businessOwner = (
      await insertEmployeeFixture(this.ctx.app, this.seed, { code: 'E-OWN', email: 'owner@acme.vn' })
    ).employeeId;
  }

  async stop(): Promise<void> {
    await this.ctx?.close();
  }

  /** An employee of the company with a work email on its domain, made once per code. */
  async person(
    code: string,
    employmentType: 'STAFF' | 'CONTRACTOR' | 'FREELANCER' | 'INTERN' = 'STAFF',
  ): Promise<string> {
    const known = this.people.get(code);
    if (known) return known;
    const { employeeId } = await insertEmployeeFixture(this.ctx.app, this.seed, {
      code,
      email: `${code.toLowerCase()}@acme.vn`,
    });
    // People of a baseline held their seats before the system knew them: they joined long ago, so a grant date in
    // the past is right unless a test moves the hire date itself.
    await this.ctx.sql.query(`UPDATE employees SET hire_date = '2020-01-01' WHERE id = $1`, [employeeId]);
    if (employmentType !== 'STAFF') {
      await this.ctx.sql.query(`UPDATE employees SET employment_type = $2::"EmploymentType" WHERE id = $1`, [
        employeeId,
        employmentType,
      ]);
    }
    this.people.set(code, employeeId);

    return employeeId;
  }

  /** Many employees in one statement: `${prefix}0` … `${prefix}${count - 1}`, all staff with an acme.vn email, placed in the seed department. */
  async crowd(prefix: string, count: number): Promise<void> {
    await this.ctx.sql.query(
      `WITH made AS (
         INSERT INTO employees (id, organization_id, employee_code, full_name, work_email, normalized_work_email,
           employment_type, hire_date, updated_at)
         SELECT gen_random_uuid(), $1, $2 || n, $2 || n, lower($2) || n || '@acme.vn', lower($2) || n || '@acme.vn',
                'STAFF', '2026-01-05', now()
           FROM generate_series(0, $3::int - 1) AS n
         RETURNING id, organization_id
       )
       INSERT INTO employee_placements (id, organization_id, employee_id, department_id, valid_from)
       SELECT gen_random_uuid(), organization_id, id, $4, '2026-01-05' FROM made`,
      [this.seed.organizationId, prefix, count, this.seed.departmentId],
    );
  }

  /** The Unit the seed department is charged to: where the service accounts of its people are charged (`QĐ-86c`). */
  async ownUnit(): Promise<{ id: string; departmentId: string }> {
    const { rows } = await this.ctx.sql.query<{ id: string }>(
      `SELECT id FROM cost_centers WHERE department_id = $1 AND status = 'ACTIVE'`,
      [this.seed.departmentId],
    );

    return { id: rows[0].id, departmentId: this.seed.departmentId };
  }

  /** T2.2: the catalog a test only stands on is declared through the services as the IT Admin, not through HTTP. */
  private async application(kind: 'SAAS' | 'LICENSED' | 'INTERNAL'): Promise<{ id: string }> {
    return {
      id: await declareApplication(this.ctx, this.it1.accessToken, {
        name: this.unique('App'),
        kind,
        ...(kind === 'INTERNAL' ? {} : { vendorName: this.unique('Vendor') }),
        dataSensitivity: 'LOW',
        businessOwnerEmployeeId: this.businessOwner,
        communication: NO,
      }),
    };
  }

  /** A plan of a new application; `internal` makes a K5 plan of an internal application with no subscription. */
  async plan(type: 'K1' | 'K2' | 'K4' | 'K5' = 'K2', pricing = 'PER_SEAT'): Promise<string> {
    const application = await this.application(type === 'K5' ? 'INTERNAL' : 'SAAS');

    return declarePlan(this.ctx, this.it1.accessToken, {
      applicationId: application.id,
      name: this.unique('Plan'),
      provisioningType: type,
      ...(type === 'K5' ? {} : { pricingModel: pricing, controlLevel: 'FULL' }),
    });
  }

  /**
   * A complete subscription of a new plan, with the seats bought. Without a quantity it is a flat-rate one, which is
   * complete with none: the seats are then not known (INV-01), whereas a per-seat subscription without them is a draft. It is
   * owned by the seed department unless a department is named: a subscription always has an owner department, and a seat sits only
   * on a subscription of its own department (`QĐ-89a`, F20), so a suite whose seats belong to another department names it.
   */
  async subscription(
    quantity: number | null = 100,
    type: 'K1' | 'K2' | 'K4' = 'K2',
    ownerDepartmentId: string = this.seed.departmentId,
  ): Promise<string> {
    const planId = await this.plan(type, quantity === null ? 'FLAT_RATE' : 'PER_SEAT');

    return declareSubscription(this.ctx, this.it1.accessToken, {
      ownerDepartmentId,
      planId,
      kind: 'TERM',
      unitPrice: { amount: '1000000', currency: 'VND' },
      billingCycle: 'MONTHLY',
      startDate: '2026-01-05',
      ...(quantity === null ? {} : { purchasedQuantity: quantity }),
    });
  }

  /** A subscription that still lacks data (no price, start, cycle): a draft, which takes no seat (US-04-03 AC-6). */
  async draftSubscription(type: 'K1' | 'K2' | 'K4' = 'K2'): Promise<string> {
    const planId = await this.plan(type);

    return declareSubscription(this.ctx, this.it1.accessToken, {
      ownerDepartmentId: this.seed.departmentId,
      planId,
      kind: 'TERM',
      purchasedQuantity: 10,
    });
  }

  /** A department with no Cost Center, written the way the installation writes one (`QĐ-87d(1)`). */
  async bareDepartment(): Promise<{ id: string; code: string }> {
    const code = `P-${(this.counter += 1)}-${randomUUID().slice(0, 4)}`.toUpperCase();
    const { id } = await this.ctx.app
      .get(TransactionRunner)
      .run((tx) =>
        this.ctx.app
          .get(OrganizationApi)
          .createDepartment(tx, { organizationId: this.seed.organizationId, code, name: `Department ${code}` }),
      );

    return { id, code };
  }

  /** What Finance sends to create the Cost Center of a department (`QĐ-87d(1)`), through the service (T2.2). */
  async costCenterFor(departmentId: string, kind: 'UNIT' = 'UNIT'): Promise<{ id: string; code: string }> {
    const code = `CC-${(this.counter += 1)}-${randomUUID().slice(0, 4)}`.toUpperCase();

    return createCostCenter(this.ctx, this.finance.accessToken, { code, name: `Name of ${code}`, kind, departmentId });
  }

  /** A Cost Center of its own: Finance creates it for a new department that has none (`QĐ-87d(1)`). */
  async costCenter(kind: 'UNIT' = 'UNIT'): Promise<{ id: string; code: string; departmentId: string }> {
    const department = await this.bareDepartment();

    return { ...(await this.costCenterFor(department.id, kind)), departmentId: department.id };
  }

  /** A CSV file from a header and rows of cells. */
  csv(header: string[], rows: string[][]): Buffer {
    const line = (cells: string[]) =>
      cells.map((cell) => (/[",;\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell)).join(',');

    return Buffer.from([line(header), ...rows.map(line)].join('\n'), 'utf8');
  }

  /** The common file: a person, an identifier and the optional columns that were given. */
  file(rows: Array<Record<string, string>>): Buffer {
    const columns = [
      'employee_code',
      'account_identifier',
      'kind',
      'granted_on',
      'expected_end_date',
      'reason',
      'cost_center_code',
    ];
    const used = columns.filter((column) => rows.some((row) => row[column] !== undefined));

    return this.csv(
      used,
      rows.map((row) => used.map((column) => row[column] ?? '')),
    );
  }

  upload(target: { subscriptionId?: string; planId?: string }, bytes: Buffer | null, account: ApiAccount = this.it1) {
    let call = request(this.server()).post('/api/v1/seat-baseline-imports').set(this.as(account));
    if (target.subscriptionId) call = call.field('subscriptionId', target.subscriptionId);
    if (target.planId) call = call.field('planId', target.planId);
    if (bytes) call = call.attach('file', bytes, 'seats.csv');

    return call;
  }

  async preview(
    target: { subscriptionId?: string; planId?: string },
    rows: Array<Record<string, string>>,
  ): Promise<ImportWire> {
    return this.dataOf<ImportWire>(await this.upload(target, this.file(rows)).expect(201));
  }

  confirm(id: string, previewVersion: number, key: string = randomUUID(), account: ApiAccount = this.it1) {
    return request(this.server())
      .post(`/api/v1/seat-baseline-imports/${id}/confirm`)
      .set(this.as(account))
      .send({ previewVersion, idempotencyKey: key });
  }

  async written(target: { subscriptionId?: string; planId?: string }, rows: Array<Record<string, string>>) {
    const preview = await this.preview(target, rows);
    const response = await this.confirm(preview.id, preview.previewVersion).expect(200);

    return { preview, import: this.dataOf<{ import: ImportWire }>(response).import };
  }

  assignments(filter: Record<string, string | number> = {}, account: ApiAccount = this.it1) {
    return request(this.server())
      .get('/api/v1/license-assignments')
      .query({ pageSize: 100, ...filter })
      .set(this.as(account));
  }

  async assignmentsOf(filter: Record<string, string | number> = {}): Promise<AssignmentWire[]> {
    return this.dataOf<{ items: AssignmentWire[] }>(await this.assignments(filter).expect(200)).items;
  }

  seatUsage(subscriptionId: string, account: ApiAccount = this.it1) {
    return request(this.server()).get(`/api/v1/subscriptions/${subscriptionId}/seat-usage`).set(this.as(account));
  }

  closeBaseline(account: ApiAccount = this.it1) {
    return request(this.server()).post('/api/v1/seat-baseline/close').set(this.as(account));
  }

  async count(table: string): Promise<number> {
    return (await this.ctx.sql.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n;
  }

  async auditOf(resourceType: string, resourceId?: string) {
    return (
      await this.ctx.sql.query<{
        action: string;
        resource_id: string;
        before: unknown;
        after: unknown;
        actor_roles: string[];
      }>(
        `SELECT action, resource_id, before, after, actor_roles FROM audit_events
          WHERE resource_type = $1 AND ($2::text IS NULL OR resource_id = $2) ORDER BY occurred_at, id`,
        [resourceType, resourceId ?? null],
      )
    ).rows;
  }
}
