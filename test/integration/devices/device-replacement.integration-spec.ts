import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { ApiAccount } from '../../support/api-accounts';
import { declareApplication } from '../../support/builders/catalog.builder';
import { createDepartment, enterEmployee } from '../../support/builders/organization.builder';
import { DevicesHarness, type DeviceWire } from '../../support/devices-harness';

interface ReplacementResponseWire {
  returnedDeviceId: string;
  replacementDevice: DeviceWire;
  movedActivations: Array<{ activationId: string; overActivationCap: boolean }>;
}

describe('device replacement (integration, real PostgreSQL)', () => {
  const h = new DevicesHarness();
  let dept2Id: string;
  let dept2Code: string;
  let seq = 0;

  const unique = (prefix: string): string => `${prefix} ${(seq += 1)}`;
  const server = () => h.ctx.app.getHttpServer();
  const as = (account: ApiAccount) => ({ Authorization: `Bearer ${account.accessToken}` });

  const planOf = async (binding: 'DEVICE_KEY' | 'DEVICE_BUNDLED'): Promise<string> => {
    const application = await declareApplication(h.ctx, h.it1.accessToken, {
      name: unique('ReplaceApp'),
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

  const importKey = async (subscriptionId: string, maxActivations: number): Promise<string> => {
    await request(server())
      .post('/api/v1/license-keys/imports')
      .set(as(h.it1))
      .send({
        subscriptionId,
        keys: [`REP-${randomUUID().replace(/-/g, '').slice(0, 18).toUpperCase()}`],
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

  const moveActivation = (activationId: string, targetDeviceId: string, account: ApiAccount = h.it1) =>
    request(server())
      .post(`/api/v1/device-activations/${activationId}/moves`)
      .set(as(account))
      .send({ targetDeviceId });

  beforeAll(async () => {
    await h.start();
    const d2 = await createDepartment(h.ctx, h.admin, { code: 'REP-D2', name: 'Replacement Dept 2' });
    dept2Id = d2.id;
    dept2Code = d2.code;
  }, 300_000);

  afterAll(async () => {
    await h.stop();
  });

  it('atomically swaps an assigned machine with an in-stock usable machine, moves selected keyed activations, and audits', async () => {
    const itDept2 = await (async () => {
      const code = `E-ITREP${(seq += 1)}`;
      const emp = await enterEmployee(h.ctx, h.admin, {
        employeeCode: code,
        fullName: `IT ${code}`,
        workEmail: `${code.toLowerCase()}@acme.vn`,
        employmentType: 'STAFF',
        hireDate: '2025-01-01',
        departmentCode: dept2Code,
        jobTitle: 'IT Admin',
      });
      await h.ctx.sql.query(`UPDATE departments SET it_admin_employee_id = $2 WHERE id = $1`, [dept2Id, emp.id]);
      return { employeeId: emp.id, account: await h.account(code, emp.id, 'IT_ADMIN') };
    })();

    const holder = await h.person('E-REP-HOLD');
    const notice = await h.published();
    const holderAcc = await h.account('E-REP-HOLD', holder, 'EMPLOYEE');
    const oldCollected = await h.collected(holderAcc, notice);
    const oldDevice = oldCollected.device;
    const replacement = h.dataOf<DeviceWire>(
      await h.createDevice({ deviceType: 'LAP', hostname: 'REP-STOCK-1', os: 'Windows 11' }).expect(201),
    );

    const planMove = await planOf('DEVICE_KEY');
    const subMove = await purchaseOf(planMove, 1);
    const keyMove = await importKey(subMove, 2);

    const planStay = await planOf('DEVICE_KEY');
    const subStay = await purchaseOf(planStay, 2);
    const keyStay = await importKey(subStay, 2);

    const actMove = h.dataOf<{ activation: { id: string } }>(
      await h.activateDevice(oldDevice.id, { planId: planMove, licenseKeyId: keyMove }).expect(201),
    ).activation.id;
    const actStay = h.dataOf<{ activation: { id: string } }>(
      await h.activateDevice(oldDevice.id, { planId: planStay, licenseKeyId: keyStay }).expect(201),
    ).activation.id;

    // Non-acting IT Admin cannot replace.
    const forbidden = await h
      .replaceDevice(
        oldDevice.id,
        {
          replacementDeviceId: replacement.id,
          condition: 'IN_REPAIR',
          conditionNote: 'Battery swollen',
          softwareRemoval: { outcome: 'REMOVED' },
          collectorInstalled: true,
        },
        itDept2.account,
      )
      .expect(403);
    expect(h.codeOf(forbidden)).toBe('DEVICE.NOT_IN_CHARGE');

    // Substitute on seed dept succeeds and audits bySubstitute: true.
    await h.ctx.sql.query(
      `INSERT INTO department_it_substitutes (id, organization_id, department_id, substitute_employee_id, replaced_employee_id, reason, appointed_at, appointed_by_app_user_id)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, 'Coverage', now(), $5)`,
      [h.seed.organizationId, h.seed.departmentId, itDept2.employeeId, h.it1.employeeId, h.it1.appUserId],
    );

    const res = h.dataOf<ReplacementResponseWire>(
      await h
        .replaceDevice(
          oldDevice.id,
          {
            replacementDeviceId: replacement.id,
            condition: 'IN_REPAIR',
            conditionNote: 'Battery swollen',
            softwareRemoval: { outcome: 'NOT_REMOVABLE', note: 'OEM agent remains' },
            collectorInstalled: true,
            activations: [
              { activationId: actMove, action: 'MOVE' },
              { activationId: actStay, action: 'STAY' },
            ],
          },
          itDept2.account,
        )
        .expect(201),
    );

    expect(res.returnedDeviceId).toBe(oldDevice.id);
    expect(res.replacementDevice).toMatchObject({
      id: replacement.id,
      custody: 'ASSIGNED',
      holder: { id: holder },
      collectorInstalled: true,
    });
    expect(res.movedActivations).toEqual([{ activationId: actMove, overActivationCap: false }]);

    const oldAfter = h.dataOf<DeviceWire>(await h.getDevice(oldDevice.id).expect(200));
    expect(oldAfter).toMatchObject({
      custody: 'IN_STOCK',
      condition: 'IN_REPAIR',
      conditionNote: 'Battery swollen',
      holder: null,
    });

    const actRows = await h.ctx.sql.query<{
      id: string;
      device_id: string;
      end_cause: string | null;
      license_released: boolean | null;
      deactivated_at: Date | null;
    }>(
      `SELECT id, device_id, end_cause, license_released, deactivated_at FROM device_activations WHERE plan_id = ANY($1::uuid[])`,
      [[planMove, planStay]],
    );
    expect(actRows.rows.find((r) => r.id === actMove)).toMatchObject({
      end_cause: 'MOVED',
      license_released: true,
    });
    expect(actRows.rows.find((r) => r.device_id === replacement.id && r.deactivated_at === null)).toBeDefined();
    expect(actRows.rows.find((r) => r.id === actStay)?.deactivated_at).toBeNull();

    const creds = await h.ctx.sql.query<{ revoked_at: Date | null }>(
      `SELECT revoked_at FROM device_credentials WHERE device_id = $1`,
      [oldDevice.id],
    );
    expect(creds.rows[0]?.revoked_at).not.toBeNull();

    const audits = await h.ctx.sql.query<{ after: { movedCount: number; bySubstitute?: boolean } }>(
      `SELECT after FROM audit_events WHERE resource_id = $1 AND action = 'DEVICE.REPLACED'`,
      [oldDevice.id],
    );
    expect(audits.rows[0]?.after).toMatchObject({ movedCount: 1, bySubstitute: true });
  });

  it('refuses invalid replacement states, bundled moves, and rolls back atomically on mid-flight activation rejection', async () => {
    const holder = await h.person('E-REP-ERR');
    const assigned = await h.registered(holder);
    const assigned2 = await h.registered(await h.person('E-REP-OTHER'));
    const brokenStock = h.dataOf<DeviceWire>(
      await h.createDevice({ deviceType: 'LAP', hostname: 'REP-BRK', os: 'Windows 11' }).expect(201),
    );
    await h.changeCondition(brokenStock.id, { condition: 'BROKEN', note: 'Screen broken' }).expect(201);
    const goodStock = h.dataOf<DeviceWire>(
      await h.createDevice({ deviceType: 'LAP', hostname: 'REP-GOOD', os: 'Windows 11' }).expect(201),
    );

    const bundledPlan = await planOf('DEVICE_BUNDLED');
    const bundledAct = h.dataOf<{ activation: { id: string } }>(
      await h.activateDevice(assigned.id, { planId: bundledPlan }).expect(201),
    ).activation.id;

    expect(
      h.codeOf(
        await h
          .replaceDevice(assigned.id, {
            replacementDeviceId: assigned.id,
            condition: 'USABLE',
            softwareRemoval: { outcome: 'REMOVED' },
            collectorInstalled: true,
          })
          .expect(422),
      ),
    ).toBe('DEVICE.SAME_DEVICE');

    expect(
      h.codeOf(
        await h
          .replaceDevice(goodStock.id, {
            replacementDeviceId: brokenStock.id,
            condition: 'USABLE',
            softwareRemoval: { outcome: 'REMOVED' },
            collectorInstalled: true,
          })
          .expect(409),
      ),
    ).toBe('DEVICE.NOT_HELD');

    expect(
      h.codeOf(
        await h
          .replaceDevice(assigned.id, {
            replacementDeviceId: assigned2.id,
            condition: 'USABLE',
            softwareRemoval: { outcome: 'REMOVED' },
            collectorInstalled: true,
          })
          .expect(409),
      ),
    ).toBe('DEVICE.REPLACEMENT_NOT_IN_STOCK');

    expect(
      h.codeOf(
        await h
          .replaceDevice(assigned.id, {
            replacementDeviceId: brokenStock.id,
            condition: 'USABLE',
            softwareRemoval: { outcome: 'REMOVED' },
            collectorInstalled: true,
          })
          .expect(409),
      ),
    ).toBe('DEVICE.NOT_USABLE');

    expect(
      h.codeOf(
        await h
          .replaceDevice(assigned.id, {
            replacementDeviceId: goodStock.id,
            condition: 'USABLE',
            softwareRemoval: { outcome: 'NOT_REMOVABLE', note: '   ' },
            collectorInstalled: true,
          })
          .expect(422),
      ),
    ).toBe('DEVICE.SOFTWARE_REMOVAL_NOTE_REQUIRED');

    expect(
      h.codeOf(
        await h
          .replaceDevice(assigned.id, {
            replacementDeviceId: goodStock.id,
            condition: 'USABLE',
            softwareRemoval: { outcome: 'REMOVED' },
            collectorInstalled: true,
            activations: [{ activationId: bundledAct, action: 'MOVE' }],
          })
          .expect(422),
      ),
    ).toBe('DEVICE_ACTIVATION.NOT_MOVABLE');

    expect(
      h.codeOf(
        await h
          .replaceDevice(assigned.id, {
            replacementDeviceId: goodStock.id,
            condition: 'USABLE',
            softwareRemoval: { outcome: 'REMOVED' },
            collectorInstalled: true,
            activations: [{ activationId: randomUUID(), action: 'MOVE' }],
          })
          .expect(422),
      ),
    ).toBe('DEVICE_ACTIVATION.NOT_ON_DEVICE');

    // Confirm atomic rollback: old machine is still ASSIGNED and goodStock is still IN_STOCK.
    expect(h.dataOf<DeviceWire>(await h.getDevice(assigned.id).expect(200)).custody).toBe('ASSIGNED');
    expect(h.dataOf<DeviceWire>(await h.getDevice(goodStock.id).expect(200)).custody).toBe('IN_STOCK');
  });

  it('executes concurrent replacement and activation move against the same target machine for 20 rounds without deadlocks', async () => {
    const holder = await h.person('E-REP-CONC');
    let heldId = (await h.registered(holder)).id;
    let stockId = h.dataOf<DeviceWire>(
      await h.createDevice({ deviceType: 'LAP', hostname: 'REP-CONC-2', os: 'Windows 11' }).expect(201),
    ).id;
    const otherId = h.dataOf<DeviceWire>(
      await h.createDevice({ deviceType: 'LAP', hostname: 'REP-CONC-3', os: 'Windows 11' }).expect(201),
    ).id;

    const p1 = await planOf('DEVICE_KEY');
    const k1 = await importKey(await purchaseOf(p1, 2), 50);
    const p2 = await planOf('DEVICE_KEY');
    const k2 = await importKey(await purchaseOf(p2, 2), 50);

    let actOnHeld = h.dataOf<{ activation: { id: string } }>(
      await h.activateDevice(heldId, { planId: p1, licenseKeyId: k1 }).expect(201),
    ).activation.id;
    let actOnOther = h.dataOf<{ activation: { id: string } }>(
      await h.activateDevice(otherId, { planId: p2, licenseKeyId: k2 }).expect(201),
    ).activation.id;

    for (let i = 0; i < 20; i += 1) {
      const [repRes, moveRes] = await Promise.all([
        h.replaceDevice(heldId, {
          replacementDeviceId: stockId,
          condition: 'USABLE',
          softwareRemoval: { outcome: 'REMOVED' },
          collectorInstalled: false,
          activations: [{ activationId: actOnHeld, action: 'MOVE' }],
        }),
        moveActivation(actOnOther, stockId),
      ]);
      expect(repRes.status).toBe(201);
      expect(moveRes.status).toBe(201);

      const movedAct2Id = h.dataOf<{ activation: { id: string } }>(moveRes).activation.id;
      const movedBack = await moveActivation(movedAct2Id, otherId).expect(201);
      actOnOther = h.dataOf<{ activation: { id: string } }>(movedBack).activation.id;

      const latestAct1 = await h.ctx.sql.query<{ id: string }>(
        `SELECT id FROM device_activations WHERE device_id = $1 AND plan_id = $2 AND deactivated_at IS NULL`,
        [stockId, p1],
      );
      actOnHeld = latestAct1.rows[0].id;
      const prevHeld = heldId;
      heldId = stockId;
      stockId = prevHeld;
    }
  }, 60_000);
});
