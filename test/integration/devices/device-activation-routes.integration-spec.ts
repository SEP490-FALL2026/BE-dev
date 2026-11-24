import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { ApiAccount, createActivatedAccount } from '../../support/api-accounts';
import { declareApplication } from '../../support/builders/catalog.builder';
import { DevicesHarness, type DeviceWire } from '../../support/devices-harness';

interface OpenedActivationWire {
  activation: {
    id: string;
    deviceId: string;
    planId: string;
    licenseKeyId: string | null;
    subscriptionId: string | null;
    origin: string;
    overActivationCap: boolean;
  };
  activationsUsed: number | null;
  maxActivations: number | null;
  overActivationCap: boolean;
}

describe('device activation routes & bundled intake (integration, real PostgreSQL)', () => {
  const h = new DevicesHarness();
  let itOther: ApiAccount;
  let seq = 0;

  const unique = (prefix: string): string => `${prefix} ${(seq += 1)}`;
  const server = () => h.ctx.app.getHttpServer();
  const as = (account: ApiAccount) => ({ Authorization: `Bearer ${account.accessToken}` });
  const deactivateActivation = (
    id: string,
    body: { licenseRelease?: 'RETURN_TO_LOT' | 'LOST_WITH_DEVICE' } = {},
    account: ApiAccount = h.it1,
  ) => request(server()).post(`/api/v1/device-activations/${id}/deactivation`).set(as(account)).send(body);
  const moveActivation = (id: string, targetDeviceId: string, account: ApiAccount = h.it1) =>
    request(server()).post(`/api/v1/device-activations/${id}/moves`).set(as(account)).send({ targetDeviceId });

  const planOf = async (binding: 'DEVICE_KEY' | 'DEVICE_BUNDLED'): Promise<string> => {
    const application = await declareApplication(h.ctx, h.it1.accessToken, {
      name: unique('ActRouteApp'),
      kind: 'LICENSED',
      vendorName: unique('Vendor'),
      dataSensitivity: 'LOW',
    });

    return h.dataOf<{ id: string }>(
      await request(server())
        .post('/api/v1/plans')
        .set(as(h.it1))
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
    h.dataOf<{ id: string }>(
      await request(server())
        .post('/api/v1/subscriptions')
        .set(as(h.it1))
        .send({
          planId,
          kind: 'PERPETUAL',
          purchasedQuantity,
          unitPrice: { amount: '1500000', currency: 'VND' },
          startDate: '2026-03-15',
          responsibleItAdminEmployeeId: h.it1.employeeId,
        })
        .expect(201),
    ).id;

  const importKey = async (subscriptionId: string, maxActivations: number): Promise<string> =>
    h.dataOf<{ keys: Array<{ id: string }> }>(
      await request(server())
        .post('/api/v1/license-keys/imports')
        .set(as(h.it1))
        .send({
          subscriptionId,
          keys: [`KEY-${randomUUID().replace(/-/g, '').slice(0, 20).toUpperCase()}`],
          maxActivations,
        })
        .expect(201),
    ).keys[0].id;

  beforeAll(async () => {
    await h.start();
    itOther = await createActivatedAccount(h.ctx, h.seed, {
      code: 'E-ACTOTH',
      email: 'act-other@acme.vn',
      role: 'IT_ADMIN',
      admin: h.admin,
    });
  });

  afterAll(async () => {
    await h.stop();
  });

  it('activates DEVICE_KEY over HTTP with H17 enforcement, over-cap allowance, lot-full 409, quantity guard 422, and subscription occupancy', async () => {
    const planId = await planOf('DEVICE_KEY');
    const subscriptionId = await purchaseOf(planId, 2);
    const keyId = await importKey(subscriptionId, 1);

    const held = await h.registered(h.employee.employeeId);
    const inStock1 = h.dataOf<DeviceWire>(
      await h.createDevice({ deviceType: 'PC', hostname: 'PC-ACT-1', os: 'Windows 11' }).expect(201),
    );
    const inStock2 = h.dataOf<DeviceWire>(
      await h.createDevice({ deviceType: 'LAP', hostname: 'LAP-ACT-2', os: 'Windows 11' }).expect(201),
    );

    const forbidden = await h.activateDevice(held.id, { planId, licenseKeyId: keyId }, itOther).expect(403);
    expect(h.codeOf(forbidden)).toBe('DEVICE.NOT_IN_CHARGE');

    const first = h.dataOf<OpenedActivationWire>(
      await h.activateDevice(held.id, { planId, licenseKeyId: keyId }, h.it1).expect(201),
    );
    expect(first).toMatchObject({ activationsUsed: 1, maxActivations: 1, overActivationCap: false });

    const second = h.dataOf<OpenedActivationWire>(
      await h.activateDevice(inStock1.id, { planId, licenseKeyId: keyId }, itOther).expect(201),
    );
    expect(second).toMatchObject({ activationsUsed: 2, maxActivations: 1, overActivationCap: true });

    const third = await h.activateDevice(inStock2.id, { planId, licenseKeyId: keyId }, h.it1).expect(409);
    expect(h.codeOf(third)).toBe('DEVICE_ACTIVATION.LOT_FULL');

    const sub = h.dataOf<{ updatedAt: string; seats: { occupied: number } }>(
      await request(server()).get(`/api/v1/subscriptions/${subscriptionId}`).set(as(h.it1)).expect(200),
    );
    expect(sub.seats.occupied).toBe(2);

    const reduce = await request(server())
      .patch(`/api/v1/subscriptions/${subscriptionId}`)
      .set(as(h.it1))
      .send({ expectedUpdatedAt: sub.updatedAt, purchasedQuantity: 1 })
      .expect(422);
    expect(h.codeOf(reduce)).toBe('SUBSCRIPTION.QUANTITY_BELOW_OCCUPIED');
  });

  it('rejects NOT_USABLE (both DEVICE_KEY and DEVICE_BUNDLED) and AWAITING_RETURN (DEVICE_KEY)', async () => {
    const keyPlanId = await planOf('DEVICE_KEY');
    const subId = await purchaseOf(keyPlanId, 2);
    const keyId = await importKey(subId, 5);
    const bundledPlanId = await planOf('DEVICE_BUNDLED');

    const broken = h.dataOf<DeviceWire>(
      await h.createDevice({ deviceType: 'LAP', hostname: 'LAP-BRK', os: 'Windows 11' }).expect(201),
    );
    await h.changeCondition(broken.id, { condition: 'BROKEN', note: 'Screen cracked' }).expect(201);

    const resKeyBroken = await h.activateDevice(broken.id, { planId: keyPlanId, licenseKeyId: keyId }).expect(409);
    expect(h.codeOf(resKeyBroken)).toBe('DEVICE.NOT_USABLE');

    const resBundledBroken = await h.activateDevice(broken.id, { planId: bundledPlanId }).expect(409);
    expect(h.codeOf(resBundledBroken)).toBe('DEVICE.NOT_USABLE');

    const heldForReturn = await h.registered(h.employee.employeeId);
    await h.ctx.sql.query(
      `INSERT INTO device_return_tasks (id, organization_id, device_id, departure_case_id, holder_employee_id, department_id, due_on)
       VALUES (gen_random_uuid(), $1, $2, gen_random_uuid(), $3, $4, '2026-12-01')`,
      [h.seed.organizationId, heldForReturn.id, h.employee.employeeId, h.seed.departmentId],
    );
    const resAwaiting = await h
      .activateDevice(heldForReturn.id, { planId: keyPlanId, licenseKeyId: keyId })
      .expect(409);
    expect(h.codeOf(resAwaiting)).toBe('DEVICE.AWAITING_RETURN');
  });

  it('opens DEVICE_BUNDLED activations on device creation when bundledPlanIds are provided', async () => {
    const bundledPlanId = await planOf('DEVICE_BUNDLED');
    const nonBundledPlanId = await planOf('DEVICE_KEY');

    const created = h.dataOf<DeviceWire>(
      await h
        .createDevice({
          deviceType: 'LAP',
          hostname: 'LAP-OEM-1',
          os: 'Windows 11',
          bundledPlanIds: [bundledPlanId],
        })
        .expect(201),
    );
    const rows = await h.ctx.sql.query<{ plan_id: string; license_key_id: string | null; origin: string }>(
      `SELECT plan_id, license_key_id, origin FROM device_activations WHERE device_id = $1 AND deactivated_at IS NULL`,
      [created.id],
    );
    expect(rows.rows).toEqual([{ plan_id: bundledPlanId, license_key_id: null, origin: 'OPERATION' }]);

    const bad = await h
      .createDevice({
        deviceType: 'LAP',
        hostname: 'LAP-OEM-BAD',
        os: 'Windows 11',
        bundledPlanIds: [nonBundledPlanId],
      })
      .expect(422);
    expect(h.codeOf(bad)).toBe('DEVICE_ACTIVATION.PLAN_NOT_BUNDLED');
  });

  it('allows only one HTTP activation under concurrent last-license contention without deadlocks', async () => {
    const planId = await planOf('DEVICE_KEY');
    const subId = await purchaseOf(planId, 1);
    const keyId = await importKey(subId, 5);
    const d1 = h.dataOf<DeviceWire>(
      await h.createDevice({ deviceType: 'LAP', hostname: 'LAP-C1', os: 'Windows 11' }).expect(201),
    );
    const d2 = h.dataOf<DeviceWire>(
      await h.createDevice({ deviceType: 'LAP', hostname: 'LAP-C2', os: 'Windows 11' }).expect(201),
    );

    const results = await Promise.all([
      h.activateDevice(d1.id, { planId, licenseKeyId: keyId }),
      h.activateDevice(d2.id, { planId, licenseKeyId: keyId }),
    ]);

    expect(results.map((res) => res.status).sort()).toEqual([201, 409]);
  });

  it('W2-20 (a)-(e): moves keyed activations on a full lot, rejects bundled moves & closed deactivations, and keeps LOST_WITH_DEVICE occupied', async () => {
    const keyPlanId = await planOf('DEVICE_KEY');
    const subId = await purchaseOf(keyPlanId, 2);
    const keyId = await importKey(subId, 5);
    const bundledPlanId = await planOf('DEVICE_BUNDLED');

    const d1 = h.dataOf<DeviceWire>(
      await h.createDevice({ deviceType: 'LAP', hostname: 'LAP-MV-1', os: 'Windows 11' }).expect(201),
    );
    const d2 = h.dataOf<DeviceWire>(
      await h.createDevice({ deviceType: 'LAP', hostname: 'LAP-MV-2', os: 'Windows 11' }).expect(201),
    );
    const d3 = h.dataOf<DeviceWire>(
      await h.createDevice({ deviceType: 'LAP', hostname: 'LAP-MV-3', os: 'Windows 11' }).expect(201),
    );

    const a1 = h.dataOf<OpenedActivationWire>(
      await h.activateDevice(d1.id, { planId: keyPlanId, licenseKeyId: keyId }).expect(201),
    );
    const a2 = h.dataOf<OpenedActivationWire>(
      await h.activateDevice(d2.id, { planId: keyPlanId, licenseKeyId: keyId }).expect(201),
    );

    // (e) Move on a full 2/2 lot succeeds (closes old MOVED first, inserts new on d3).
    const moved = h.dataOf<OpenedActivationWire>(await moveActivation(a1.activation.id, d3.id).expect(201));
    expect(moved.activation.deviceId).toBe(d3.id);
    expect(moved.activationsUsed).toBe(2);

    // (b) Deactivate with LOST_WITH_DEVICE keeps lot occupied.
    await deactivateActivation(moved.activation.id, { licenseRelease: 'LOST_WITH_DEVICE' }).expect(201);
    const sub = h.dataOf<{ seats: { occupied: number } }>(
      await request(server()).get(`/api/v1/subscriptions/${subId}`).set(as(h.it1)).expect(200),
    );
    expect(sub.seats.occupied).toBe(2);

    // (d) Deactivating an already closed activation fails with 409.
    const alreadyClosed = await deactivateActivation(a1.activation.id).expect(409);
    expect(h.codeOf(alreadyClosed)).toBe('DEVICE_ACTIVATION.ALREADY_CLOSED');

    // (c) Moving a DEVICE_BUNDLED activation fails with 422 NOT_MOVABLE.
    const bundled = h.dataOf<OpenedActivationWire>(
      await h.activateDevice(d1.id, { planId: bundledPlanId }).expect(201),
    );
    const notMovable = await moveActivation(bundled.activation.id, d2.id).expect(422);
    expect(h.codeOf(notMovable)).toBe('DEVICE_ACTIVATION.NOT_MOVABLE');

    // Clean deactivate with RETURN_TO_LOT restores lot free slot.
    await deactivateActivation(a2.activation.id).expect(201);
  });

  it('W2-20 (f): opposite-direction moves between two machines repeat 20 times without deadlocks', async () => {
    const planId = await planOf('DEVICE_KEY');
    const subId = await purchaseOf(planId, 2);
    const key1 = await importKey(subId, 50);
    const plan2Id = await planOf('DEVICE_KEY');
    const sub2Id = await purchaseOf(plan2Id, 2);
    const key2 = await importKey(sub2Id, 50);

    let dLeft = h.dataOf<DeviceWire>(
      await h.createDevice({ deviceType: 'LAP', hostname: 'LAP-DEAD-1', os: 'Windows 11' }).expect(201),
    ).id;
    let dRight = h.dataOf<DeviceWire>(
      await h.createDevice({ deviceType: 'LAP', hostname: 'LAP-DEAD-2', os: 'Windows 11' }).expect(201),
    ).id;

    let actLeft = h.dataOf<OpenedActivationWire>(
      await h.activateDevice(dLeft, { planId, licenseKeyId: key1 }).expect(201),
    ).activation.id;
    let actRight = h.dataOf<OpenedActivationWire>(
      await h.activateDevice(dRight, { planId: plan2Id, licenseKeyId: key2 }).expect(201),
    ).activation.id;

    for (let i = 0; i < 20; i += 1) {
      const [m1, m2] = await Promise.all([moveActivation(actLeft, dRight), moveActivation(actRight, dLeft)]);
      expect(m1.status).toBe(201);
      expect(m2.status).toBe(201);
      actLeft = h.dataOf<OpenedActivationWire>(m1).activation.id;
      actRight = h.dataOf<OpenedActivationWire>(m2).activation.id;
      const tmp = dLeft;
      dLeft = dRight;
      dRight = tmp;
    }
  });
});
