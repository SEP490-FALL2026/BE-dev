import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { ApiAccount, createActivatedAccount } from '../../support/api-accounts';
import { insertEmployeeWithoutPlacement } from '../../support/builders/account.builder';
import { declareApplication } from '../../support/builders/catalog.builder';
import { DevicesHarness, type DeviceWire } from '../../support/devices-harness';
import { insertEmployeeFixture } from '../../support/http-test-app';

interface ChecklistStep {
  step: number;
  key: string;
  status: string;
  reasons: string[];
  facts?: Record<string, unknown>;
}

describe('device initial records & onboarding checklist step 6 (W2-13, integration, real PostgreSQL)', () => {
  const h = new DevicesHarness();
  let itOther: ApiAccount;
  let empAnId: string;
  let seq = 0;

  const unique = (prefix: string): string => `${prefix} ${(seq += 1)}`;
  const server = () => h.ctx.app.getHttpServer();
  const as = (account: ApiAccount) => ({ Authorization: `Bearer ${account.accessToken}` });

  const postInitial = (body: object, account: ApiAccount = h.it1) =>
    request(server()).post('/api/v1/device-initial-records').set(as(account)).send(body);

  const checklist = async () =>
    h.dataOf<{ steps: ChecklistStep[] }>(
      await request(server()).get('/api/v1/onboarding-checklist').set(as(h.it1)).expect(200),
    ).steps;

  const createK4KeyPlan = async (purchasedQuantity: number, initialActivationsUsed: number) => {
    const applicationId = await declareApplication(h.ctx, h.it1.accessToken, {
      name: unique('AutoCAD'),
      kind: 'LICENSED',
      vendorName: unique('Autodesk'),
      dataSensitivity: 'LOW',
    });
    const planId = h.dataOf<{ id: string }>(
      await request(server())
        .post('/api/v1/plans')
        .set(as(h.it1))
        .send({
          applicationId,
          name: unique('Plan'),
          provisioningType: 'K4',
          controlLevel: 'FULL',
          keyBinding: 'DEVICE_KEY',
        })
        .expect(201),
    ).id;
    const lotId = h.dataOf<{ id: string }>(
      await request(server())
        .post('/api/v1/license-lots')
        .set(as(h.it1))
        .send({
          planId,
          purpose: 'STOCK',
          licenseCount: purchasedQuantity,
          unitPrice: { amount: '1500000', currency: 'VND' },
          purchasedOn: '2025-01-01',
        })
        .expect(201),
    ).id;
    await request(server())
      .post(`/api/v1/license-lots/${lotId}/keys`)
      .set(as(h.it1))
      .send({
        keys: [`ACAD-${randomUUID().replace(/-/g, '').slice(0, 16).toUpperCase()}`],
        maxActivations: 10,
        initialActivationsUsed,
      })
      .expect(201);
    const keyId = (
      await h.ctx.sql.query<{ id: string }>(
        `SELECT id FROM license_keys WHERE license_lot_id = $1 ORDER BY imported_at DESC, id DESC LIMIT 1`,
        [lotId],
      )
    ).rows[0].id;

    return { planId, lotId, keyId };
  };

  beforeAll(async () => {
    await h.start();
    itOther = await createActivatedAccount(h.ctx, h.seed, {
      code: 'E-INIT-OTH',
      email: 'init-other@acme.vn',
      role: 'IT_ADMIN',
      admin: h.admin,
    });
    empAnId = (
      await insertEmployeeFixture(h.ctx.app, h.seed, {
        code: 'E-AN',
        email: 'an@acme.vn',
      })
    ).employeeId;
    await h.ctx.sql.query(`UPDATE employees SET hire_date = '2024-01-01' WHERE id = $1`, [empAnId]);
    await h.ctx.sql.query(`UPDATE employee_placements SET valid_from = '2024-01-01' WHERE employee_id = $1`, [empAnId]);
  });

  afterAll(async () => {
    await h.stop();
  });

  it('W2-13 (e-initial): checklist starts with step 6 incomplete (NO_INITIAL_DEVICE) and seat baseline not blocked by it', async () => {
    const steps = await checklist();
    expect(steps).toHaveLength(6);
    expect(steps[5]).toEqual({
      step: 6,
      key: 'DEVICE_INITIAL_RECORDS',
      status: 'INCOMPLETE',
      reasons: ['NO_INITIAL_DEVICE'],
      facts: { initialRecords: 0, signaturesMissing: 0 },
    });
  });

  it('W2-13 (a, b, e): records legacy initial device with past handover and INITIAL key activation without changing activationsUsed, rejects generated format, and completes step 6 after BM-06 signature', async () => {
    await h.subscription(5);
    const { lotId, keyId } = await createK4KeyPlan(5, 3);

    // (b) Rejects generated format as legacy code (422 DEVICE.ASSET_CODE_INVALID)
    const badCode = await postInitial({
      deviceType: 'LAP',
      hostname: 'OLD-BAD',
      os: 'Windows 11',
      assetCode: 'LAP-26-0007',
    }).expect(422);
    expect(h.codeOf(badCode)).toBe('DEVICE.ASSET_CODE_INVALID');

    // H17: non-acting IT Admin for An's department gets 403 DEVICE.NOT_IN_CHARGE
    const forbidden = await postInitial(
      {
        deviceType: 'LAP',
        hostname: 'AN-LT-01',
        os: 'Windows 11',
        assetCode: 'IT-OLD-0042',
        holderEmployeeId: empAnId,
        handedOverOn: '2025-03-15',
      },
      itOther,
    ).expect(403);
    expect(h.codeOf(forbidden)).toBe('DEVICE.NOT_IN_CHARGE');

    // (a) Valid legacy record with past handover and INITIAL key activation
    const created = h.dataOf<DeviceWire>(
      await postInitial({
        deviceType: 'LAP',
        hostname: 'AN-LT-01',
        os: 'Windows 11',
        assetCode: 'IT-OLD-0042',
        holderEmployeeId: empAnId,
        handedOverOn: '2025-03-15',
        keyActivations: [{ licenseKeyId: keyId }],
      }).expect(201),
    );
    expect(created).toMatchObject({
      assetCode: 'IT-OLD-0042',
      assetCodeOrigin: 'LEGACY',
      registeredFrom: '2025-03-15',
      signatureMissing: true,
      holder: { id: empAnId },
    });

    const actRows = await h.ctx.sql.query<{ origin: string; license_key_id: string }>(
      `SELECT origin, license_key_id FROM device_activations WHERE device_id = $1`,
      [created.id],
    );
    expect(actRows.rows).toEqual([{ origin: 'INITIAL', license_key_id: keyId }]);

    // activationsUsed of the key stays unchanged at initialActivationsUsed (3)
    const keysPage = h.dataOf<{ items: Array<{ id: string; activationsUsed: number; openActivations: number }> }>(
      await request(server()).get(`/api/v1/license-keys?licenseLotId=${lotId}`).set(as(h.it1)).expect(200),
    );
    expect(keysPage.items.find((k) => k.id === keyId)).toMatchObject({ activationsUsed: 3, openActivations: 1 });

    // Duplicate legacy code -> 409 DEVICE.ASSET_CODE_TAKEN
    const dup = await postInitial({
      deviceType: 'LAP',
      hostname: 'AN-LT-02',
      os: 'Windows 11',
      assetCode: 'IT-OLD-0042',
    }).expect(409);
    expect(h.codeOf(dup)).toBe('DEVICE.ASSET_CODE_TAKEN');

    // (e) Step 6 incomplete with SIGNATURES_MISSING until BM-06 is recorded, while step 4 is unblocked
    const beforeSig = await checklist();
    expect(beforeSig[3]).toMatchObject({ step: 4, key: 'SEAT_BASELINE', status: 'INCOMPLETE', reasons: [] });
    expect(beforeSig[5]).toEqual({
      step: 6,
      key: 'DEVICE_INITIAL_RECORDS',
      status: 'INCOMPLETE',
      reasons: ['SIGNATURES_MISSING'],
      facts: { initialRecords: 1, signaturesMissing: 1 },
    });

    const notice = await h.published();
    await h.signed(created.registrationId as string, notice.id);

    const afterSig = await checklist();
    expect(afterSig[5]).toEqual({
      step: 6,
      key: 'DEVICE_INITIAL_RECORDS',
      status: 'DONE',
      reasons: [],
      facts: { initialRecords: 1, signaturesMissing: 0 },
    });
  });

  it('rejects initial recording to an unplaced holder with 409 DEVICE.HOLDER_UNPLACED', async () => {
    const unplaced = await insertEmployeeWithoutPlacement(h.ctx, h.seed, {
      code: 'E-UNPLACED-INIT',
      email: 'unplaced-init@acme.vn',
    });

    const res = await postInitial({
      deviceType: 'LAP',
      hostname: 'UNPLACED-LT',
      os: 'Windows 11',
      assetCode: 'IT-UNPLACED-01',
      holderEmployeeId: unplaced,
    }).expect(409);

    expect(h.codeOf(res)).toBe('DEVICE.HOLDER_UNPLACED');
  });

  it('W2-13 (c, d, e): handles concurrent initial record vs seat-baseline close without deadlock, does not block baseline close, and rejects after close', async () => {
    // Record an unsigned initial machine so step 6 returns to INCOMPLETE before closing baseline
    const unsigned = h.dataOf<DeviceWire>(
      await postInitial({
        deviceType: 'PC',
        hostname: 'PC-UNSIGNED',
        os: 'Windows 11',
        holderEmployeeId: empAnId,
      }).expect(201),
    );
    expect(unsigned.assetCodeOrigin).toBe('GENERATED');
    expect(unsigned.assetCode).toMatch(/^PC-\d{2}-\d{4}$/);
    expect((await checklist())[5]).toMatchObject({
      status: 'INCOMPLETE',
      reasons: ['SIGNATURES_MISSING'],
    });

    // (d) Concurrent initial record + seat-baseline close: no 40P01 deadlock; close succeeds even while step 6 is INCOMPLETE
    const [initRes, closeRes] = await Promise.all([
      postInitial({ deviceType: 'OTH', hostname: 'OTH-RACE', os: 'Linux', assetCode: 'IT-RACE-01' }),
      request(server()).post('/api/v1/seat-baseline/close').set(as(h.it1)),
    ]);

    expect(closeRes.status).toBe(200);
    expect([201, 409]).toContain(initRes.status);
    if (initRes.status === 409) {
      expect(h.codeOf(initRes)).toBe('DEVICE.INITIALIZATION_CLOSED');
    }

    // (c) After seat baseline is closed -> 409 DEVICE.INITIALIZATION_CLOSED
    const afterClose = await postInitial({
      deviceType: 'LAP',
      hostname: 'LATE-LT',
      os: 'Windows 11',
      assetCode: 'IT-LATE-01',
    }).expect(409);
    expect(h.codeOf(afterClose)).toBe('DEVICE.INITIALIZATION_CLOSED');
  });
});
