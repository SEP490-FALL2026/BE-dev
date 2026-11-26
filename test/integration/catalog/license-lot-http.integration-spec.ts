import request from 'supertest';
import { ApiAccount, adminToken, createActivatedAccount } from '../../support/api-accounts';
import { HttpTestApp, SeededInstallation, createHttpTestApp, seedInstallation } from '../../support/http-test-app';
import { declareApplication, declareSubscription } from '../../support/builders/catalog.builder';

interface LotWire {
  id: string;
  licenseCount: number;
  assigned: number;
  free: number;
  keysInStore: number;
  grantable: number | null;
  purpose: string;
  responsibleItAdminEmployeeId: string | null;
  note: string | null;
  updatedAt: string;
  plan: { id: string; keyBinding: string | null };
  unitPrice: { amount: string; currency: string };
}

/**
 * Redesign wave 3, W3-24 (P14): a lot of licenses of a K4 plan is made by an IT Admin, who then answers for it; the lot holds the keys of its licenses, is read
 * by IT, Finance and the Super Admin, and changes hands only by the Super Admin.
 */
describe('the lots of licenses over HTTP (integration, real PostgreSQL)', () => {
  let ctx: HttpTestApp;
  let seed: SeededInstallation;
  let admin: string;
  let it1: ApiAccount;
  let it2: ApiAccount;
  let finance: ApiAccount;
  let employee: ApiAccount;
  let counter = 0;
  const server = () => ctx.app.getHttpServer();
  const as = (token: string) => ({ Authorization: `Bearer ${token}` });
  const unique = (prefix: string): string => `${prefix} ${(counter += 1)}`;
  const dataOf = <T>(response: request.Response): T => (response.body as { data: T }).data;
  const codeOf = (response: request.Response): string => (response.body as { error: { code: string } }).error.code;

  beforeAll(async () => {
    ctx = await createHttpTestApp();
    seed = await seedInstallation(ctx.app);
    admin = await adminToken(ctx, seed);
    it1 = await createActivatedAccount(ctx, seed, { code: 'E-IT1', email: 'it1@acme.vn', role: 'IT_ADMIN', admin });
    it2 = await createActivatedAccount(ctx, seed, { code: 'E-IT2', email: 'it2@acme.vn', role: 'IT_ADMIN', admin });
    finance = await createActivatedAccount(ctx, seed, { code: 'E-FIN', email: 'fin@acme.vn', role: 'FINANCE', admin });
    employee = await createActivatedAccount(ctx, seed, {
      code: 'E-EMP',
      email: 'emp@acme.vn',
      role: 'EMPLOYEE',
      admin,
    });
  }, 120000);

  afterAll(async () => {
    await ctx?.close();
  });

  /** A K4 plan of keys that go to an account (no admin console, so no workspace is needed). */
  const plan = async (): Promise<string> => {
    const application = await declareApplication(ctx, it1.accessToken, {
      name: unique('Software'),
      kind: 'LICENSED',
      vendorName: unique('Vendor'),
      dataSensitivity: 'LOW',
    });

    return dataOf<{ id: string }>(
      await request(server())
        .post('/api/v1/plans')
        .set(as(it1.accessToken))
        .send({ applicationId: application, name: unique('Plan'), provisioningType: 'K4', controlLevel: 'FULL' })
        .expect(201),
    ).id;
  };
  const lotBody = (planId: string, extra: object = {}) => ({
    planId,
    purchasedOn: '2026-11-01',
    licenseCount: 3,
    unitPrice: { amount: '6000000', currency: 'VND' },
    purpose: 'REPLACEMENT',
    ...extra,
  });
  const makeLot = async (token = it1.accessToken, extra: object = {}): Promise<LotWire> => {
    const created = dataOf<{ id: string }>(
      await request(server())
        .post('/api/v1/license-lots')
        .set(as(token))
        .send(lotBody(await plan(), extra))
        .expect(201),
    );

    return dataOf<LotWire>(
      await request(server()).get(`/api/v1/license-lots/${created.id}`).set(as(token)).expect(200),
    );
  };
  const importKeys = (lotId: string, keys: string[], token = it1.accessToken) =>
    request(server()).post(`/api/v1/license-lots/${lotId}/keys`).set(as(token)).send({ keys });
  const keysOf = (n: number, tag: string) =>
    Array.from({ length: n }, (_, index) => `${tag}-KEY-${String(index + 1).padStart(6, '0')}`);

  it('makes a lot, which the IT Admin who made it answers for, with every license free and no key in the store', async () => {
    const lot = await makeLot();

    expect(lot).toMatchObject({
      licenseCount: 3,
      assigned: 0,
      free: 3,
      keysInStore: 0,
      grantable: 0,
      purpose: 'REPLACEMENT',
      unitPrice: { currency: 'VND' },
    });
    expect(lot.responsibleItAdminEmployeeId).toBe(it1.employeeId);
    expect(Number(lot.unitPrice.amount)).toBe(6000000);
  });

  it('lists the lots of a plan newest first and reads one; IT, Finance and the Super Admin read, an employee does not', async () => {
    const lot = await makeLot();

    for (const token of [it2.accessToken, finance.accessToken, admin]) {
      const page = dataOf<{ items: LotWire[]; pagination: { totalItems: number } }>(
        await request(server()).get(`/api/v1/license-lots?planId=${lot.plan.id}`).set(as(token)).expect(200),
      );
      expect(page.items.map((item) => item.id)).toEqual([lot.id]);
      expect(page.pagination.totalItems).toBe(1);
    }
    expect(codeOf(await request(server()).get('/api/v1/license-lots').set(as(employee.accessToken)).expect(403))).toBe(
      'AUTHORIZATION.FORBIDDEN',
    );
    expect(
      codeOf(
        await request(server())
          .get('/api/v1/license-lots/3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11')
          .set(as(it1.accessToken))
          .expect(404),
      ),
    ).toBe('LICENSE_LOT.NOT_FOUND');
  });

  it('refuses a lot the plan cannot take, naming the rule, and makes nothing', async () => {
    const planId = await plan();
    const refuse = async (extra: object, status: number) =>
      codeOf(
        await request(server())
          .post('/api/v1/license-lots')
          .set(as(it1.accessToken))
          .send(lotBody(planId, extra))
          .expect(status),
      );

    expect(await refuse({ purpose: 'STOCK' }, 422)).toBe('LICENSE_LOT.PURPOSE_NOT_AVAILABLE');
    expect(await refuse({ purpose: 'REQUEST' }, 422)).toBe('LICENSE_LOT.REQUEST_REQUIRED');
    expect(await refuse({ unitPrice: { amount: '100', currency: 'USD' } }, 422)).toBe('LICENSE_LOT.PRICE_NOT_VND');
    const page = dataOf<{ items: LotWire[] }>(
      await request(server()).get(`/api/v1/license-lots?planId=${planId}`).set(as(it1.accessToken)).expect(200),
    );
    expect(page.items).toEqual([]);
  });

  it('keeps the keys of a lot, never more than its licenses for a plan bound to an account, and only for the IT Admin who answers for it', async () => {
    const lot = await makeLot();

    const first = dataOf<{ imported: number }>(await importKeys(lot.id, keysOf(2, 'A')).expect(201));
    expect(first.imported).toBe(2);
    expect(codeOf(await importKeys(lot.id, keysOf(2, 'B')).expect(422))).toBe('LICENSE_LOT.KEYS_EXCEED_LICENSES');
    expect(codeOf(await importKeys(lot.id, keysOf(1, 'C'), it2.accessToken).expect(403))).toBe(
      'LICENSE_LOT.NOT_RESPONSIBLE',
    );

    const after = dataOf<LotWire>(
      await request(server()).get(`/api/v1/license-lots/${lot.id}`).set(as(admin)).expect(200),
    );
    expect(after).toMatchObject({ keysInStore: 2, grantable: 2, free: 3 });
    const keys = dataOf<{ items: { licenseLot: { id: string } }[] }>(
      await request(server()).get(`/api/v1/license-keys?licenseLotId=${lot.id}`).set(as(it1.accessToken)).expect(200),
    );
    expect(keys.items).toHaveLength(2);
    expect(keys.items.every((key) => key.licenseLot.id === lot.id)).toBe(true);
  });

  it('changes the note on the version the caller read, and turns away a stale version and anyone but the IT Admin who answers for it', async () => {
    const lot = await makeLot();
    const patch = (body: object, token = it1.accessToken) =>
      request(server()).patch(`/api/v1/license-lots/${lot.id}`).set(as(token)).send(body);

    const changed = dataOf<LotWire>(
      await patch({ expectedUpdatedAt: lot.updatedAt, note: 'Bought for the new team' }).expect(200),
    );
    expect(changed.note).toBe('Bought for the new team');
    expect(codeOf(await patch({ expectedUpdatedAt: lot.updatedAt, note: 'Again' }).expect(409))).toBe(
      'LICENSE_LOT.STALE',
    );
    expect(
      codeOf(await patch({ expectedUpdatedAt: changed.updatedAt, note: 'Not mine' }, it2.accessToken).expect(403)),
    ).toBe('LICENSE_LOT.NOT_RESPONSIBLE');
    expect(
      dataOf<LotWire>(
        await patch({ expectedUpdatedAt: changed.updatedAt, unitPrice: { amount: '7000000', currency: 'VND' } }).expect(
          200,
        ),
      ).unitPrice.amount,
    ).toMatch(/^7000000/);
  });

  it('is handed to another IT Admin only by the Super Admin, who is asked for a reason; the new one then answers for it', async () => {
    const lot = await makeLot();
    const hand = (token: string, body: object) =>
      request(server()).post(`/api/v1/license-lots/${lot.id}/responsible-it-admin`).set(as(token)).send(body);

    expect(codeOf(await hand(it1.accessToken, { employeeId: it2.employeeId, reason: 'Leaving' }).expect(403))).toBe(
      'AUTHORIZATION.FORBIDDEN',
    );
    expect(codeOf(await hand(admin, { employeeId: employee.employeeId, reason: 'Wrong person' }).expect(422))).toBe(
      'LICENSE_LOT.RESPONSIBLE_NOT_IT_ADMIN',
    );
    const done = dataOf<{ lot: LotWire; changed: boolean }>(
      await hand(admin, { employeeId: it2.employeeId, reason: 'Handover' }).expect(200),
    );
    expect(done.changed).toBe(true);
    expect(done.lot.responsibleItAdminEmployeeId).toBe(it2.employeeId);
    expect(
      dataOf<{ imported: number }>(await importKeys(lot.id, keysOf(1, 'D'), it2.accessToken).expect(201)).imported,
    ).toBe(1);
    expect(codeOf(await importKeys(lot.id, keysOf(1, 'E'), it1.accessToken).expect(403))).toBe(
      'LICENSE_LOT.NOT_RESPONSIBLE',
    );
    const again = dataOf<{ changed: boolean }>(
      await hand(admin, { employeeId: it2.employeeId, reason: 'Same person' }).expect(200),
    );
    expect(again.changed).toBe(false);
  });

  it('refuses a new lot without legacySubscriptionId on the old import route (404), and restricts legacy lots to the responsible IT Admin (403)', async () => {
    const lot = await makeLot();
    const legacyId = await declareSubscription(ctx, it1.accessToken, {
      planId: await plan(),
      kind: 'PERPETUAL',
      purchasedQuantity: 3,
      unitPrice: { amount: '5000000', currency: 'VND' },
      startDate: '2026-01-05',
    });

    expect(
      codeOf(
        await request(server())
          .post('/api/v1/license-keys/imports')
          .set(as(it1.accessToken))
          .send({ subscriptionId: lot.id, keys: keysOf(1, 'F') })
          .expect(404),
      ),
    ).toBe('LICENSE_LOT.NOT_FOUND');

    expect(
      codeOf(
        await request(server())
          .post('/api/v1/license-keys/imports')
          .set(as(it2.accessToken))
          .send({ subscriptionId: legacyId, keys: keysOf(1, 'G') })
          .expect(403),
      ),
    ).toBe('LICENSE_LOT.NOT_RESPONSIBLE');

    const imported = dataOf<{ imported: number }>(
      await request(server())
        .post('/api/v1/license-keys/imports')
        .set(as(it1.accessToken))
        .send({ subscriptionId: legacyId, keys: keysOf(1, 'H') })
        .expect(201),
    );
    expect(imported.imported).toBe(1);

    expect(
      codeOf(
        await request(server())
          .post('/api/v1/license-keys/imports')
          .set(as(it1.accessToken))
          .send({ subscriptionId: '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11', keys: keysOf(1, 'I') })
          .expect(404),
      ),
    ).toBe('LICENSE_LOT.NOT_FOUND');
  });
});
