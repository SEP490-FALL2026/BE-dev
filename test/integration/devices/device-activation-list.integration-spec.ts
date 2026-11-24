import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { ApiAccount } from '../../support/api-accounts';
import { declareApplication } from '../../support/builders/catalog.builder';
import { DevicesHarness, type DeviceWire } from '../../support/devices-harness';
import { PgRelay } from '../../support/pg-relay';
import { QueryCounter, dataStatements } from '../../support/query-count';

interface ActivationListItemWire {
  id: string;
  device: { id: string; assetCode: string; custody: string; condition: string };
  plan: { id: string; name: string; keyBinding: string };
  application: { id: string; name: string };
  licenseKey: { id: string; masked: string; withdrawn: boolean } | null;
  lotId: string | null;
  needsKeyReplacement: boolean;
}

describe('device activation list, withdrawn key replacement & idleDevice filter (integration, real PostgreSQL)', () => {
  const h = new DevicesHarness();
  let relay: PgRelay;
  let counter: QueryCounter;
  let seq = 0;

  const unique = (prefix: string): string => `${prefix} ${(seq += 1)}`;
  const server = () => h.ctx.app.getHttpServer();
  const as = (account: ApiAccount) => ({ Authorization: `Bearer ${account.accessToken}` });
  const listActivations = (query = '', account: ApiAccount = h.it1) =>
    request(server()).get(`/api/v1/device-activations${query}`).set(as(account));

  const planOf = async (binding: 'DEVICE_KEY' | 'DEVICE_BUNDLED'): Promise<string> => {
    const application = await declareApplication(h.ctx, h.it1.accessToken, {
      name: unique('ListActApp'),
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
          unitPrice: { amount: '1200000', currency: 'VND' },
          startDate: '2026-03-15',
          responsibleItAdminEmployeeId: h.it1.employeeId,
        })
        .expect(201),
    ).id;

  const importKey = async (subscriptionId: string, maxActivations = 10): Promise<string> =>
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
    await h.start({
      appDatabaseUrl: async (directUrl) => {
        const url = new URL(directUrl);
        relay = await PgRelay.start(url.hostname, Number(url.port || 5432));
        url.port = String(relay.port);

        return url.toString();
      },
    });
    counter = QueryCounter.on(relay);
  }, 300_000);

  afterAll(async () => {
    await h.stop();
    await relay?.stop();
  });

  it('W2-22 (a): marks open activations on withdrawn keys as needsKeyReplacement and refuses new opens with 409', async () => {
    const planId = await planOf('DEVICE_KEY');
    const subId = await purchaseOf(planId, 5);
    const keyId = await importKey(subId);
    const d1 = await h.registered(h.employee.employeeId);
    const d2 = h.dataOf<DeviceWire>(
      await h.createDevice({ deviceType: 'LAP', hostname: 'LAP-WD-2', os: 'Windows 11' }).expect(201),
    );

    const opened = h.dataOf<{ activation: { id: string } }>(
      await h.activateDevice(d1.id, { planId, licenseKeyId: keyId }).expect(201),
    );

    await request(server())
      .post(`/api/v1/license-keys/${keyId}/withdrawal`)
      .set(as(h.it1))
      .send({ reason: 'Compromised key' })
      .expect(200);

    const list = h.dataOf<{ items: ActivationListItemWire[] }>(
      await listActivations('?needsKeyReplacement=true').expect(200),
    );
    expect(list.items.map((item) => item.id)).toContain(opened.activation.id);
    const matched = list.items.find((item) => item.id === opened.activation.id)!;
    expect(matched.needsKeyReplacement).toBe(true);
    expect(matched.licenseKey?.withdrawn).toBe(true);

    const refused = await h.activateDevice(d2.id, { planId, licenseKeyId: keyId }).expect(409);
    expect(h.codeOf(refused)).toBe('DEVICE_ACTIVATION.KEY_WITHDRAWN');
  });

  it('W2-22 (b): idleDevice=true includes IN_STOCK and BROKEN machines, excludes AWAITING_RETURN', async () => {
    const planId = await planOf('DEVICE_KEY');
    const subId = await purchaseOf(planId, 5);
    const keyId = await importKey(subId);

    const inStock = h.dataOf<DeviceWire>(
      await h.createDevice({ deviceType: 'LAP', hostname: 'LAP-IDLE-1', os: 'Windows 11' }).expect(201),
    );
    const broken = await h.registered(h.employee.employeeId);
    await h.changeCondition(broken.id, { condition: 'BROKEN', note: 'Mainboard fault' }).expect(201);
    const awaiting = await h.registered(h.employee.employeeId);

    const actStock = h.dataOf<{ activation: { id: string } }>(
      await h.activateDevice(inStock.id, { planId, licenseKeyId: keyId }).expect(201),
    ).activation.id;
    const actBroken = h.dataOf<{ activation: { id: string } }>(
      await h.activateDevice(broken.id, { planId, licenseKeyId: keyId }).expect(201),
    ).activation.id;
    const actAwait = h.dataOf<{ activation: { id: string } }>(
      await h.activateDevice(awaiting.id, { planId, licenseKeyId: keyId }).expect(201),
    ).activation.id;

    await h.ctx.sql.query(
      `INSERT INTO device_return_tasks (id, organization_id, device_id, departure_case_id, holder_employee_id, department_id, due_on)
       VALUES (gen_random_uuid(), $1, $2, gen_random_uuid(), $3, $4, '2026-12-01')`,
      [h.seed.organizationId, awaiting.id, h.employee.employeeId, h.seed.departmentId],
    );

    const idle = h.dataOf<{ items: ActivationListItemWire[] }>(await listActivations('?idleDevice=true').expect(200));
    const idleIds = idle.items.map((item) => item.id);
    expect(idleIds).toContain(actStock);
    expect(idleIds).toContain(actBroken);
    expect(idleIds).not.toContain(actAwait);
  });

  it('W2-22 (c): executes constant data statements across different page sizes', async () => {
    const bundledPlanId = await planOf('DEVICE_BUNDLED');
    for (let i = 0; i < 6; i += 1) {
      await h
        .createDevice({
          deviceType: 'PC',
          hostname: `PC-QCNT-${i}`,
          os: 'Windows 11',
          bundledPlanIds: [bundledPlanId],
        })
        .expect(201);
    }

    const small = await counter.run(() => listActivations(`?planId=${bundledPlanId}&pageSize=2`).expect(200));
    const large = await counter.run(() => listActivations(`?planId=${bundledPlanId}&pageSize=6`).expect(200));

    expect(dataStatements(small.statements)).toHaveLength(dataStatements(large.statements).length);
  });
});
