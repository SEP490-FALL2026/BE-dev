import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { ApiAccount } from '../../support/api-accounts';
import { declareApplication } from '../../support/builders/catalog.builder';
import { createDepartment, enterEmployee } from '../../support/builders/organization.builder';
import { DevicesHarness, type DeviceWire } from '../../support/devices-harness';

describe('device retirement and voiding (integration, real PostgreSQL)', () => {
  const h = new DevicesHarness();
  let dept2Id: string;
  let dept2Code: string;
  let seq = 0;

  const unique = (prefix: string): string => `${prefix} ${(seq += 1)}`;
  const server = () => h.ctx.app.getHttpServer();
  const as = (account: ApiAccount) => ({ Authorization: `Bearer ${account.accessToken}` });

  const planOf = async (binding: 'DEVICE_KEY' | 'DEVICE_BUNDLED'): Promise<string> => {
    const application = await declareApplication(h.ctx, h.it1.accessToken, {
      name: unique('RetVoidApp'),
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
          unitPrice: { amount: '1000000', currency: 'VND' },
          startDate: '2026-03-15',
          responsibleItAdminEmployeeId: h.it1.employeeId,
        })
        .expect(201),
    ).id;

  const importKey = async (subscriptionId: string, maxActivations: number): Promise<string> => {
    await request(server())
      .post('/api/v1/license-keys/imports')
      .set(as(h.it1))
      .send({
        subscriptionId,
        keys: [`RVD-${randomUUID().replace(/-/g, '').slice(0, 18).toUpperCase()}`],
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

  beforeAll(async () => {
    await h.start();
    const d2 = await createDepartment(h.ctx, h.admin, { code: 'RVD-D2', name: 'Retire Dept 2' });
    dept2Id = d2.id;
    dept2Code = d2.code;
  }, 300_000);

  afterAll(async () => {
    await h.stop();
  });

  it('retires DISPOSED and LOST machines, applies activationDecisions, and enforces AWAITING_RETURN and H17', async () => {
    const itDept2Code = `E-ITRVD${(seq += 1)}`;
    const itDept2Emp = await enterEmployee(h.ctx, h.admin, {
      employeeCode: itDept2Code,
      fullName: `IT ${itDept2Code}`,
      workEmail: `${itDept2Code.toLowerCase()}@acme.vn`,
      employmentType: 'STAFF',
      hireDate: '2025-01-01',
      departmentCode: dept2Code,
      jobTitle: 'IT Admin',
    });
    await h.ctx.sql.query(`UPDATE departments SET it_admin_employee_id = $2 WHERE id = $1`, [dept2Id, itDept2Emp.id]);
    const itDept2 = await h.account(itDept2Code, itDept2Emp.id, 'IT_ADMIN');

    const keyPlan = await planOf('DEVICE_KEY');
    const subId = await purchaseOf(keyPlan, 2);
    const keyId = await importKey(subId, 5);
    const bundledPlan = await planOf('DEVICE_BUNDLED');

    const holder = await h.person('E-RET-HOLD');
    const notice = await h.published();
    const holderAcc = await h.account('E-RET-HOLD', holder, 'EMPLOYEE');
    const { device: disposedDev } = await h.collected(holderAcc, notice);

    const keyAct1 = h.dataOf<{ activation: { id: string } }>(
      await h.activateDevice(disposedDev.id, { planId: keyPlan, licenseKeyId: keyId }).expect(201),
    ).activation.id;
    const bundledAct = h.dataOf<{ activation: { id: string } }>(
      await h.activateDevice(disposedDev.id, { planId: bundledPlan }).expect(201),
    ).activation.id;

    // Non-acting IT Admin blocked by H17.
    expect(h.codeOf(await h.retireDevice(disposedDev.id, { reason: 'Not mine' }, itDept2).expect(403))).toBe(
      'DEVICE.NOT_IN_CHARGE',
    );

    // Invalid activation decision cases.
    expect(
      h.codeOf(
        await h
          .retireDevice(disposedDev.id, {
            reason: 'Disposed',
            activationDecisions: [{ activationId: randomUUID(), licenseRelease: 'RETURN_TO_LOT' }],
          })
          .expect(422),
      ),
    ).toBe('DEVICE_ACTIVATION.NOT_ON_DEVICE');
    expect(
      h.codeOf(
        await h
          .retireDevice(disposedDev.id, {
            reason: 'Disposed',
            activationDecisions: [{ activationId: bundledAct, licenseRelease: 'RETURN_TO_LOT' }],
          })
          .expect(422),
      ),
    ).toBe('DEVICE_ACTIVATION.RELEASE_NOT_APPLICABLE');

    // Retire DISPOSED -> registration ended, credential revoked, bundled closed, key returned to lot.
    const retiredDisposed = h.dataOf<DeviceWire>(
      await h
        .retireDevice(disposedDev.id, {
          retirementKind: 'DISPOSED',
          reason: 'Motherboard failure',
          activationDecisions: [{ activationId: keyAct1, licenseRelease: 'RETURN_TO_LOT' }],
        })
        .expect(201),
    );
    expect(retiredDisposed).toMatchObject({ custody: 'RETIRED', retirementKind: 'DISPOSED', holder: null });

    const subAfterDispose = h.dataOf<{ occupied: number }>(
      await request(server()).get(`/api/v1/subscriptions/${subId}/seat-usage`).set(as(h.it1)).expect(200),
    );
    expect(subAfterDispose.occupied).toBe(0);

    // Retire LOST with LOST_WITH_DEVICE keeps seat occupied.
    const lostDev = await h.registered(await h.person('E-RET-LOST'));
    const keyAct2 = h.dataOf<{ activation: { id: string } }>(
      await h.activateDevice(lostDev.id, { planId: keyPlan, licenseKeyId: keyId }).expect(201),
    ).activation.id;

    const retiredLost = h.dataOf<DeviceWire>(
      await h
        .retireDevice(lostDev.id, {
          retirementKind: 'LOST',
          reason: 'Lost during travel',
          activationDecisions: [{ activationId: keyAct2, licenseRelease: 'LOST_WITH_DEVICE' }],
        })
        .expect(201),
    );
    expect(retiredLost).toMatchObject({ custody: 'RETIRED', retirementKind: 'LOST', holder: null });

    const subAfterLost = h.dataOf<{ occupied: number }>(
      await request(server()).get(`/api/v1/subscriptions/${subId}/seat-usage`).set(as(h.it1)).expect(200),
    );
    expect(subAfterLost.occupied).toBe(1);

    // Awaiting return machine cannot be retired directly.
    const awaiting = await h.registered(await h.person('E-RET-AWAIT'));
    await h.ctx.sql.query(
      `INSERT INTO device_return_tasks (id, organization_id, device_id, registration_id, employee_id, offboarding_case_id, department_id, due_on)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, gen_random_uuid(), $5, $6)`,
      [
        h.seed.organizationId,
        awaiting.id,
        awaiting.registrationId,
        awaiting.holder!.id,
        h.seed.departmentId,
        h.today(),
      ],
    );
    expect(h.codeOf(await h.retireDevice(awaiting.id, { reason: 'Cannot retire' }).expect(409))).toBe(
      'DEVICE.AWAITING_RETURN',
    );
  });

  it('voids an untouched in-stock machine, hides it from the list, and refuses voiding with history reasons', async () => {
    const bundledPlan = await planOf('DEVICE_BUNDLED');
    const clean = h.dataOf<DeviceWire>(
      await h
        .createDevice({
          deviceType: 'LAP',
          hostname: 'VOID-CLEAN',
          os: 'Windows 11',
          bundledPlanIds: [bundledPlan],
        })
        .expect(201),
    );

    const voided = h.dataOf<DeviceWire>(await h.voidDevice(clean.id, 'Typed twice by mistake').expect(201));
    expect(voided).toMatchObject({
      custody: 'VOIDED',
      voidReason: 'Typed twice by mistake',
    });
    expect(voided.voidedAt).not.toBeNull();

    const bundledRows = await h.ctx.sql.query<{ end_cause: string | null }>(
      `SELECT end_cause FROM device_activations WHERE device_id = $1`,
      [clean.id],
    );
    expect(bundledRows.rows[0]?.end_cause).toBe('DEVICE_VOIDED');

    // Hidden from list, readable by id, second void returns DEVICE.VOIDED.
    const listRes = h.dataOf<{ items: DeviceWire[] }>(await h.listDevices(`?search=${clean.assetCode}`).expect(200));
    expect(listRes.items.some((item) => item.id === clean.id)).toBe(false);
    expect(h.dataOf<DeviceWire>(await h.getDevice(clean.id).expect(200)).custody).toBe('VOIDED');
    expect(h.codeOf(await h.voidDevice(clean.id, 'Again').expect(409))).toBe('DEVICE.VOIDED');

    // Held machine refused with reason HELD.
    const held = await h.registered(await h.person('E-VOID-HELD'));
    const heldRefused = await h.voidDevice(held.id, 'Wrong').expect(409);
    expect(h.codeOf(heldRefused)).toBe('DEVICE.VOID_REFUSED');
    expect((heldRefused.body as { error: { details: { reason: string } } }).error.details.reason).toBe('HELD');

    // Signature recorded even after return to stock refused with SIGNATURE_RECORDED.
    const notice = await h.published();
    const signed = await h.signedMachine(
      await h.account('E-VOID-SIG', await h.person('E-VOID-SIG'), 'EMPLOYEE'),
      notice,
    );
    await h.returnDevice(signed.id, { condition: 'USABLE', softwareRemoval: { outcome: 'REMOVED' } }).expect(201);
    const sigRefused = await h.voidDevice(signed.id, 'Wrong').expect(409);
    expect(h.codeOf(sigRefused)).toBe('DEVICE.VOID_REFUSED');
    expect((sigRefused.body as { error: { details: { reason: string } } }).error.details.reason).toBe(
      'SIGNATURE_RECORDED',
    );

    // Key activation history even after deactivation refused with KEY_ACTIVATION.
    const keyPlan = await planOf('DEVICE_KEY');
    const keyId = await importKey(await purchaseOf(keyPlan, 1), 2);
    const keyDev = h.dataOf<DeviceWire>(
      await h.createDevice({ deviceType: 'LAP', hostname: 'VOID-KEY', os: 'Windows 11' }).expect(201),
    );
    const act = h.dataOf<{ activation: { id: string } }>(
      await h.activateDevice(keyDev.id, { planId: keyPlan, licenseKeyId: keyId }).expect(201),
    ).activation.id;
    await request(server()).post(`/api/v1/device-activations/${act}/deactivation`).set(as(h.it1)).send({}).expect(201);
    const keyRefused = await h.voidDevice(keyDev.id, 'Wrong').expect(409);
    expect(h.codeOf(keyRefused)).toBe('DEVICE.VOID_REFUSED');
    expect((keyRefused.body as { error: { details: { reason: string } } }).error.details.reason).toBe('KEY_ACTIVATION');
  });
});
