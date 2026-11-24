import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { TransactionRunner } from '../../../src/infrastructure/database/transaction-runner';
import { LicensingDeviceActivationApi } from '../../../src/modules/licensing/public/licensing-device-activation.api';
import { DeviceActivationLotFullError } from '../../../src/modules/licensing/public/licensing-device-activation.errors';
import { ApiAccount, adminToken, createActivatedAccount } from '../../support/api-accounts';
import { declareApplication } from '../../support/builders/catalog.builder';
import { HttpTestApp, SeededInstallation, createHttpTestApp, seedInstallation } from '../../support/http-test-app';

describe('device activations licensing facade & S-6 lot occupancy (integration, real PostgreSQL)', () => {
  let ctx: HttpTestApp;
  let seed: SeededInstallation;
  let runner: TransactionRunner;
  let activations: LicensingDeviceActivationApi;
  let it1: ApiAccount;
  let seq = 0;

  const server = () => ctx.app.getHttpServer();
  const as = (account: ApiAccount) => ({ Authorization: `Bearer ${account.accessToken}` });
  const dataOf = <T>(res: request.Response): T => (res.body as { data: T }).data;
  const codeOf = (res: request.Response): string => (res.body as { error: { code: string } }).error.code;
  const unique = (prefix: string): string => `${prefix} ${(seq += 1)}`;

  const planOf = async (binding: 'DEVICE_KEY' | 'DEVICE_BUNDLED'): Promise<string> => {
    const application = await declareApplication(ctx, it1.accessToken, {
      name: unique('ActApp'),
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
          name: unique('Plan'),
          provisioningType: 'K4',
          controlLevel: 'FULL',
          keyBinding: binding,
        })
        .expect(201),
    ).id;
  };

  const purchaseOf = async (planId: string, purchasedQuantity: number): Promise<string> =>
    dataOf<{ id: string }>(
      await request(server())
        .post('/api/v1/subscriptions')
        .set(as(it1))
        .send({
          planId,
          kind: 'PERPETUAL',
          purchasedQuantity,
          unitPrice: { amount: '2000000', currency: 'VND' },
          startDate: '2026-03-15',
          responsibleItAdminEmployeeId: it1.employeeId,
        })
        .expect(201),
    ).id;

  const importKey = async (subscriptionId: string, maxActivations: number): Promise<string> => {
    const body = dataOf<{ keys: Array<{ id: string }> }>(
      await request(server())
        .post('/api/v1/license-keys/imports')
        .set(as(it1))
        .send({
          subscriptionId,
          keys: [`KEY-${randomUUID().replace(/-/g, '').slice(0, 20).toUpperCase()}`],
          maxActivations,
        })
        .expect(201),
    );
    return body.keys[0].id;
  };

  const createDevice = async (type: 'LAP' | 'PC'): Promise<string> =>
    dataOf<{ id: string }>(
      await request(server())
        .post('/api/v1/devices')
        .set(as(it1))
        .send({ deviceType: type, hostname: unique('HOST'), os: 'Windows 11' })
        .expect(201),
    ).id;

  const actor = () => ({
    kind: 'USER' as const,
    appUserId: it1.appUserId,
    employeeId: it1.employeeId,
    sessionId: randomUUID(),
  });

  beforeAll(async () => {
    ctx = await createHttpTestApp();
    runner = ctx.app.get(TransactionRunner);
    activations = ctx.app.get(LicensingDeviceActivationApi);
    seed = await seedInstallation(ctx.app);
    const admin = await adminToken(ctx, seed);
    it1 = await createActivatedAccount(ctx, seed, { code: 'E-ACTIT', email: 'actit@acme.vn', role: 'IT_ADMIN', admin });
  }, 180_000);

  afterAll(async () => {
    await ctx?.close();
  });

  it('W2-19 (a), (b), (e), (f) & S-6: tracks overActivationCap, enforces lot capacity, and blocks reduction below occupied', async () => {
    const planId = await planOf('DEVICE_KEY');
    const subId = await purchaseOf(planId, 2);
    const keyId = await importKey(subId, 1);
    const [d1, d2, d3] = await Promise.all([createDevice('LAP'), createDevice('PC'), createDevice('LAP')]);

    // First activation: 1/2 lot, 1/1 key -> overActivationCap = false.
    const first = await runner.run((tx) =>
      activations.open(tx, {
        organizationId: seed.organizationId,
        deviceId: d1,
        planId,
        licenseKeyId: keyId,
        origin: 'OPERATION',
        on: '2026-11-24',
        by: actor(),
      }),
    );
    expect(first).toMatchObject({ activationsUsed: 1, maxActivations: 1, overActivationCap: false });

    // Second activation with same key (cap 1): allowed because lot has 2 licenses, overActivationCap = true.
    const second = await runner.run((tx) =>
      activations.open(tx, {
        organizationId: seed.organizationId,
        deviceId: d2,
        planId,
        licenseKeyId: keyId,
        origin: 'OPERATION',
        on: '2026-11-24',
        by: actor(),
      }),
    );
    expect(second).toMatchObject({ activationsUsed: 2, maxActivations: 1, overActivationCap: true });

    // (b) Third activation exceeds lot capacity -> DeviceActivationLotFullError.
    await expect(
      runner.run((tx) =>
        activations.open(tx, {
          organizationId: seed.organizationId,
          deviceId: d3,
          planId,
          licenseKeyId: keyId,
          origin: 'OPERATION',
          on: '2026-11-24',
          by: actor(),
        }),
      ),
    ).rejects.toBeInstanceOf(DeviceActivationLotFullError);

    // (f) & S-6: GET /subscriptions/:id shows 2 occupied, PATCH below occupied fails with 422 QUANTITY_BELOW_OCCUPIED.
    const detail = dataOf<{ seats: { occupied: number } }>(
      await request(server()).get(`/api/v1/subscriptions/${subId}`).set(as(it1)).expect(200),
    );
    expect(detail.seats.occupied).toBe(2);

    const reduceRes = await request(server())
      .patch(`/api/v1/subscriptions/${subId}`)
      .set(as(it1))
      .send({ purchasedQuantity: 1 })
      .expect(422);
    expect(codeOf(reduceRes)).toBe('SUBSCRIPTION.QUANTITY_BELOW_OCCUPIED');
  });

  it('W2-19 (d): serializes concurrent opens racing for the last lot license without 40P01 deadlock', async () => {
    const planId = await planOf('DEVICE_KEY');
    const subId = await purchaseOf(planId, 1);
    const keyId = await importKey(subId, 5);
    const [d1, d2] = await Promise.all([createDevice('LAP'), createDevice('PC')]);

    const outcomes = await Promise.allSettled([
      runner.run((tx) =>
        activations.open(tx, {
          organizationId: seed.organizationId,
          deviceId: d1,
          planId,
          licenseKeyId: keyId,
          origin: 'OPERATION',
          on: '2026-11-24',
          by: actor(),
        }),
      ),
      runner.run((tx) =>
        activations.open(tx, {
          organizationId: seed.organizationId,
          deviceId: d2,
          planId,
          licenseKeyId: keyId,
          origin: 'OPERATION',
          on: '2026-11-24',
          by: actor(),
        }),
      ),
    ]);

    const fulfilled = outcomes.filter((item) => item.status === 'fulfilled');
    const rejected = outcomes.filter((item): item is PromiseRejectedResult => item.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(DeviceActivationLotFullError);
  });
});
