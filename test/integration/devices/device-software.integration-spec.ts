import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { ApiAccount } from '../../support/api-accounts';
import { declareApplication } from '../../support/builders/catalog.builder';
import { DevicesHarness, type DeviceWire } from '../../support/devices-harness';
import { PgRelay } from '../../support/pg-relay';
import { QueryCounter, dataStatements } from '../../support/query-count';

interface ActivationListItemWire {
  id: string;
  plan: { id: string; name: string; keyBinding: string };
  application: { id: string; name: string };
}

interface HolderSoftwarePageWire {
  holder: { id: string; employeeCode: string; fullName: string } | null;
  items: Array<{
    assignmentId: string;
    applicationName: string;
    planName: string;
    grantedOn: string;
    endsOn: string | null;
  }>;
  pagination: { page: number; pageSize: number; totalItems: number; totalPages: number };
}

interface MeDeviceSoftwarePageWire {
  items: Array<{
    activationId: string;
    device: { id: string; assetCode: string; hostname: string };
    plan: { id: string; name: string; keyBinding: 'DEVICE_KEY' | 'DEVICE_BUNDLED' };
    application: { id: string; name: string };
    activatedOn: string;
  }>;
  pagination: { page: number; pageSize: number; totalItems: number; totalPages: number };
}

describe('device holder software & my device software views (integration, real PostgreSQL)', () => {
  const h = new DevicesHarness();
  let relay: PgRelay;
  let counter: QueryCounter;
  let seq = 0;

  const unique = (prefix: string): string => `${prefix} ${(seq += 1)}`;
  const server = () => h.ctx.app.getHttpServer();
  const as = (account: ApiAccount) => ({ Authorization: `Bearer ${account.accessToken}` });

  const listActivations = (query = '', account: ApiAccount = h.it1) =>
    request(server()).get(`/api/v1/device-activations${query}`).set(as(account));
  const holderSoftware = (deviceId: string, query = '', account: ApiAccount = h.it1) =>
    request(server()).get(`/api/v1/devices/${deviceId}/holder-software${query}`).set(as(account));
  const meDeviceSoftware = (account: ApiAccount, query = '') =>
    request(server()).get(`/api/v1/me/device-software${query}`).set(as(account));
  const deactivate = (activationId: string, account: ApiAccount = h.it1) =>
    request(server()).post(`/api/v1/device-activations/${activationId}/deactivation`).set(as(account)).send({});

  const createPlan = async (input: {
    appName: string;
    planName: string;
    kind: 'SAAS' | 'LICENSED';
    provisioningType: 'K2' | 'K4';
    keyBinding?: 'ACCOUNT' | 'DEVICE_KEY' | 'DEVICE_BUNDLED';
  }): Promise<{ applicationId: string; planId: string }> => {
    const applicationId = await declareApplication(h.ctx, h.it1.accessToken, {
      name: input.appName,
      kind: input.kind,
      vendorName: unique('Vendor'),
      dataSensitivity: 'LOW',
    });

    const planId = h.dataOf<{ id: string }>(
      await request(server())
        .post('/api/v1/plans')
        .set(as(h.it1))
        .send({
          applicationId,
          name: input.planName,
          provisioningType: input.provisioningType,
          controlLevel: 'FULL',
          ...(input.keyBinding ? { keyBinding: input.keyBinding } : {}),
        })
        .expect(201),
    ).id;

    return { applicationId, planId };
  };

  const purchasePerpetual = async (planId: string, purchasedQuantity = 5): Promise<string> =>
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

  const importKey = async (subscriptionId: string, maxActivations = 5): Promise<string> => {
    await request(server())
      .post('/api/v1/license-keys/imports')
      .set(as(h.it1))
      .send({
        subscriptionId,
        keys: [`KEY-${randomUUID().replace(/-/g, '').slice(0, 20).toUpperCase()}`],
        maxActivations,
      })
      .expect(201);

    return (
      await h.ctx.sql.query<{ id: string }>(
        `SELECT id FROM license_keys WHERE subscription_id = $1 ORDER BY imported_at DESC, id DESC LIMIT 1`,
        [subscriptionId],
      )
    ).rows[0].id;
  };

  const grantPersonalSeat = async (employeeId: string, planId: string, accountEmail: string): Promise<string> => {
    const assignmentId = randomUUID();
    await h.ctx.sql.query(
      `INSERT INTO license_assignments (
         id, organization_id, kind, source, plan_id, employee_id, account_identifier,
         normalized_account_identifier, valid_from, valid_from_basis, created_by_app_user_id
       )
       VALUES ($1, $2, 'PERSONAL', 'REQUEST', $3, $4, $5, $6, '2026-01-10', 'ACTUAL', $7)`,
      [
        assignmentId,
        h.seed.organizationId,
        planId,
        employeeId,
        accountEmail,
        accountEmail.toLowerCase(),
        h.it1.appUserId,
      ],
    );

    return assignmentId;
  };

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

  it('splits machine-bound activations and holder personal software across the two endpoints, and handles stock/missing devices', async () => {
    const windows = await createPlan({
      appName: unique('Windows'),
      planName: 'Windows 11 OEM',
      kind: 'LICENSED',
      provisioningType: 'K4',
      keyBinding: 'DEVICE_BUNDLED',
    });
    const autocad = await createPlan({
      appName: unique('AutoCAD'),
      planName: 'AutoCAD Pro',
      kind: 'LICENSED',
      provisioningType: 'K4',
      keyBinding: 'DEVICE_KEY',
    });
    const figma = await createPlan({
      appName: unique('Figma'),
      planName: 'Figma Professional',
      kind: 'SAAS',
      provisioningType: 'K2',
    });
    const office = await createPlan({
      appName: unique('Office'),
      planName: 'Office Account',
      kind: 'LICENSED',
      provisioningType: 'K4',
      keyBinding: 'ACCOUNT',
    });

    const autocadSubId = await purchasePerpetual(autocad.planId);
    const autocadKeyId = await importKey(autocadSubId);

    const anDevice = await h.registered(h.employee.employeeId, {
      hostname: 'LAP-AN-04',
      bundledPlanIds: [windows.planId],
    });
    await h.activateDevice(anDevice.id, { planId: autocad.planId, licenseKeyId: autocadKeyId }).expect(201);

    const figmaSeatId = await grantPersonalSeat(h.employee.employeeId, figma.planId, 'an-figma@acme.vn');
    const officeSeatId = await grantPersonalSeat(h.employee.employeeId, office.planId, 'an-office@acme.vn');

    const deviceBound = h.dataOf<{ items: ActivationListItemWire[] }>(
      await listActivations(`?deviceId=${anDevice.id}`).expect(200),
    );
    expect(deviceBound.items.map((item) => item.plan.id).sort()).toEqual([autocad.planId, windows.planId].sort());

    const holderView = h.dataOf<HolderSoftwarePageWire>(await holderSoftware(anDevice.id).expect(200));
    expect(holderView.holder?.id).toBe(h.employee.employeeId);
    expect(holderView.holder?.employeeCode.length).toBeGreaterThan(0);
    expect(holderView.holder?.fullName.length).toBeGreaterThan(0);
    expect(holderView.items.map((item) => item.assignmentId)).toEqual(
      expect.arrayContaining([figmaSeatId, officeSeatId]),
    );
    expect(holderView.items.map((item) => item.planName)).not.toContain('Windows 11 OEM');
    expect(holderView.items.map((item) => item.planName)).not.toContain('AutoCAD Pro');
    expect(holderView.pagination.totalItems).toBeGreaterThanOrEqual(2);

    const inStock = h.dataOf<DeviceWire>(
      await h.createDevice({ deviceType: 'LAP', hostname: 'LAP-STOCK-01', os: 'Windows 11' }).expect(201),
    );
    const stockView = h.dataOf<HolderSoftwarePageWire>(await holderSoftware(inStock.id).expect(200));
    expect(stockView).toEqual({
      holder: null,
      items: [],
      pagination: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 },
    });

    const missing = await holderSoftware(randomUUID()).expect(404);
    expect(h.codeOf(missing)).toBe('DEVICE.NOT_FOUND');
  });

  it('scopes /me/device-software to open activations on the caller held machines only and uses constant queries', async () => {
    const deptCode = (
      await h.ctx.sql.query<{ code: string }>(`SELECT code FROM departments WHERE id = $1`, [h.seed.departmentId])
    ).rows[0].code;
    const binhId = await h.member(deptCode, 'EMP-BINH-23', 'Engineer');
    const binh = await h.account('EMP-BINH-23', binhId, 'EMPLOYEE');

    const anPlan = await createPlan({
      appName: unique('AnApp'),
      planName: 'An Bundled Plan',
      kind: 'LICENSED',
      provisioningType: 'K4',
      keyBinding: 'DEVICE_BUNDLED',
    });
    await h.registered(h.employee.employeeId, {
      hostname: 'LAP-AN-ONLY',
      bundledPlanIds: [anPlan.planId],
    });

    const binhEmpty = h.dataOf<MeDeviceSoftwarePageWire>(await meDeviceSoftware(binh).expect(200));
    expect(binhEmpty).toEqual({
      items: [],
      pagination: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 },
    });

    const binhOpenAppName = unique('BinhOpenApp');
    const openPlan = await createPlan({
      appName: binhOpenAppName,
      planName: 'Binh Open Plan',
      kind: 'LICENSED',
      provisioningType: 'K4',
      keyBinding: 'DEVICE_KEY',
    });
    const closedPlan = await createPlan({
      appName: unique('BinhClosedApp'),
      planName: 'Binh Closed Plan',
      kind: 'LICENSED',
      provisioningType: 'K4',
      keyBinding: 'DEVICE_BUNDLED',
    });
    const openSubId = await purchasePerpetual(openPlan.planId);
    const openKeyId = await importKey(openSubId);

    const binhDevice = await h.registered(binh.employeeId, {
      hostname: 'LAP-BINH-01',
      bundledPlanIds: [closedPlan.planId],
    });
    const opened = h.dataOf<{ activation: { id: string; activatedOn: string } }>(
      await h.activateDevice(binhDevice.id, { planId: openPlan.planId, licenseKeyId: openKeyId }).expect(201),
    );
    const binhAll = h.dataOf<{ items: ActivationListItemWire[] }>(
      await listActivations(`?deviceId=${binhDevice.id}`).expect(200),
    );
    const closedActivation = binhAll.items.find((item) => item.plan.id === closedPlan.planId)!;
    await deactivate(closedActivation.id).expect(201);

    const binhView = h.dataOf<MeDeviceSoftwarePageWire>(await meDeviceSoftware(binh).expect(200));
    expect(binhView.pagination).toEqual({ page: 1, pageSize: 20, totalItems: 1, totalPages: 1 });
    expect(binhView.items).toEqual([
      {
        activationId: opened.activation.id,
        device: {
          id: binhDevice.id,
          assetCode: binhDevice.assetCode,
          hostname: 'LAP-BINH-01',
        },
        plan: {
          id: openPlan.planId,
          name: 'Binh Open Plan',
          keyBinding: 'DEVICE_KEY',
        },
        application: {
          id: openPlan.applicationId,
          name: binhOpenAppName,
        },
        activatedOn: opened.activation.activatedOn,
      },
    ]);

    const extraPlans: string[] = [];
    for (let i = 0; i < 4; i += 1) {
      const extra = await createPlan({
        appName: unique(`QCountApp-${i}`),
        planName: `QCount Plan ${i}`,
        kind: 'LICENSED',
        provisioningType: 'K4',
        keyBinding: 'DEVICE_BUNDLED',
      });
      extraPlans.push(extra.planId);
    }
    await h.registered(binh.employeeId, { hostname: 'LAP-BINH-02', bundledPlanIds: extraPlans });

    const small = await counter.run(() => meDeviceSoftware(binh, '?pageSize=2').expect(200));
    const large = await counter.run(() => meDeviceSoftware(binh, '?pageSize=5').expect(200));

    expect(dataStatements(small.statements)).toHaveLength(dataStatements(large.statements).length);
  });
});
