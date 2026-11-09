import request from 'supertest';
import { CatalogApi } from '../../../src/modules/catalog/public/catalog.api';
import { OrganizationApi } from '../../../src/modules/organization/public/organization.api';
import { OrganizationReadApi } from '../../../src/modules/organization/public/organization-read.api';
import { TransactionRunner } from '../../../src/infrastructure/database/transaction-runner';
import { ApiAccount, adminToken, createActivatedAccount } from '../../support/api-accounts';
import {
  HttpTestApp,
  SeededInstallation,
  createHttpTestApp,
  insertEmployeeFixture,
  seedInstallation,
} from '../../support/http-test-app';

const NO = { personToPersonMessaging: false, callsOrMeetings: false, mailbox: false };

describe('what licensing reads of catalog and organization (integration, real PostgreSQL)', () => {
  let ctx: HttpTestApp;
  let seed: SeededInstallation;
  let it1: ApiAccount;
  let catalog: CatalogApi;
  let organization: OrganizationApi;
  let organizationReads: OrganizationReadApi;
  let runner: TransactionRunner;
  let businessOwner: string;
  let counter = 0;
  const server = () => ctx.app.getHttpServer();
  const as = (account: ApiAccount) => ({ Authorization: `Bearer ${account.accessToken}` });
  const unique = (prefix: string): string => `${prefix} ${(counter += 1)}`;
  const dataOf = <T>(response: request.Response): T => (response.body as { data: T }).data;

  beforeAll(async () => {
    ctx = await createHttpTestApp();
    seed = await seedInstallation(ctx.app);
    const admin = await adminToken(ctx, seed);
    it1 = await createActivatedAccount(ctx, seed, { code: 'E-IT1', email: 'it1@acme.vn', role: 'IT_ADMIN', admin });
    businessOwner = (await insertEmployeeFixture(ctx.app, seed, { code: 'E-OWN', email: 'owner@acme.vn' })).employeeId;
    catalog = ctx.app.get(CatalogApi, { strict: false });
    organization = ctx.app.get(OrganizationApi, { strict: false });
    organizationReads = ctx.app.get(OrganizationReadApi, { strict: false });
    runner = ctx.app.get(TransactionRunner, { strict: false });
  }, 120000);

  afterAll(async () => {
    await ctx?.close();
  });

  const application = async (kind: 'SAAS' | 'LICENSED' | 'INTERNAL') =>
    dataOf<{ id: string; name: string }>(
      await request(server())
        .post('/api/v1/applications')
        .set(as(it1))
        .send({
          name: unique('App'),
          kind,
          ...(kind === 'INTERNAL' ? {} : { vendorName: unique('Vendor') }),
          dataSensitivity: 'LOW',
          businessOwnerEmployeeId: businessOwner,
          communication: NO,
        })
        .expect(201),
    );
  const plan = async (applicationId: string, type: string, pricing?: string) =>
    dataOf<{ id: string; name: string }>(
      await request(server())
        .post('/api/v1/plans')
        .set(as(it1))
        .send({
          applicationId,
          name: unique('Plan'),
          provisioningType: type,
          ...(type === 'K5' ? {} : { pricingModel: pricing ?? 'PER_SEAT', controlLevel: 'FULL' }),
        })
        .expect(201),
    );
  const subscription = async (planId: string, extra: object = {}) =>
    dataOf<{ id: string }>(
      await request(server())
        .post('/api/v1/subscriptions')
        .set(as(it1))
        .send({ ownerDepartmentId: seed.departmentId, planId, kind: 'TERM', ...extra })
        .expect(201),
    ).id;

  describe('CatalogApi, the facade of catalog', () => {
    it('names the plan, the application and the seats bought of a subscription', async () => {
      const app = await application('SAAS');
      const p = await plan(app.id, 'K2', 'PER_SEAT');
      const id = await subscription(p.id, { purchasedQuantity: 100 });

      expect(await catalog.findSeatTarget({ subscriptionId: id })).toEqual({
        kind: 'SUBSCRIPTION',
        allowsMidTermReduction: false,
        subscriptionId: id,
        planId: p.id,
        planName: p.name,
        applicationId: app.id,
        applicationName: app.name,
        applicationKind: 'SAAS',
        provisioningType: 'K2',
        applicationStatus: 'APPROVED',
        status: 'DRAFT',
        missing: ['START_DATE', 'BILLING_CYCLE', 'UNIT_PRICE'],
        purchasedQuantity: 100,
        ownerDepartmentId: seed.departmentId,
      });
    });

    it('says a subscription with all its data is active and lacks nothing, and a draft what it lacks (US-04-03 AC-6)', async () => {
      const app = await application('SAAS');
      const p = await plan(app.id, 'K2', 'PER_SEAT');
      const complete = await subscription(p.id, {
        purchasedQuantity: 10,
        startDate: '2026-01-05',
        billingCycle: 'MONTHLY',
        unitPrice: { amount: '1000000', currency: 'VND' },
      });
      const noPrice = await subscription(p.id, {
        purchasedQuantity: 10,
        startDate: '2026-01-05',
        billingCycle: 'MONTHLY',
      });

      expect(await catalog.findSeatTarget({ subscriptionId: complete })).toMatchObject({
        status: 'ACTIVE',
        missing: [],
      });
      expect(await catalog.findSeatTarget({ subscriptionId: noPrice })).toMatchObject({
        status: 'DRAFT',
        missing: ['UNIT_PRICE'],
      });
    });

    it('says the seats bought are not known while the subscription has no quantity', async () => {
      const app = await application('SAAS');
      const p = await plan(app.id, 'K1', 'PER_SEAT');
      const id = await subscription(p.id);

      expect(await catalog.findSeatTarget({ subscriptionId: id })).toMatchObject({
        provisioningType: 'K1',
        purchasedQuantity: null,
      });
    });

    it('names an internal plan, which has no subscription and no seats bought', async () => {
      const app = await application('INTERNAL');
      const p = await plan(app.id, 'K5');

      expect(await catalog.findSeatTarget({ planId: p.id })).toEqual({
        kind: 'PLAN',
        allowsMidTermReduction: false,
        subscriptionId: null,
        planId: p.id,
        planName: p.name,
        applicationId: app.id,
        applicationName: app.name,
        applicationKind: 'INTERNAL',
        provisioningType: 'K5',
        applicationStatus: 'APPROVED',
        status: null,
        missing: [],
        purchasedQuantity: null,
        ownerDepartmentId: null,
      });
    });

    it('answers null for a subscription or a plan that does not exist', async () => {
      const ghost = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11';

      expect(await catalog.findSeatTarget({ subscriptionId: ghost })).toBeNull();
      expect(await catalog.findSeatTarget({ planId: ghost })).toBeNull();
    });

    it('locks the subscription FOR UPDATE until the transaction ends, so a change of its seats waits', async () => {
      const app = await application('SAAS');
      const p = await plan(app.id, 'K2', 'PER_SEAT');
      const id = await subscription(p.id, { purchasedQuantity: 10 });
      let release!: () => void;
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      let locked!: () => void;
      const isLocked = new Promise<void>((resolve) => {
        locked = resolve;
      });
      const holder = runner.run(async (tx) => {
        expect(await catalog.lockSeatTarget(tx, { subscriptionId: id })).toMatchObject({ purchasedQuantity: 10 });
        locked();
        await held;
      });
      await isLocked;

      let patched = false;
      const patch = request(server())
        .patch(`/api/v1/subscriptions/${id}`)
        .set(as(it1))
        .send({ purchasedQuantity: 12 })
        .then((response) => {
          patched = true;

          return response;
        });
      await new Promise((resolve) => setTimeout(resolve, 400));
      expect(patched).toBe(false);
      release();
      await holder;
      expect((await patch).status).toBe(200);
    });

    it('locks an internal plan FOR SHARE and answers null for one that does not exist', async () => {
      const app = await application('INTERNAL');
      const p = await plan(app.id, 'K5');

      await runner.run(async (tx) => {
        expect(await catalog.lockSeatTarget(tx, { planId: p.id })).toMatchObject({ kind: 'PLAN', planId: p.id });
        expect(await catalog.lockSeatTarget(tx, { planId: '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11' })).toBeNull();
      });
    });
  });

  describe('OrganizationApi, what the baseline reads of people, Cost Centers and domains', () => {
    it('finds employees by code with their employment type and status, and leaves out the unknown codes', async () => {
      const found = await organizationReads.getEmployeesByCodes(['E-IT1', 'E-OWN', 'E-NOBODY']);

      expect(found.map((employee) => employee.employeeCode).sort()).toEqual(['E-IT1', 'E-OWN']);
      expect(found[0]).toEqual(expect.objectContaining({ employmentType: 'STAFF', status: 'ACTIVE' }));
      expect(await organizationReads.getEmployeesByCodes([])).toEqual([]);
    });

    it('finds Cost Centers by code with their kind and status', async () => {
      const code = `CC-LOOKUP-${(counter += 1)}`;
      const bareDepartmentId = async (): Promise<string> =>
        (
          await runner.run((tx) =>
            organization.createDepartment(tx, {
              organizationId: seed.organizationId,
              code: `P-LOOKUP-${counter}`,
              name: 'Lookup',
            }),
          )
        ).id;
      await request(server())
        .post('/api/v1/cost-centers')
        .set(
          as(
            await createActivatedAccount(ctx, seed, {
              code: 'E-FIN',
              email: 'fin@acme.vn',
              role: 'FINANCE',
              admin: await adminToken(ctx, seed),
            }),
          ),
        )
        // A Cost Center is created for a department that exists (`QĐ-87d(1)`).
        .send({ code, name: 'Corporate', kind: 'UNIT', departmentId: await bareDepartmentId() })
        .expect(201);

      const found = await organizationReads.getCostCentersByCodes([code, 'CC-MISSING']);

      expect(found).toEqual([expect.objectContaining({ code, kind: 'UNIT', status: 'ACTIVE' })]);
      expect(await organizationReads.getCostCentersByCodes([])).toEqual([]);
    });

    it('reads the company email domains from the work emails of its people, lower case, without repeats', async () => {
      const domains = await organizationReads.getCompanyEmailDomains();

      expect(domains).toContain('acme.vn');
      expect(new Set(domains).size).toBe(domains.length);
      expect(domains.every((domain) => domain === domain.toLowerCase() && !domain.includes('@'))).toBe(true);
    });
  });
});
