import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { ApiAccount, adminToken, createActivatedAccount } from '../../support/api-accounts';
import { declareApplication } from '../../support/builders/catalog.builder';
import { HttpTestApp, SeededInstallation, createHttpTestApp, seedInstallation } from '../../support/http-test-app';
import { PgRelay } from '../../support/pg-relay';
import { QueryCounter, dataStatements } from '../../support/query-count';

interface KeyWire {
  id: string;
  maxActivations: number;
  activationsUsed: number;
  openActivations: number;
  capReached: boolean;
  updatedAt: string;
}
interface SummaryWire {
  purchased: number | null;
  usableKeys: number;
  capacity: number;
  occupied: number;
  free: number;
  keyBinding: string | null;
  warning: string | null;
}
interface PageWire {
  items: KeyWire[];
  summary: SummaryWire;
}

/**
 * Redesign wave 2, W2-21: the cap of activations of a key, the activations it has used, the activations a key already had when it was entered,
 * and the capacity of a purchase of keys that go on machines (counted by licenses, not by keys).
 */
describe('the activations of the license keys (integration, real PostgreSQL)', () => {
  let ctx: HttpTestApp;
  let seed: SeededInstallation;
  let relay: PgRelay;
  let counter: QueryCounter;
  let it1: ApiAccount;
  let employee: ApiAccount;
  let n = 0;
  const server = () => ctx.app.getHttpServer();
  const as = (account: ApiAccount) => ({ Authorization: `Bearer ${account.accessToken}` });

  beforeAll(async () => {
    ctx = await createHttpTestApp({
      appDatabaseUrl: async (directUrl) => {
        const url = new URL(directUrl);
        relay = await PgRelay.start(url.hostname, Number(url.port || 5432));
        url.port = String(relay.port);

        return url.toString();
      },
    });
    counter = QueryCounter.on(relay);
    seed = await seedInstallation(ctx.app);
    const admin = await adminToken(ctx, seed);
    it1 = await createActivatedAccount(ctx, seed, { code: 'E-IT1', email: 'it1@acme.vn', role: 'IT_ADMIN', admin });
    employee = await createActivatedAccount(ctx, seed, {
      code: 'E-EMP',
      email: 'emp@acme.vn',
      role: 'EMPLOYEE',
      admin,
    });
  }, 180000);

  afterAll(async () => {
    await ctx?.close();
    await relay?.stop();
  });

  const unique = (prefix: string): string => `${prefix} ${(n += 1)}`;
  const dataOf = <T>(response: request.Response): T => (response.body as { data: T }).data;
  const codeOf = (response: request.Response): string => (response.body as { error: { code: string } }).error.code;
  const detailsOf = (response: request.Response): Record<string, string> =>
    (response.body as { error: { details: Record<string, string> } }).error.details;
  const keysOf = (count: number): string[] =>
    Array.from({ length: count }, () => `KEY-${randomUUID().replace(/-/g, '').slice(0, 20).toUpperCase()}`);
  const planOf = async (binding: 'ACCOUNT' | 'DEVICE_KEY' | 'DEVICE_BUNDLED'): Promise<string> => {
    const application = await declareApplication(ctx, it1.accessToken, {
      name: unique('Software'),
      kind: 'LICENSED',
      vendorName: unique('Vendor'),
      dataSensitivity: 'LOW',
    });

    return dataOf<{ id: string }>(
      await request(server())
        .post('/api/v1/plans')
        .set(as(it1))
        .send({
          applicationId: application,
          name: unique('Perpetual'),
          provisioningType: 'K4',
          controlLevel: 'FULL',
          keyBinding: binding,
        })
        .expect(201),
    ).id;
  };
  const purchaseOf = async (planId: string, licenses: number): Promise<string> =>
    dataOf<{ id: string }>(
      await request(server())
        .post('/api/v1/license-lots')
        .set(as(it1))
        .send({
          planId,
          purpose: 'STOCK',
          licenseCount: licenses,
          unitPrice: { amount: '2000000', currency: 'VND' },
          purchasedOn: '2026-03-15',
        })
        .expect(201),
    ).id;
  const importKeys = (lotId: string, keys: string[], extra: object = {}) =>
    request(server())
      .post(`/api/v1/license-lots/${lotId}/keys`)
      .set(as(it1))
      .send({ keys, ...extra });
  const listKeys = (lotId: string, query = '') =>
    request(server()).get(`/api/v1/license-keys?licenseLotId=${lotId}${query}`).set(as(it1));
  const patchKey = (id: string, body: object, account: ApiAccount = it1) =>
    request(server()).patch(`/api/v1/license-keys/${id}`).set(as(account)).send(body);
  const activate = async (planId: string, keyId: string, origin: 'OPERATION' | 'INITIAL'): Promise<void> => {
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
       SELECT gen_random_uuid(), o.id, $1, $2, $3, $4::"DeviceActivationOrigin", '2026-03-20', now(), $5 FROM organizations o LIMIT 1`,
      [deviceId, planId, keyId, origin, randomUUID()],
    );
  };

  describe('what a list says of the activations and of the capacity', () => {
    it('counts the activations used (told at import plus every operation), the open ones, and the licenses taken on machines', async () => {
      const plan = await planOf('DEVICE_KEY');
      const purchase = await purchaseOf(plan, 25);
      const imported = await importKeys(purchase, keysOf(1), { maxActivations: 30, initialActivationsUsed: 9 }).expect(
        201,
      );
      expect(dataOf<{ imported: number }>(imported).imported).toBe(1);
      const key = dataOf<PageWire>(await listKeys(purchase).expect(200)).items[0];
      for (let i = 0; i < 3; i += 1) await activate(plan, key.id, 'OPERATION');
      for (let i = 0; i < 7; i += 1) await activate(plan, key.id, 'INITIAL');

      const page = dataOf<PageWire>(await listKeys(purchase).expect(200));

      expect(page.items[0]).toMatchObject({
        maxActivations: 30,
        activationsUsed: 12,
        openActivations: 10,
        capReached: false,
      });
      expect(page.summary).toMatchObject({
        keyBinding: 'DEVICE_KEY',
        purchased: 25,
        usableKeys: 1,
        capacity: 25,
        occupied: 10,
        free: 15,
        warning: null,
      });
    });

    it('says the cap is reached once the activations used are as many as it allows', async () => {
      const plan = await planOf('DEVICE_KEY');
      const purchase = await purchaseOf(plan, 5);
      await importKeys(purchase, keysOf(1), { maxActivations: 2 }).expect(201);
      const key = dataOf<PageWire>(await listKeys(purchase).expect(200)).items[0];
      await activate(plan, key.id, 'OPERATION');
      expect(dataOf<PageWire>(await listKeys(purchase).expect(200)).items[0].capReached).toBe(false);

      await activate(plan, key.id, 'OPERATION');

      expect(dataOf<PageWire>(await listKeys(purchase).expect(200)).items[0]).toMatchObject({
        activationsUsed: 2,
        capReached: true,
      });
    });

    it('keeps counting the smaller of the licenses and the keys for a key given to an account', async () => {
      const plan = await planOf('ACCOUNT');
      const purchase = await purchaseOf(plan, 25);
      await importKeys(purchase, keysOf(3)).expect(201);

      const page = dataOf<PageWire>(await listKeys(purchase).expect(200));

      expect(page.summary).toMatchObject({
        keyBinding: 'ACCOUNT',
        capacity: 3,
        occupied: 0,
        free: 3,
        warning: 'KEY_COUNT_DIFFERS',
      });
    });

    it('runs the same number of statements for 20 keys as for 40 (API-LIST-DETAIL.1)', async () => {
      const plan = await planOf('DEVICE_KEY');
      const purchase = await purchaseOf(plan, 100);
      await importKeys(purchase, keysOf(20)).expect(201);
      const first = await counter.run(() => listKeys(purchase, '&pageSize=100'));
      await importKeys(purchase, keysOf(20)).expect(201);
      const second = await counter.run(() => listKeys(purchase, '&pageSize=100'));

      expect(dataOf<PageWire>(first.result).items).toHaveLength(20);
      expect(dataOf<PageWire>(second.result).items).toHaveLength(40);
      expect(dataStatements(second.statements).length).toBe(dataStatements(first.statements).length);
    });
  });

  describe('the cap and the activations told at import', () => {
    it('takes the install limit in the terms of the plan when the batch names no cap, else one, and the cap the batch names', async () => {
      const limited = await planOf('DEVICE_KEY');
      await ctx.sql.query(`INSERT INTO plan_terms (plan_id, install_limit_max_devices) VALUES ($1, 5)`, [limited]);
      const unlimited = await planOf('DEVICE_KEY');
      const limitedPurchase = await purchaseOf(limited, 10);
      const unlimitedPurchase = await purchaseOf(unlimited, 10);

      await importKeys(limitedPurchase, keysOf(1)).expect(201);
      await importKeys(unlimitedPurchase, keysOf(1)).expect(201);
      await importKeys(limitedPurchase, keysOf(1), { maxActivations: 7 }).expect(201);

      const caps = dataOf<PageWire>(await listKeys(limitedPurchase).expect(200)).items.map(
        (item) => item.maxActivations,
      );
      expect(caps).toEqual([5, 7]);
      expect(dataOf<PageWire>(await listKeys(unlimitedPurchase).expect(200)).items[0].maxActivations).toBe(1);
    });

    it('refuses a plan bundled with the machine: it has no lots or keys (422)', async () => {
      const plan = await planOf('DEVICE_BUNDLED');
      const refused = await request(server())
        .post('/api/v1/license-lots')
        .set(as(it1))
        .send({
          planId: plan,
          purpose: 'STOCK',
          licenseCount: 3,
          unitPrice: { amount: '2000000', currency: 'VND' },
          purchasedOn: '2026-03-15',
        })
        .expect(422);

      expect(codeOf(refused)).toBe('LICENSE_LOT.PLAN_NOT_K4');
    });

    it('refuses a cap outside 1 to 100000 and activations used outside 0 to 100000 (422)', async () => {
      const purchase = await purchaseOf(await planOf('DEVICE_KEY'), 5);

      for (const bad of [{ maxActivations: 0 }, { maxActivations: 100001 }, { initialActivationsUsed: -1 }]) {
        expect(codeOf(await importKeys(purchase, keysOf(1), bad).expect(422))).toBe('VALIDATION_ERROR');
      }
    });
  });

  describe('raising the cap of a key', () => {
    it('raises it on the version the caller read, and refuses a cap that is not higher, a stale version and anyone but an IT Admin', async () => {
      const purchase = await purchaseOf(await planOf('DEVICE_KEY'), 5);
      await importKeys(purchase, keysOf(1), { maxActivations: 30 }).expect(201);
      const read = dataOf<PageWire>(await listKeys(purchase).expect(200)).items[0];

      const raised = dataOf<{ key: KeyWire }>(
        await patchKey(read.id, {
          maxActivations: 40,
          note: 'Vendor allowed more',
          expectedUpdatedAt: read.updatedAt,
        }).expect(200),
      ).key;

      expect(raised.maxActivations).toBe(40);
      expect(raised.updatedAt).not.toBe(read.updatedAt);
      const notHigher = await patchKey(read.id, {
        maxActivations: 35,
        note: 'Back',
        expectedUpdatedAt: raised.updatedAt,
      }).expect(422);
      expect(codeOf(notHigher)).toBe('LICENSE_KEY.MAX_ACTIVATIONS_NOT_RAISED');
      const stale = await patchKey(read.id, {
        maxActivations: 50,
        note: 'Late',
        expectedUpdatedAt: read.updatedAt,
      }).expect(409);
      expect(codeOf(stale)).toBe('LICENSE_KEY.STALE');
      expect(detailsOf(stale).currentUpdatedAt).toBe(raised.updatedAt);
      expect(
        codeOf(
          await patchKey(
            read.id,
            { maxActivations: 50, note: 'Not mine', expectedUpdatedAt: raised.updatedAt },
            employee,
          ).expect(403),
        ),
      ).toBe('AUTHORIZATION.FORBIDDEN');
      expect(
        codeOf(
          await patchKey(randomUUID(), { maxActivations: 50, note: 'Gone', expectedUpdatedAt: read.updatedAt }).expect(
            404,
          ),
        ),
      ).toBe('LICENSE_KEY.NOT_FOUND');
      const audit = await ctx.sql.query<{ before: unknown; after: unknown }>(
        `SELECT before, after FROM audit_events WHERE resource_id = $1 AND action = 'LICENSE_KEY.MAX_ACTIVATIONS_RAISED'`,
        [read.id],
      );
      expect(audit.rows).toEqual([
        { before: { maxActivations: 30 }, after: { maxActivations: 40, note: 'Vendor allowed more' } },
      ]);
    });

    it('refuses a body with a blank note or a missing version (422)', async () => {
      const purchase = await purchaseOf(await planOf('DEVICE_KEY'), 5);
      await importKeys(purchase, keysOf(1)).expect(201);
      const read = dataOf<PageWire>(await listKeys(purchase).expect(200)).items[0];

      for (const body of [
        { maxActivations: 2, note: '  ', expectedUpdatedAt: read.updatedAt },
        { maxActivations: 2, note: 'x' },
      ]) {
        expect(codeOf(await patchKey(read.id, body).expect(422))).toBe('VALIDATION_ERROR');
      }
    });
  });

  describe('the stock summary of the plan', () => {
    it('counts the licenses held on machines for a key that goes on a machine, and the keys for a key on an account', async () => {
      const onMachine = await planOf('DEVICE_KEY');
      const purchase = await purchaseOf(onMachine, 25);
      await importKeys(purchase, keysOf(1)).expect(201);
      const key = dataOf<PageWire>(await listKeys(purchase).expect(200)).items[0];
      for (let i = 0; i < 4; i += 1) await activate(onMachine, key.id, 'OPERATION');
      const onAccount = await planOf('ACCOUNT');
      const accountPurchase = await purchaseOf(onAccount, 10);
      await importKeys(accountPurchase, keysOf(2)).expect(201);

      const stockOf = async (planId: string) =>
        dataOf<{ items: { stock: unknown }[] }>(
          await request(server()).get(`/api/v1/stock-summary?planId=${planId}`).set(as(it1)).expect(200),
        ).items[0].stock;

      expect(await stockOf(onMachine)).toEqual({ kind: 'LICENSES', purchased: 25, occupied: 4, free: 21 });
      expect(await stockOf(onAccount)).toEqual({ kind: 'KEYS', inStore: 2, assigned: 0, withdrawn: 0 });
    });
  });

  describe('the activations a key already had when it was entered', () => {
    it('cannot be more than the cap of the batch (422), told or left to its default of one, and nothing is kept', async () => {
      const purchase = await purchaseOf(await planOf('DEVICE_KEY'), 5);

      const over = await importKeys(purchase, keysOf(1), { maxActivations: 5, initialActivationsUsed: 6 }).expect(422);
      expect(codeOf(over)).toBe('LICENSE_KEY.INITIAL_ACTIVATIONS_EXCEED_MAX');
      expect(detailsOf(over)).toEqual({ initialActivationsUsed: 6, maxActivations: 5 });
      expect(codeOf(await importKeys(purchase, keysOf(1), { initialActivationsUsed: 2 }).expect(422))).toBe(
        'LICENSE_KEY.INITIAL_ACTIVATIONS_EXCEED_MAX',
      );
      expect(dataOf<PageWire>(await listKeys(purchase).expect(200)).items).toHaveLength(0);

      await importKeys(purchase, keysOf(1), { maxActivations: 5, initialActivationsUsed: 5 }).expect(201);
      expect(dataOf<PageWire>(await listKeys(purchase).expect(200)).items[0]).toMatchObject({ activationsUsed: 5 });
    });

    it('cannot be told for a plan whose keys go to an account (422): only machines count activations', async () => {
      const purchase = await purchaseOf(await planOf('ACCOUNT'), 5);

      expect(codeOf(await importKeys(purchase, keysOf(1), { initialActivationsUsed: 1 }).expect(422))).toBe(
        'LICENSE_KEY.INITIAL_ACTIVATIONS_ON_ACCOUNT_PLAN',
      );
      expect(dataOf<PageWire>(await listKeys(purchase).expect(200)).items).toHaveLength(0);

      await importKeys(purchase, keysOf(1), { initialActivationsUsed: 0 }).expect(201);
    });

    // Last of the file: it closes the seat baseline, after which a batch that tells activations is turned away with 409 whatever it tells.
    it('are told while the installation phase is open, and refused after it closes (409), where 0 is allowed whenever', async () => {
      const purchase = await purchaseOf(await planOf('DEVICE_KEY'), 5);
      await importKeys(purchase, keysOf(1), { maxActivations: 5, initialActivationsUsed: 4 }).expect(201);
      expect(dataOf<PageWire>(await listKeys(purchase).expect(200)).items[0].activationsUsed).toBe(4);

      await request(server()).post('/api/v1/seat-baseline/close').set(as(it1)).expect(200);

      expect(
        codeOf(await importKeys(purchase, keysOf(1), { maxActivations: 5, initialActivationsUsed: 4 }).expect(409)),
      ).toBe('LICENSE_KEY.INITIALIZATION_CLOSED');
      await importKeys(purchase, keysOf(1), { initialActivationsUsed: 0 }).expect(201);
      await importKeys(purchase, keysOf(1)).expect(201);
    });
  });
});
