import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { OperatingParametersApi } from '../../../src/modules/operating-parameters/public/operating-parameters.api';
import { OrganizationApi } from '../../../src/modules/organization/public/organization.api';
import { ApiAccount, adminToken, createActivatedAccount } from '../../support/api-accounts';
import {
  HttpTestApp,
  SeededInstallation,
  createHttpTestApp,
  insertEmployeeFixture,
  seedInstallation,
} from '../../support/http-test-app';

interface SubscriptionWire {
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

const NO = { personToPersonMessaging: false, callsOrMeetings: false, mailbox: false };
const USD_1200 = { amount: '1200.00', currency: 'USD' };

describe('subscriptions and perpetual purchases over HTTP (integration, real PostgreSQL)', () => {
  let ctx: HttpTestApp;
  let seed: SeededInstallation;
  let admin: string;
  let it1: ApiAccount;
  let finance: ApiAccount;
  let employee: ApiAccount;
  let businessOwner: string;
  let organization: OrganizationApi;
  let parameters: OperatingParametersApi;
  let counter = 0;
  const server = () => ctx.app.getHttpServer();
  const as = (account: ApiAccount) => ({ Authorization: `Bearer ${account.accessToken}` });

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
    employee = await createActivatedAccount(ctx, seed, { code: 'E-EMP', email: 'emp@acme.vn', roles: [], admin });
    businessOwner = (await insertEmployeeFixture(ctx.app, seed, { code: 'E-OWN', email: 'owner@acme.vn' })).employeeId;
    organization = ctx.app.get(OrganizationApi, { strict: false });
    parameters = ctx.app.get(OperatingParametersApi, { strict: false });
  }, 120000);

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await ctx?.close();
  });

  const unique = (prefix: string): string => `${prefix} ${(counter += 1)}`;
  const dataOf = <T>(response: request.Response): T => (response.body as { data: T }).data;
  const codeOf = (response: request.Response): string => (response.body as { error: { code: string } }).error.code;
  const detailsOf = (response: request.Response) =>
    (response.body as { error: { details: Record<string, unknown> } }).error.details;
  /** Pretends the organization's calendar says `day`: the day a price is recorded on. */
  const today = (day: string) => jest.spyOn(organization, 'businessToday').mockResolvedValue(day);
  /** The rate of a currency on a day, entered once: asking for the same one again returns the row that is there. */
  const rate = async (currency: string, day: string, value: string): Promise<string> => {
    await ctx.sql.query(
      `INSERT INTO exchange_rates (id, organization_id, currency, rate_date, rate) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (organization_id, currency, rate_date) DO NOTHING`,
      [randomUUID(), seed.organizationId, currency, day, value],
    );
    const row = await ctx.sql.query<{ id: string }>(
      `SELECT id FROM exchange_rates WHERE organization_id = $1 AND currency = $2 AND rate_date = $3`,
      [seed.organizationId, currency, day],
    );

    return row.rows[0].id;
  };

  interface PlanSetup {
    kind?: 'SAAS' | 'LICENSED' | 'INTERNAL';
    type?: string;
    pricing?: string;
    vendorName?: string;
  }
  /** A vendor, an application and a plan, made the way the catalog makes them. */
  const plan = async (
    setup: PlanSetup = {},
  ): Promise<{ planId: string; vendorId: string | null; applicationId: string }> => {
    const kind = setup.kind ?? 'SAAS';
    const application = dataOf<{ id: string; vendor: { id: string } | null }>(
      await request(server())
        .post('/api/v1/applications')
        .set(as(it1))
        .send({
          name: unique('App'),
          kind,
          ...(kind === 'INTERNAL' ? {} : { vendorName: setup.vendorName ?? unique('Vendor') }),
          dataSensitivity: 'LOW',
          businessOwnerEmployeeId: businessOwner,
          communication: NO,
        })
        .expect(201),
    );
    const type = setup.type ?? (kind === 'INTERNAL' ? 'K5' : 'K2');
    const created = dataOf<{ id: string }>(
      await request(server())
        .post('/api/v1/plans')
        .set(as(it1))
        .send({
          applicationId: application.id,
          name: unique('Plan'),
          provisioningType: type,
          ...(type === 'K5' ? {} : { pricingModel: setup.pricing ?? 'PER_SEAT', controlLevel: 'FULL' }),
        })
        .expect(201),
    );

    return { planId: created.id, vendorId: application.vendor?.id ?? null, applicationId: application.id };
  };
  /** Declares a subscription owned by the seeded department unless the body names another (or `undefined`: none, F02). */
  const create = (body: object, account: ApiAccount = it1) =>
    request(server())
      .post('/api/v1/subscriptions')
      .set(as(account))
      .send({ ownerDepartmentId: seed.departmentId, ...body });
  const patch = (id: string, body: object, account: ApiAccount = it1) =>
    request(server()).patch(`/api/v1/subscriptions/${id}`).set(as(account)).send(body);
  const get = (id: string, account: ApiAccount = it1) =>
    request(server()).get(`/api/v1/subscriptions/${id}`).set(as(account));
  const complete = (id: string, account: ApiAccount = it1) =>
    request(server()).post(`/api/v1/subscriptions/${id}/completions`).set(as(account));
  const subscription = async (planId: string, extra: object = {}): Promise<SubscriptionWire> =>
    dataOf<SubscriptionWire>(await create({ planId, kind: 'TERM', ...extra }).expect(201));
  const n = async (table: string): Promise<number> =>
    (await ctx.sql.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n;
  const auditOf = async (resourceId: string) =>
    (
      await ctx.sql.query<{ action: string; before: unknown; after: unknown; actor_roles: string[] }>(
        'SELECT action, before, after, actor_roles FROM audit_events WHERE resource_id = $1 ORDER BY occurred_at, id',
        [resourceId],
      )
    ).rows;
  const declareProfile = (vendorId: string, body: object) =>
    request(server()).put(`/api/v1/vendors/${vendorId}/tax-profile`).set(as(finance)).send(body);

  describe('the owner department (F02, QĐ-89a)', () => {
    /** A department of the organization that is no longer active, made the way the organization stops one. */
    const stoppedDepartment = async (): Promise<string> => {
      const departmentId = randomUUID();
      await ctx.sql.query(
        `INSERT INTO departments (id, organization_id, code, name, status, deactivated_at, updated_at)
         VALUES ($1, $2, $3, 'Old department', 'INACTIVE', now(), now())`,
        [departmentId, seed.organizationId, unique('OLD').replace(' ', '-')],
      );

      return departmentId;
    };

    it('declares a subscription for an active department: the wire and the audit event carry the owner', async () => {
      const { planId } = await plan();

      const created = await subscription(planId);

      expect(created.ownerDepartmentId).toBe(seed.departmentId);
      const stored = await ctx.sql.query<{ owner_department_id: string }>(
        'SELECT owner_department_id FROM subscriptions WHERE id = $1',
        [created.id],
      );
      expect(stored.rows[0].owner_department_id).toBe(seed.departmentId);
      const [event] = await auditOf(created.id);
      expect(event).toEqual(
        expect.objectContaining({
          action: 'SUBSCRIPTION.CREATED',
          after: expect.objectContaining({ ownerDepartmentId: seed.departmentId }) as unknown,
        }),
      );
    });

    it('refuses a declaration with no owner department: 422 VALIDATION_ERROR and nothing is written', async () => {
      const { planId } = await plan();
      const before = { subscriptions: await n('subscriptions'), audit: await n('audit_events') };

      const response = await create({ planId, kind: 'TERM', ownerDepartmentId: undefined }).expect(422);

      expect(codeOf(response)).toBe('VALIDATION_ERROR');
      expect({ subscriptions: await n('subscriptions'), audit: await n('audit_events') }).toEqual(before);
    });

    it.each([
      ['a department that does not exist', () => Promise.resolve(randomUUID())],
      ['a department that has been stopped', async () => stoppedDepartment()],
    ])('refuses %s: 422 SUBSCRIPTION.OWNER_DEPARTMENT_INACTIVE and nothing is written', async (_name, owner) => {
      const { planId } = await plan();
      const ownerDepartmentId = await owner();
      const before = { subscriptions: await n('subscriptions'), audit: await n('audit_events') };

      const response = await create({ planId, kind: 'TERM', ownerDepartmentId }).expect(422);

      expect(codeOf(response)).toBe('SUBSCRIPTION.OWNER_DEPARTMENT_INACTIVE');
      expect({ subscriptions: await n('subscriptions'), audit: await n('audit_events') }).toEqual(before);
    });

    it('reads the owner on every subscription (never null), and a change neither gives nor alters it: the body and the database both refuse', async () => {
      const { planId } = await plan();
      const created = await subscription(planId);

      expect(dataOf<SubscriptionWire>(await get(created.id).expect(200)).ownerDepartmentId).toBe(seed.departmentId);
      const changed = dataOf<SubscriptionWire>(await patch(created.id, { purchasedQuantity: 3 }).expect(200));
      expect(changed.ownerDepartmentId).toBe(seed.departmentId);
      const listed = dataOf<{ items: SubscriptionWire[] }>(
        await request(server()).get('/api/v1/subscriptions').query({ planId }).set(as(it1)).expect(200),
      );
      expect(listed.items.map((item) => item.ownerDepartmentId)).toEqual([seed.departmentId]);
      // The owner is not a field of a change; and even by SQL it cannot change or be cleared.
      const refused = await patch(created.id, { ownerDepartmentId: await stoppedDepartment() }).expect(422);
      expect(codeOf(refused)).toBe('VALIDATION_ERROR');
      await expect(
        ctx.sql.query(`UPDATE subscriptions SET owner_department_id = $2 WHERE id = $1`, [
          created.id,
          await stoppedDepartment(),
        ]),
      ).rejects.toMatchObject({ code: '23514' });
      // The trigger that keeps the owner refuses a change to nothing before the NOT NULL of the column is looked at; the column is
      // required all the same.
      await expect(
        ctx.sql.query(`UPDATE subscriptions SET owner_department_id = NULL WHERE id = $1`, [created.id]),
      ).rejects.toMatchObject({ code: '23514' });
      expect(
        (
          await ctx.sql.query<{ is_nullable: string }>(
            `SELECT is_nullable FROM information_schema.columns
              WHERE table_name = 'subscriptions' AND column_name = 'owner_department_id'`,
          )
        ).rows[0].is_nullable,
      ).toBe('NO');
      expect(dataOf<SubscriptionWire>(await get(created.id).expect(200)).ownerDepartmentId).toBe(seed.departmentId);
    });

    it('F23: refuses to declare a subscription for a plan whose application is retired: 422 SUBSCRIPTION.APPLICATION_RETIRED, nothing is written', async () => {
      const { planId, applicationId } = await plan();
      await ctx.sql.query(`UPDATE applications SET catalog_status = 'RETIRED', retired_at = now() WHERE id = $1`, [
        applicationId,
      ]);
      const before = { subscriptions: await n('subscriptions'), audit: await n('audit_events') };

      const response = await create({ planId, kind: 'TERM' }).expect(422);

      expect(codeOf(response)).toBe('SUBSCRIPTION.APPLICATION_RETIRED');
      expect({ subscriptions: await n('subscriptions'), audit: await n('audit_events') }).toEqual(before);
    });
  });

  describe('the milestone for a cancellation (US-04-03)', () => {
    it('AC-1: Figma, 100 seats, renewing 31/12, deadline 01/12, auto renewal: the deadline is used, the alerts count back from it', async () => {
      const { planId } = await plan({ vendorName: 'Figma Inc' });
      today('2026-09-01');
      await rate('USD', '2026-09-01', '25000');

      const created = await subscription(planId, {
        purchasedQuantity: 100,
        unitPrice: USD_1200,
        billingCycle: 'ANNUAL',
        startDate: '2026-01-01',
        renewalDate: '2026-12-31',
        noticeDeadline: '2026-12-01',
        autoRenew: true,
      });

      expect(created).toMatchObject({
        status: 'ACTIVE',
        missingFinancialData: false,
        missing: [],
        purchasedQuantity: 100,
        noticeDeadline: { value: '2026-12-01', source: 'DECLARED' },
        alerts: { baseDate: '2026-12-01', dates: ['2026-11-16', '2026-11-24'] },
        warnings: [],
      });
      expect(await auditOf(created.id)).toEqual([
        expect.objectContaining({ action: 'SUBSCRIPTION.CREATED', before: null, actor_roles: ['IT_ADMIN'] }),
      ]);
    });

    it('AC-2: no deadline but a notice period of 30 days with renewal on 31/12 infers 01/12, unconfirmed; declaring it confirms and is audited', async () => {
      const { planId } = await plan();

      const created = await subscription(planId, { renewalDate: '2026-12-31', noticePeriodDays: 30 });

      expect(created.noticeDeadline).toEqual({ value: '2026-12-01', source: 'INFERRED_UNCONFIRMED' });
      expect(created.alerts.dates).toEqual(['2026-11-16', '2026-11-24']);

      const confirmed = dataOf<SubscriptionWire>(await patch(created.id, { noticeDeadline: '2026-12-01' }).expect(200));
      expect(confirmed.noticeDeadline).toEqual({ value: '2026-12-01', source: 'DECLARED' });
      // The PATCH writes UPDATED and NOTICE_DEADLINE_CONFIRMED in one transaction: compared as a set (P28-02).
      expect((await auditOf(created.id)).map((event) => event.action).sort()).toEqual([
        'SUBSCRIPTION.CREATED',
        'SUBSCRIPTION.NOTICE_DEADLINE_CONFIRMED',
        'SUBSCRIPTION.UPDATED',
      ]);
    });

    it('AC-3: auto renewal with no deadline and no notice period is not guessed: no deadline, no alert, a data-quality warning', async () => {
      const { planId } = await plan();

      const created = await subscription(planId, { endDate: '2026-12-31', autoRenew: true });

      expect(created.noticeDeadline).toEqual({ value: null, source: 'MISSING' });
      expect(created.alerts).toEqual({ baseDate: null, dates: [] });
      expect(created.warnings).toEqual(['NO_ALERT_ANCHOR']);
    });

    it('AC-7: Zoom ends 31/12 with no deadline, no notice period and no auto renewal: alerts from the end date, no warning', async () => {
      const { planId } = await plan({ pricing: 'FLAT_RATE', type: 'K1' });

      const created = await subscription(planId, { endDate: '2026-12-31', autoRenew: false });

      expect(created.noticeDeadline).toEqual({ value: null, source: 'BY_END_DATE' });
      expect(created.alerts).toEqual({ baseDate: '2026-12-31', dates: ['2026-12-16', '2026-12-24'] });
      expect(created.warnings).toEqual([]);
    });

    it('AC-12: a term with no deadline, no notice period, no auto renewal and no end date sets no milestone and warns', async () => {
      const { planId } = await plan();

      const created = await subscription(planId, { startDate: '2026-01-01' });

      expect(created.noticeDeadline).toEqual({ value: null, source: 'MISSING' });
      expect(created.alerts.dates).toEqual([]);
      expect(created.warnings).toEqual(['NO_ALERT_ANCHOR']);
    });

    it('follows the operating parameter for the alert days, as it is now when the subscription is read', async () => {
      const { planId } = await plan();
      const created = await subscription(planId, { endDate: '2026-12-31' });
      expect(created.alerts.dates).toEqual(['2026-12-16', '2026-12-24']);
      jest.spyOn(parameters, 'getValue').mockResolvedValue([30, 10, 1]);

      const read = dataOf<SubscriptionWire>(await get(created.id).expect(200));

      expect(read.alerts).toEqual({ baseDate: '2026-12-31', dates: ['2026-12-01', '2026-12-21', '2026-12-30'] });
    });

    it('lists exactly the subscriptions that warn about having no anchor, whichever way the data is combined', async () => {
      const { planId } = await plan();
      const combos: Array<[string, object]> = [
        ['declared', { noticeDeadline: '2026-12-01', renewalDate: '2026-12-31' }],
        ['inferred from renewal', { noticePeriodDays: 30, renewalDate: '2026-12-31' }],
        ['inferred from end', { noticePeriodDays: 30, endDate: '2026-12-31' }],
        ['by end date', { endDate: '2026-12-31' }],
        ['auto renew no anchor', { autoRenew: true, endDate: '2026-12-31' }],
        ['notice period only', { noticePeriodDays: 30 }],
        ['notice period only and auto renew', { noticePeriodDays: 30, autoRenew: true }],
        ['nothing', {}],
        ['auto renew only', { autoRenew: true }],
      ];
      const made = new Map<string, SubscriptionWire>();
      for (const [name, extra] of combos) made.set(name, await subscription(planId, extra));

      const listed = dataOf<{ items: SubscriptionWire[] }>(
        await request(server())
          .get('/api/v1/subscriptions')
          .query({ planId, warning: 'NO_ALERT_ANCHOR', pageSize: 100 })
          .set(as(it1))
          .expect(200),
      ).items.map((item) => item.id);

      const warned = [...made.values()]
        .filter((item) => item.warnings.includes('NO_ALERT_ANCHOR'))
        .map((item) => item.id);
      expect([...listed].sort()).toEqual([...warned].sort());
      expect(warned).toHaveLength(5);
    });
  });

  describe('a perpetual purchase (AC-8)', () => {
    it('stores 50 licenses at 500 USD bought 15/03/2026, with no term, no milestone and no warning', async () => {
      const { planId } = await plan({ kind: 'LICENSED', type: 'K4' });
      today('2026-03-15');
      await rate('USD', '2026-03-15', '25000');

      const created = dataOf<SubscriptionWire>(
        await create({
          planId,
          kind: 'PERPETUAL',
          purchasedQuantity: 50,
          unitPrice: { amount: '500.00', currency: 'USD' },
          startDate: '2026-03-15',
        }).expect(201),
      );

      expect(created).toMatchObject({
        kind: 'PERPETUAL',
        status: 'ACTIVE',
        purchasedQuantity: 50,
        unitPrice: { amount: '500.00', currency: 'USD' },
        endDate: null,
        renewalDate: null,
        autoRenew: false,
        billingCycle: null,
        noticeDeadline: { value: null, source: 'NOT_APPLICABLE' },
        alerts: { baseDate: null, dates: [] },
        warnings: [],
      });
      expect(created.priceSnapshot).toMatchObject({
        rate: '25000',
        reportingAmount: '12500000',
        reportingCurrency: 'VND',
      });
    });

    it.each([
      ['an end date', { endDate: '2027-01-01' }, ['endDate']],
      ['a renewal date', { renewalDate: '2027-01-01' }, ['renewalDate']],
      ['a deadline', { noticeDeadline: '2026-12-01' }, ['noticeDeadline']],
      ['a notice period', { noticePeriodDays: 30 }, ['noticePeriodDays']],
      ['a billing cycle', { billingCycle: 'ANNUAL' }, ['billingCycle']],
      ['auto renewal', { autoRenew: true }, ['autoRenew']],
      ['a mid-term reduction', { allowsMidTermReduction: true }, ['allowsMidTermReduction']],
      ['an end date and auto renewal', { endDate: '2027-01-01', autoRenew: true }, ['endDate', 'autoRenew']],
    ])(
      'refuses %s: 422 SUBSCRIPTION.PERPETUAL_HAS_NO_TERM naming the field, and stores nothing',
      async (_name, extra, fields) => {
        const { planId } = await plan({ kind: 'LICENSED', type: 'K4' });
        const before = await n('subscriptions');

        const response = await create({ planId, kind: 'PERPETUAL', startDate: '2026-03-15', ...extra }).expect(422);

        expect(codeOf(response)).toBe('SUBSCRIPTION.PERPETUAL_HAS_NO_TERM');
        expect(detailsOf(response)).toEqual({ fields });
        expect(await n('subscriptions')).toBe(before);
      },
    );

    it('is for licensed software only, and a perpetual purchase cannot be given a term later', async () => {
      const saas = await plan({ kind: 'SAAS' });
      const licensed = await plan({ kind: 'LICENSED', type: 'K4' });

      expect(codeOf(await create({ planId: saas.planId, kind: 'PERPETUAL' }).expect(422))).toBe(
        'SUBSCRIPTION.PERPETUAL_NEEDS_LICENSED_APPLICATION',
      );
      const purchase = await subscription(licensed.planId, {
        kind: 'PERPETUAL',
        startDate: '2026-03-15',
        purchasedQuantity: 5,
      });
      const response = await patch(purchase.id, { endDate: '2027-01-01' }).expect(422);
      expect(codeOf(response)).toBe('SUBSCRIPTION.PERPETUAL_HAS_NO_TERM');
    });
  });

  describe('drafts, and the price with its frozen conversion (US-04-05)', () => {
    it('AC-4: Notion, only known to be in use: a draft that says it lacks financial data and what', async () => {
      const { planId } = await plan({ vendorName: 'Notion Labs' });

      const created = await subscription(planId);

      expect(created).toMatchObject({
        status: 'DRAFT',
        missingFinancialData: true,
        missing: ['QUANTITY', 'START_DATE', 'BILLING_CYCLE', 'UNIT_PRICE'],
        unitPrice: null,
        priceSnapshot: null,
      });
    });

    it('US-04-05 AC-1: 1,200 USD recorded on 01/09 at 25,000 is stored as 1,200.00 USD, rate 25,000, 01/09, 30,000,000 VND', async () => {
      const { planId } = await plan();
      today('2026-09-01');
      const rateId = await rate('USD', '2026-09-01', '25000');

      const created = await subscription(planId, {
        purchasedQuantity: 10,
        unitPrice: USD_1200,
        billingCycle: 'ANNUAL',
        startDate: '2026-09-01',
      });

      expect(created.unitPrice).toEqual(USD_1200);
      expect(created.priceSnapshot).toEqual({
        recordedOn: '2026-09-01',
        rate: '25000',
        rateDate: '2026-09-01',
        rateSource: 'MANUAL',
        reportingAmount: '30000000',
        reportingCurrency: 'VND',
        exchangeRateId: rateId,
      });
    });

    it('US-04-05 AC-1: a price in the reporting currency converts at 1 and needs no rate', async () => {
      const { planId } = await plan();

      const created = await subscription(planId, {
        purchasedQuantity: 3,
        unitPrice: { amount: '1500000', currency: 'VND' },
        billingCycle: 'MONTHLY',
        startDate: '2026-09-01',
      });

      expect(created.status).toBe('ACTIVE');
      expect(created.priceSnapshot).toMatchObject({
        rate: '1',
        rateSource: 'SAME_CURRENCY',
        reportingAmount: '1500000',
        exchangeRateId: null,
      });
    });

    it('US-04-05 AC-2: a later rate does not change what was stored, however often it is read', async () => {
      const { planId } = await plan();
      today('2026-09-01');
      await rate('USD', '2026-09-01', '25000');
      const created = await subscription(planId, {
        purchasedQuantity: 10,
        unitPrice: USD_1200,
        billingCycle: 'ANNUAL',
        startDate: '2026-09-01',
      });
      await rate('USD', '2026-10-01', '26000');

      const first = dataOf<SubscriptionWire>(await get(created.id).expect(200));
      const second = dataOf<SubscriptionWire>(await get(created.id).expect(200));

      expect(first.priceSnapshot?.reportingAmount).toBe('30000000');
      expect(second.priceSnapshot).toEqual(first.priceSnapshot);
      expect(second.updatedAt).toBe(created.updatedAt);
    });

    it('US-04-05 AC-5: with no rate for the day the price is stored but not converted, the subscription is a draft, and completing it needs the rate', async () => {
      const { planId } = await plan();
      today('2026-08-15');
      const created = await subscription(planId, {
        purchasedQuantity: 10,
        unitPrice: USD_1200,
        billingCycle: 'ANNUAL',
        startDate: '2026-08-01',
      });

      expect(created).toMatchObject({
        status: 'DRAFT',
        missingFinancialData: true,
        missing: ['EXCHANGE_RATE'],
        unitPrice: USD_1200,
        priceSnapshot: null,
      });
      const early = await complete(created.id).expect(422);
      expect(codeOf(early)).toBe('SUBSCRIPTION.STILL_DRAFT');
      expect(detailsOf(early)).toEqual({ missing: ['EXCHANGE_RATE'] });

      await rate('USD', '2026-08-15', '25100');
      jest.restoreAllMocks();
      const completed = dataOf<SubscriptionWire>(await complete(created.id).expect(200));

      expect(completed.status).toBe('ACTIVE');
      expect(completed.priceSnapshot).toMatchObject({
        recordedOn: '2026-08-15',
        rateDate: '2026-08-15',
        rate: '25100',
        reportingAmount: '30120000',
      });
      expect((await auditOf(created.id)).map((event) => event.action)).toEqual([
        'SUBSCRIPTION.CREATED',
        'SUBSCRIPTION.COMPLETED',
      ]);
      expect(dataOf<SubscriptionWire>(await complete(created.id).expect(200)).updatedAt).toBe(completed.updatedAt);
    });

    it('US-04-05 AC-7: priced on 01/10/2026 with only the rate of 01/01/2025, it waits for the rate of 01/10 and never uses the other; a later edit uses the rate of its day', async () => {
      const { planId } = await plan();
      await rate('USD', '2025-01-01', '24000');
      today('2026-11-03');
      const created = await subscription(planId, {
        purchasedQuantity: 10,
        unitPrice: USD_1200,
        billingCycle: 'ANNUAL',
        startDate: '2025-01-01',
      });
      expect(created).toMatchObject({ status: 'DRAFT', priceSnapshot: null, missing: ['EXCHANGE_RATE'] });

      await rate('USD', '2026-11-03', '26000');
      const completed = dataOf<SubscriptionWire>(await complete(created.id).expect(200));
      expect(completed.priceSnapshot).toMatchObject({
        rateDate: '2026-11-03',
        rate: '26000',
        reportingAmount: '31200000',
      });

      today('2026-11-09');
      await rate('USD', '2026-11-09', '27000');
      const edited = dataOf<SubscriptionWire>(
        await patch(created.id, { unitPrice: { amount: '1300.00', currency: 'USD' } }).expect(200),
      );
      expect(edited.priceSnapshot).toMatchObject({
        recordedOn: '2026-11-09',
        rateDate: '2026-11-09',
        rate: '27000',
        reportingAmount: '35100000',
      });
      const events = await auditOf(created.id);
      const last = events[events.length - 1];
      expect(last.action).toBe('SUBSCRIPTION.UPDATED');
      expect(JSON.stringify(last.before)).toContain('31200000 VND at 26000');
      expect(JSON.stringify(last.after)).toContain('35100000 VND at 27000');

      const before = events.length;
      await patch(created.id, { unitPrice: { amount: '1300.00', currency: 'USD' } }).expect(200);
      expect(await auditOf(created.id)).toHaveLength(before);
    });

    it('does not turn an active subscription back into a draft: a price edit on a day with no rate is refused and changes nothing', async () => {
      const { planId } = await plan();
      today('2026-09-01');
      await rate('USD', '2026-09-01', '25000');
      const created = await subscription(planId, {
        purchasedQuantity: 10,
        unitPrice: USD_1200,
        billingCycle: 'ANNUAL',
        startDate: '2026-09-01',
      });
      today('2026-09-02');

      const response = await patch(created.id, { unitPrice: { amount: '1300.00', currency: 'USD' } }).expect(422);

      expect(codeOf(response)).toBe('SUBSCRIPTION.STILL_DRAFT');
      const after = dataOf<SubscriptionWire>(await get(created.id).expect(200));
      expect(after).toMatchObject({ status: 'ACTIVE', unitPrice: USD_1200 });
      expect(after.updatedAt).toBe(created.updatedAt);
    });

    it('is complete only when a per-seat plan has its quantity, and a flat-rate plan needs none; supplying the rest makes it active', async () => {
      const perSeat = await plan({ pricing: 'PER_SEAT' });
      const flat = await plan({ pricing: 'FLAT_RATE', type: 'K1' });
      const whole = {
        unitPrice: { amount: '2000000', currency: 'VND' },
        billingCycle: 'MONTHLY',
        startDate: '2026-09-01',
      };

      expect(await subscription(perSeat.planId, whole)).toMatchObject({ status: 'DRAFT', missing: ['QUANTITY'] });
      expect(await subscription(flat.planId, whole)).toMatchObject({ status: 'ACTIVE', missing: [] });

      const draft = await subscription(perSeat.planId, whole);
      const done = dataOf<SubscriptionWire>(await patch(draft.id, { purchasedQuantity: 25 }).expect(200));
      expect(done).toMatchObject({ status: 'ACTIVE', missing: [], purchasedQuantity: 25 });
    });

    it('refuses a price that is negative, too large, over-precise or in a currency the system does not know', async () => {
      const { planId } = await plan();
      const before = await n('subscriptions');

      expect(
        codeOf(await create({ planId, kind: 'TERM', unitPrice: { amount: '-1.00', currency: 'USD' } }).expect(422)),
      ).toBe('MONEY_OUT_OF_RANGE');
      expect(
        codeOf(
          await create({ planId, kind: 'TERM', unitPrice: { amount: '10000000000000.01', currency: 'USD' } }).expect(
            422,
          ),
        ),
      ).toBe('MONEY_OUT_OF_RANGE');
      expect(
        codeOf(await create({ planId, kind: 'TERM', unitPrice: { amount: '1.005', currency: 'USD' } }).expect(422)),
      ).toBe('MONEY_SCALE_EXCEEDED');
      expect(
        codeOf(await create({ planId, kind: 'TERM', unitPrice: { amount: '1.5', currency: 'VND' } }).expect(422)),
      ).toBe('MONEY_SCALE_EXCEEDED');
      expect(
        codeOf(await create({ planId, kind: 'TERM', unitPrice: { amount: '10', currency: 'XYZ' } }).expect(422)),
      ).toBe('CURRENCY_NOT_SUPPORTED');
      expect(
        codeOf(await create({ planId, kind: 'TERM', unitPrice: { amount: 'abc', currency: 'USD' } }).expect(422)),
      ).toBe('VALIDATION_ERROR');
      expect(await n('subscriptions')).toBe(before);
    });
  });

  describe('the tax of the vendor (AC-9, AC-11)', () => {
    it('AC-9: a vendor with a T2 profile gives the subscription its profile and an estimate from it, labelled as an estimate', async () => {
      const { planId, vendorId } = await plan({ vendorName: 'Figma Tax' });
      await declareProfile(vendorId as string, {
        lines: [
          { taxType: 'GTGT', ratePercent: '10', deductible: true },
          { taxType: 'TNDN nhà thầu', ratePercent: '5', deductible: false },
        ],
      }).expect(200);
      today('2026-09-01');
      await rate('USD', '2026-09-01', '25000');

      const created = await subscription(planId, {
        purchasedQuantity: 1,
        unitPrice: USD_1200,
        billingCycle: 'ANNUAL',
        startDate: '2026-09-01',
      });

      expect(created.taxProfile).toEqual({ status: 'DECLARED', group: 'T2' });
      expect(created.taxEstimate).toEqual({
        basis: 'PROFILE',
        label: 'ESTIMATE',
        group: 'T2',
        taxAmount: '180.00',
        deductibleTaxAmount: '120.00',
        nonDeductibleTaxAmount: '60.00',
        estimatedCost: '1260.00',
      });
      await request(server())
        .put(`/api/v1/vendors/${vendorId}/tax-profile`)
        .set(as(it1))
        .send({ lines: [] })
        .expect(403);
    });

    it('AC-11: a vendor with no profile: the price is stored, the tax estimate falls back on the default with its own label, and Finance sees the vendor to declare', async () => {
      const { planId, vendorId } = await plan({ vendorName: 'Miro Inc' });
      today('2026-09-01');
      await rate('USD', '2026-09-01', '25000');

      const created = await subscription(planId, {
        purchasedQuantity: 1,
        unitPrice: { amount: '800.00', currency: 'USD' },
        billingCycle: 'ANNUAL',
        startDate: '2026-09-01',
      });

      expect(created.status).toBe('ACTIVE');
      expect(created.taxProfile).toEqual({ status: 'MISSING', group: null });
      expect(created.taxEstimate).toMatchObject({
        basis: 'DEFAULT_NO_PROFILE',
        label: 'ESTIMATE_NO_PROFILE',
        group: 'T2',
        taxAmount: '120.00',
        estimatedCost: '840.00',
      });
      const missing = dataOf<{ items: Array<{ id: string }> }>(
        await request(server())
          .get('/api/v1/vendors')
          .query({ taxProfile: 'MISSING', search: 'miro', pageSize: 100 })
          .set(as(finance))
          .expect(200),
      ).items.map((item) => item.id);
      expect(missing).toContain(vendorId);
    });

    it('shows no tax estimate for a subscription that has no price yet', async () => {
      const { planId } = await plan();

      expect((await subscription(planId)).taxEstimate).toBeNull();
    });
  });

  describe('who may use it (AC-10)', () => {
    it('turns Finance, an employee and the Super Admin away from declaring and changing, and lets only Finance read', async () => {
      const { planId } = await plan();
      const created = await subscription(planId);
      const before = { subscriptions: await n('subscriptions'), audit: await n('audit_events') };
      const asSuperAdmin = { Authorization: `Bearer ${admin}` };

      for (const account of [finance, employee]) {
        await create({ planId, kind: 'TERM' }, account).expect(403);
        await patch(created.id, { purchasedQuantity: 1 }, account).expect(403);
        await complete(created.id, account).expect(403);
      }
      await request(server())
        .post('/api/v1/subscriptions')
        .set(asSuperAdmin)
        .send({ planId, kind: 'TERM' })
        .expect(403);
      await request(server())
        .patch(`/api/v1/subscriptions/${created.id}`)
        .set(asSuperAdmin)
        .send({ purchasedQuantity: 1 })
        .expect(403);
      await request(server()).post(`/api/v1/subscriptions/${created.id}/completions`).set(asSuperAdmin).expect(403);

      expect({ subscriptions: await n('subscriptions'), audit: await n('audit_events') }).toEqual(before);
      await get(created.id, finance).expect(200);
      await request(server()).get('/api/v1/subscriptions').set(as(finance)).expect(200);
      await get(created.id, employee).expect(403);
      await request(server()).get('/api/v1/subscriptions').set(as(employee)).expect(403);
    });
  });

  describe('declaring and changing', () => {
    it('refuses a K5 plan of an internal application, a plan that does not exist, and a plan of nothing', async () => {
      const internal = await plan({ kind: 'INTERNAL' });
      const before = await n('subscriptions');

      expect(codeOf(await create({ planId: internal.planId, kind: 'TERM' }).expect(422))).toBe(
        'SUBSCRIPTION.PLAN_HAS_NO_SUBSCRIPTION',
      );
      expect(codeOf(await create({ planId: randomUUID(), kind: 'TERM' }).expect(422))).toBe(
        'SUBSCRIPTION.PLAN_NOT_FOUND',
      );
      expect(await n('subscriptions')).toBe(before);
    });

    it.each([
      ['a start after the end', { startDate: '2027-01-01', endDate: '2026-12-31' }, 'START_AFTER_END'],
      [
        'a renewal more than a day after the end',
        { endDate: '2026-12-31', renewalDate: '2027-01-02' },
        'RENEWAL_AFTER_END_PLUS_ONE',
      ],
      [
        'a deadline after the renewal',
        { renewalDate: '2026-12-01', noticeDeadline: '2026-12-31' },
        'NOTICE_AFTER_RENEWAL',
      ],
    ])('refuses %s: 422 SUBSCRIPTION.DATES_INVALID %s', async (_name, extra, reason) => {
      const { planId } = await plan();
      const before = await n('subscriptions');

      const response = await create({ planId, kind: 'TERM', ...extra }).expect(422);

      expect(codeOf(response)).toBe('SUBSCRIPTION.DATES_INVALID');
      expect(detailsOf(response)).toEqual({ reason });
      expect(await n('subscriptions')).toBe(before);
    });

    it('changes the dates and the flags, clears an optional date with null, and answers 200 without an audit event for no change', async () => {
      const { planId } = await plan();
      const created = await subscription(planId, { endDate: '2026-12-31', noticePeriodDays: 30 });

      const changed = dataOf<SubscriptionWire>(
        await patch(created.id, { renewalDate: '2026-12-31', autoRenew: true, allowsMidTermReduction: true }).expect(
          200,
        ),
      );
      expect(changed).toMatchObject({ renewalDate: '2026-12-31', autoRenew: true });
      const cleared = dataOf<SubscriptionWire>(
        await patch(created.id, { endDate: null, noticePeriodDays: null }).expect(200),
      );
      expect(cleared).toMatchObject({ endDate: null, noticePeriodDays: null });
      const actions = (await auditOf(created.id)).length;

      await patch(created.id, { autoRenew: true }).expect(200);

      expect(await auditOf(created.id)).toHaveLength(actions);
    });

    it('answers 404 for a missing subscription, 422 for an empty change, and 422 VALIDATION_ERROR for the plan, the kind or a required field set to null', async () => {
      const { planId } = await plan();
      const created = await subscription(planId);

      expect(codeOf(await get(randomUUID()).expect(404))).toBe('SUBSCRIPTION.NOT_FOUND');
      expect(codeOf(await patch(randomUUID(), { purchasedQuantity: 1 }).expect(404))).toBe('SUBSCRIPTION.NOT_FOUND');
      expect(codeOf(await complete(randomUUID()).expect(404))).toBe('SUBSCRIPTION.NOT_FOUND');
      expect(codeOf(await patch(created.id, {}).expect(422))).toBe('SUBSCRIPTION.UPDATE_EMPTY');
      for (const body of [
        { planId: randomUUID() },
        { kind: 'PERPETUAL' },
        { unitPrice: null },
        { purchasedQuantity: null },
        { startDate: null },
        { billingCycle: null },
      ]) {
        expect(codeOf(await patch(created.id, body).expect(422))).toBe('VALIDATION_ERROR');
      }
    });

    it('lists by application, plan, status and kind, in pages, newest last within a plan', async () => {
      const { planId, applicationId } = await plan();
      const other = await plan();
      const first = await subscription(planId);
      const second = await subscription(planId, { purchasedQuantity: 3 });
      await subscription(other.planId);

      const byApplication = dataOf<{ items: SubscriptionWire[]; pagination: { totalItems: number } }>(
        await request(server()).get('/api/v1/subscriptions').query({ applicationId }).set(as(it1)).expect(200),
      );
      expect(byApplication.items.map((item) => item.id)).toEqual([first.id, second.id]);
      expect(byApplication.pagination.totalItems).toBe(2);
      const drafts = dataOf<{ items: SubscriptionWire[] }>(
        await request(server())
          .get('/api/v1/subscriptions')
          .query({ planId, status: 'DRAFT', kind: 'TERM' })
          .set(as(finance))
          .expect(200),
      );
      expect(drafts.items).toHaveLength(2);
      const active = dataOf<{ items: SubscriptionWire[] }>(
        await request(server())
          .get('/api/v1/subscriptions')
          .query({ planId, status: 'ACTIVE' })
          .set(as(it1))
          .expect(200),
      );
      expect(active.items).toEqual([]);
      const paged = dataOf<{ items: SubscriptionWire[] }>(
        await request(server())
          .get('/api/v1/subscriptions')
          .query({ planId, page: 2, pageSize: 1 })
          .set(as(it1))
          .expect(200),
      );
      expect(paged.items.map((item) => item.id)).toEqual([second.id]);
    });

    it('queues nothing wrongly: two simultaneous completions of one draft both answer 200 and complete it once', async () => {
      const { planId } = await plan();
      today('2026-08-20');
      const created = await subscription(planId, {
        purchasedQuantity: 1,
        unitPrice: USD_1200,
        billingCycle: 'ANNUAL',
        startDate: '2026-08-01',
      });
      await rate('USD', '2026-08-20', '25000');
      jest.restoreAllMocks();

      const results = await Promise.all([complete(created.id), complete(created.id)]);

      expect(results.map((response) => response.status)).toEqual([200, 200]);
      expect((await auditOf(created.id)).filter((event) => event.action === 'SUBSCRIPTION.COMPLETED')).toHaveLength(1);
    });
  });
});
