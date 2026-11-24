import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { ApiAccount, adminToken, createActivatedAccount } from '../../support/api-accounts';
import { HttpTestApp, SeededInstallation, createHttpTestApp, seedInstallation } from '../../support/http-test-app';
import { declareApplication } from '../../support/builders/catalog.builder';

interface PlanWire {
  id: string;
  name: string;
  provisioningType: string;
  keyBinding: string | null;
  hasAdminConsole: boolean;
  referencePrice: { amount: string; currency: string } | null;
}

/**
 * Redesign wave 2, W2-17 (a) (b) (c) (d): how a K4 plan is bound once bought (to an account, to a machine by a key, or bundled with the
 * machine), what a plan of each kind may say, when the binding may not move, and that a plan bundled with the machine has no purchase.
 */
describe('the key binding of a plan over HTTP (integration, real PostgreSQL)', () => {
  let ctx: HttpTestApp;
  let seed: SeededInstallation;
  let it1: ApiAccount;
  let counter = 0;
  const server = () => ctx.app.getHttpServer();
  const as = (account: ApiAccount) => ({ Authorization: `Bearer ${account.accessToken}` });

  beforeAll(async () => {
    ctx = await createHttpTestApp();
    seed = await seedInstallation(ctx.app);
    const admin = await adminToken(ctx, seed);
    it1 = await createActivatedAccount(ctx, seed, { code: 'E-IT1', email: 'it1@acme.vn', role: 'IT_ADMIN', admin });
  }, 120000);

  afterAll(async () => {
    await ctx?.close();
  });

  const unique = (prefix: string): string => `${prefix} ${(counter += 1)}`;
  const dataOf = <T>(response: request.Response): T => (response.body as { data: T }).data;
  const codeOf = (response: request.Response): string => (response.body as { error: { code: string } }).error.code;
  const reasonOf = (response: request.Response): string =>
    (response.body as { error: { details: { reason: string } } }).error.details.reason;
  const createPlan = (body: object) => request(server()).post('/api/v1/plans').set(as(it1)).send(body);
  const patchPlan = (id: string, body: object) =>
    request(server()).patch(`/api/v1/plans/${id}`).set(as(it1)).send(body);
  const getPlan = (id: string) => request(server()).get(`/api/v1/plans/${id}`).set(as(it1));
  const licensed = (name = unique('Software')): Promise<string> =>
    declareApplication(ctx, it1.accessToken, {
      name,
      kind: 'LICENSED',
      vendorName: unique('Vendor'),
      dataSensitivity: 'LOW',
    });
  const k4 = (applicationId: string, extra: object = {}) => ({
    applicationId,
    name: unique('Perpetual'),
    provisioningType: 'K4',
    controlLevel: 'FULL',
    ...extra,
  });
  const k4Plan = async (extra: object = {}): Promise<PlanWire> =>
    dataOf<PlanWire>(await createPlan(k4(await licensed(), extra)).expect(201));

  describe('declaring a plan', () => {
    it('stores the binding a K4 plan names, and binds one that names none to an account', async () => {
      const autocad = dataOf<PlanWire>(
        await createPlan(k4(await licensed('AutoCAD 2026'), { keyBinding: 'DEVICE_KEY' })).expect(201),
      );
      const windows = dataOf<PlanWire>(
        await createPlan(
          k4(await licensed('Windows 11 Pro OEM'), { name: 'OEM', keyBinding: 'DEVICE_BUNDLED' }),
        ).expect(201),
      );
      const office = dataOf<PlanWire>(await createPlan(k4(await licensed('Office LTSC 2021'))).expect(201));

      expect([autocad.keyBinding, windows.keyBinding, office.keyBinding]).toEqual([
        'DEVICE_KEY',
        'DEVICE_BUNDLED',
        'ACCOUNT',
      ]);
      expect(dataOf<PlanWire>(await getPlan(autocad.id).expect(200)).keyBinding).toBe('DEVICE_KEY');
      expect(dataOf<PlanWire>(await getPlan(office.id).expect(200)).keyBinding).toBe('ACCOUNT');
    });

    it('gives a plan of another kind no binding, and refuses one that names a binding', async () => {
      const saas = await declareApplication(ctx, it1.accessToken, {
        name: unique('Saas'),
        kind: 'SAAS',
        vendorName: unique('Vendor'),
        dataSensitivity: 'LOW',
      });
      const k2 = { applicationId: saas, name: unique('Org'), provisioningType: 'K2', controlLevel: 'FULL' };

      const refused = await createPlan({ ...k2, keyBinding: 'ACCOUNT' }).expect(422);

      expect(codeOf(refused)).toBe('PLAN.KEY_BINDING_NOT_APPLICABLE');
      expect(dataOf<PlanWire>(await createPlan(k2).expect(201)).keyBinding).toBeNull();
    });

    it('gives a plan bundled with the machine no reference price and no admin console', async () => {
      const application = await licensed();
      const bundled = { keyBinding: 'DEVICE_BUNDLED' };
      const price = { amount: '1000000', currency: 'VND' };

      expect(codeOf(await createPlan(k4(application, { ...bundled, referencePrice: price })).expect(422))).toBe(
        'PLAN.REFERENCE_PRICE_NOT_APPLICABLE',
      );
      expect(codeOf(await createPlan(k4(application, { ...bundled, hasAdminConsole: true })).expect(422))).toBe(
        'PLAN.ADMIN_CONSOLE_NOT_APPLICABLE',
      );
      expect(await createPlan(k4(application, { ...bundled, name: 'Free of a price' })).expect(201)).toBeDefined();
      // A plan bound to a machine by a key is bought, so it may have a price.
      expect(
        dataOf<PlanWire>(
          await createPlan(k4(application, { keyBinding: 'DEVICE_KEY', referencePrice: price })).expect(201),
        ).referencePrice,
      ).toEqual(price);
    });
  });

  describe('listing plans', () => {
    it('lists the binding of each plan and keeps only the plans bound a given way', async () => {
      const deviceKey = await k4Plan({ keyBinding: 'DEVICE_KEY' });
      const account = await k4Plan();

      const all = dataOf<{ items: PlanWire[] }>(
        await request(server()).get('/api/v1/plans?pageSize=100').set(as(it1)).expect(200),
      );
      const onlyKeys = dataOf<{ items: PlanWire[] }>(
        await request(server()).get('/api/v1/plans?keyBinding=DEVICE_KEY&pageSize=100').set(as(it1)).expect(200),
      );

      expect(all.items.find((item) => item.id === account.id)?.keyBinding).toBe('ACCOUNT');
      expect(onlyKeys.items.map((item) => item.id)).toContain(deviceKey.id);
      expect(onlyKeys.items.map((item) => item.id)).not.toContain(account.id);
      expect(new Set(onlyKeys.items.map((item) => item.keyBinding))).toEqual(new Set(['DEVICE_KEY']));
    });
  });

  describe('changing a plan', () => {
    it('takes the binding away from a plan that stops being K4, and binds one that becomes K4 to an account', async () => {
      const plan = await k4Plan();

      const toK2 = dataOf<PlanWire>(await patchPlan(plan.id, { provisioningType: 'K2' }).expect(200));
      const backToK4 = dataOf<PlanWire>(await patchPlan(plan.id, { provisioningType: 'K4' }).expect(200));

      // A licensed application cannot hold a K2 plan the kind allows, so the change above may be refused by the shape rules; what counts
      // is that the binding follows the kind whichever way the plan went.
      expect([toK2.keyBinding, backToK4.keyBinding]).toEqual([null, 'ACCOUNT']);
    });

    it('changes the binding of a plan nothing rests on, and refuses a binding for a plan that leaves K4 in the same change', async () => {
      const plan = await k4Plan();

      expect(dataOf<PlanWire>(await patchPlan(plan.id, { keyBinding: 'DEVICE_KEY' }).expect(200)).keyBinding).toBe(
        'DEVICE_KEY',
      );
      expect(codeOf(await patchPlan(plan.id, { provisioningType: 'K2', keyBinding: 'DEVICE_KEY' }).expect(422))).toBe(
        'PLAN.KEY_BINDING_NOT_APPLICABLE',
      );
    });

    it('refuses to bundle a plan that still has a price or a console, and lets the change clear them', async () => {
      const plan = await k4Plan({ referencePrice: { amount: '500000', currency: 'VND' } });

      expect(codeOf(await patchPlan(plan.id, { keyBinding: 'DEVICE_BUNDLED' }).expect(422))).toBe(
        'PLAN.REFERENCE_PRICE_NOT_APPLICABLE',
      );
      const cleared = dataOf<PlanWire>(
        await patchPlan(plan.id, { keyBinding: 'DEVICE_BUNDLED', referencePrice: null }).expect(200),
      );
      expect(cleared).toMatchObject({ keyBinding: 'DEVICE_BUNDLED', referencePrice: null });
    });

    it('refuses to change the binding of a plan that has a perpetual purchase (KEY_BINDING_PURCHASES)', async () => {
      const plan = await k4Plan({ keyBinding: 'DEVICE_KEY' });
      await request(server())
        .post('/api/v1/subscriptions')
        .set(as(it1))
        .send({
          planId: plan.id,
          kind: 'PERPETUAL',
          purchasedQuantity: 3,
          unitPrice: { amount: '2000000', currency: 'VND' },
          startDate: '2026-03-15',
          responsibleItAdminEmployeeId: it1.employeeId,
        })
        .expect(201);

      const refused = await patchPlan(plan.id, { keyBinding: 'ACCOUNT' }).expect(409);

      expect(codeOf(refused)).toBe('PLAN.IN_USE_BLOCKS_CHANGE');
      expect(reasonOf(refused)).toBe('KEY_BINDING_PURCHASES');
    });

    it('refuses to change the binding of a plan on which a person holds a seat (KEY_BINDING_ASSIGNMENTS)', async () => {
      const plan = await k4Plan();
      await ctx.sql.query(
        `INSERT INTO license_assignments (id, organization_id, kind, source, plan_id, employee_id, account_identifier,
           normalized_account_identifier, valid_from, valid_from_basis, created_by_app_user_id)
         SELECT gen_random_uuid(), e.organization_id, 'PERSONAL', 'REQUEST', $1, e.id, 'a@acme.vn', 'a@acme.vn', '2026-01-05', 'ACTUAL', $3
           FROM employees e WHERE e.id = $2`,
        [plan.id, it1.employeeId, randomUUID()],
      );

      const refused = await patchPlan(plan.id, { keyBinding: 'DEVICE_KEY' }).expect(409);

      expect(codeOf(refused)).toBe('PLAN.IN_USE_BLOCKS_CHANGE');
      expect(reasonOf(refused)).toBe('KEY_BINDING_ASSIGNMENTS');
    });

    it('refuses to change the binding of a plan that has a machine activated on it (DEVICE_ACTIVATIONS)', async () => {
      const plan = await k4Plan({ keyBinding: 'DEVICE_BUNDLED' });
      const deviceId = randomUUID();
      await ctx.sql.query(
        `INSERT INTO managed_devices (id, organization_id, asset_code, normalized_asset_code, hostname, os, device_type, asset_code_origin,
           created_by_app_user_id, updated_at)
         SELECT $1, o.id, $2, $2, 'host', 'Windows', 'OTH', 'LEGACY', $3, now() FROM organizations o LIMIT 1`,
        [deviceId, `M-${deviceId}`, randomUUID()],
      );
      await ctx.sql.query(
        `INSERT INTO device_activations (id, organization_id, device_id, plan_id, license_key_id, origin, activated_on, activated_at,
           activated_by_app_user_id)
         SELECT gen_random_uuid(), o.id, $1, $2, NULL, 'INITIAL', '2026-03-20', now(), $3 FROM organizations o LIMIT 1`,
        [deviceId, plan.id, randomUUID()],
      );

      const refused = await patchPlan(plan.id, { keyBinding: 'DEVICE_KEY' }).expect(409);

      expect(codeOf(refused)).toBe('PLAN.IN_USE_BLOCKS_CHANGE');
      expect(reasonOf(refused)).toBe('DEVICE_ACTIVATIONS');
      expect(dataOf<PlanWire>(await getPlan(plan.id).expect(200)).keyBinding).toBe('DEVICE_BUNDLED');
    });
  });

  describe('a subscription of a plan bundled with the machine', () => {
    it('is refused: nothing is bought for such a plan', async () => {
      const bundled = await k4Plan({ keyBinding: 'DEVICE_BUNDLED' });

      const refused = await request(server())
        .post('/api/v1/subscriptions')
        .set(as(it1))
        .send({
          planId: bundled.id,
          kind: 'PERPETUAL',
          purchasedQuantity: 3,
          unitPrice: { amount: '2000000', currency: 'VND' },
          startDate: '2026-03-15',
          responsibleItAdminEmployeeId: it1.employeeId,
        })
        .expect(422);

      expect(codeOf(refused)).toBe('SUBSCRIPTION.PLAN_HAS_NO_SUBSCRIPTION');
    });
  });
});
