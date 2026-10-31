import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { OperatingParametersApi } from '../../src/modules/operating-parameters/public/operating-parameters.api';
import { pretendBusinessToday } from './pretend-today';
import { ApiAccount, adminToken, createActivatedAccount } from './api-accounts';
import {
  HttpTestApp,
  SeededInstallation,
  createHttpTestApp,
  insertEmployeeFixture,
  seedInstallation,
} from './http-test-app';

/** Subscriptions and perpetual purchases over HTTP: the set-up the subscription specs share. */
export interface SubscriptionWire {
  id: string;
  planId: string;
  ownerDepartmentId: string;
  vendor: { id: string; name: string };
  kind: string;
  status: string;
  missingFinancialData: boolean;
  missing: string[];
  purchasedQuantity: number | null;
  unitPrice: { amount: string; currency: string } | null;
  priceSnapshot: {
    recordedOn: string;
    rate: string;
    rateDate: string;
    rateSource: string;
    reportingAmount: string;
    reportingCurrency: string;
    exchangeRateId: string | null;
  } | null;
  billingCycle: string | null;
  startDate: string | null;
  endDate: string | null;
  renewalDate: string | null;
  noticePeriodDays: number | null;
  autoRenew: boolean;
  noticeDeadline: { value: string | null; source: string };
  alerts: { baseDate: string | null; dates: string[] };
  warnings: string[];
  taxProfile: { status: string; group: string | null };
  taxEstimate: {
    basis: string;
    label: string;
    group: string;
    taxAmount: string;
    deductibleTaxAmount: string;
    nonDeductibleTaxAmount: string;
    estimatedCost: string;
  } | null;
  updatedAt: string;
}

export const NO = { personToPersonMessaging: false, callsOrMeetings: false, mailbox: false };

export const USD_1200 = { amount: '1200.00', currency: 'USD' };

export interface PlanSetup {
  kind?: 'SAAS' | 'LICENSED' | 'INTERNAL';
  type?: string;
  pricing?: string;
  vendorName?: string;
}

/** The set-up the specs of this file share: the application, its accounts and the calls and reads they make. No assertion lives here. */
export class SubscriptionHttpHarness {
  ctx!: HttpTestApp;

  seed!: SeededInstallation;

  admin!: string;

  it1!: ApiAccount;

  finance!: ApiAccount;

  employee!: ApiAccount;

  businessOwner!: string;

  parameters!: OperatingParametersApi;

  counter = 0;

  server = () => this.ctx.app.getHttpServer();

  as = (account: ApiAccount) => ({ Authorization: `Bearer ${account.accessToken}` });

  unique = (prefix: string): string => `${prefix} ${(this.counter += 1)}`;

  dataOf = <T>(response: request.Response): T => (response.body as { data: T }).data;

  codeOf = (response: request.Response): string => (response.body as { error: { code: string } }).error.code;

  detailsOf = (response: request.Response) =>
    (response.body as { error: { details: Record<string, unknown> } }).error.details;

  /** Pretends the organization's calendar says `day`: the day a price is recorded on. */
  today = (day: string) => pretendBusinessToday(this.ctx.app, day);

  /** The rate of a currency on a day, entered once: asking for the same one again returns the row that is there. */
  rate = async (currency: string, day: string, value: string): Promise<string> => {
    await this.ctx.sql.query(
      `INSERT INTO exchange_rates (id, organization_id, currency, rate_date, rate) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (organization_id, currency, rate_date) DO NOTHING`,
      [randomUUID(), this.seed.organizationId, currency, day, value],
    );
    const row = await this.ctx.sql.query<{ id: string }>(
      `SELECT id FROM exchange_rates WHERE organization_id = $1 AND currency = $2 AND rate_date = $3`,
      [this.seed.organizationId, currency, day],
    );

    return row.rows[0].id;
  };

  /** A vendor, an application and a plan, made the way the catalog makes them. */
  plan = async (setup: PlanSetup = {}): Promise<{ planId: string; vendorId: string | null; applicationId: string }> => {
    const kind = setup.kind ?? 'SAAS';
    const application = this.dataOf<{ id: string; vendor: { id: string } | null }>(
      await request(this.server())
        .post('/api/v1/applications')
        .set(this.as(this.it1))
        .send({
          name: this.unique('App'),
          kind,
          ...(kind === 'INTERNAL' ? {} : { vendorName: setup.vendorName ?? this.unique('Vendor') }),
          dataSensitivity: 'LOW',
          businessOwnerEmployeeId: this.businessOwner,
          communication: NO,
        })
        .expect(201),
    );
    const type = setup.type ?? (kind === 'INTERNAL' ? 'K5' : 'K2');
    const created = this.dataOf<{ id: string }>(
      await request(this.server())
        .post('/api/v1/plans')
        .set(this.as(this.it1))
        .send({
          applicationId: application.id,
          name: this.unique('Plan'),
          provisioningType: type,
          ...(type === 'K5' ? {} : { pricingModel: setup.pricing ?? 'PER_SEAT', controlLevel: 'FULL' }),
        })
        .expect(201),
    );

    return { planId: created.id, vendorId: application.vendor?.id ?? null, applicationId: application.id };
  };

  /** Declares a subscription owned by the seeded department unless the body names another (or `undefined`: none, F02). */
  create = (body: object, account: ApiAccount = this.it1) =>
    request(this.server())
      .post('/api/v1/subscriptions')
      .set(this.as(account))
      .send({ ownerDepartmentId: this.seed.departmentId, ...body });

  patch = (id: string, body: object, account: ApiAccount = this.it1) =>
    request(this.server()).patch(`/api/v1/subscriptions/${id}`).set(this.as(account)).send(body);

  get = (id: string, account: ApiAccount = this.it1) =>
    request(this.server()).get(`/api/v1/subscriptions/${id}`).set(this.as(account));

  complete = (id: string, account: ApiAccount = this.it1) =>
    request(this.server()).post(`/api/v1/subscriptions/${id}/completions`).set(this.as(account));

  subscription = async (planId: string, extra: object = {}): Promise<SubscriptionWire> =>
    this.dataOf<SubscriptionWire>(await this.create({ planId, kind: 'TERM', ...extra }).expect(201));

  n = async (table: string): Promise<number> =>
    (await this.ctx.sql.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n;

  auditOf = async (resourceId: string) =>
    (
      await this.ctx.sql.query<{ action: string; before: unknown; after: unknown; actor_roles: string[] }>(
        'SELECT action, before, after, actor_roles FROM audit_events WHERE resource_id = $1 ORDER BY occurred_at, id',
        [resourceId],
      )
    ).rows;

  declareProfile = (vendorId: string, body: object) =>
    request(this.server()).put(`/api/v1/vendors/${vendorId}/tax-profile`).set(this.as(this.finance)).send(body);

  async start() {
    this.ctx = await createHttpTestApp();
    this.seed = await seedInstallation(this.ctx.app);
    this.admin = await adminToken(this.ctx, this.seed);
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
    this.employee = await createActivatedAccount(this.ctx, this.seed, {
      code: 'E-EMP',
      email: 'emp@acme.vn',
      roles: [],
      admin: this.admin,
    });
    this.businessOwner = (
      await insertEmployeeFixture(this.ctx.app, this.seed, { code: 'E-OWN', email: 'owner@acme.vn' })
    ).employeeId;
    this.parameters = this.ctx.app.get(OperatingParametersApi, { strict: false });
  }

  afterEach() {
    jest.restoreAllMocks();
  }

  async stop() {
    await this.ctx?.close();
  }
}
