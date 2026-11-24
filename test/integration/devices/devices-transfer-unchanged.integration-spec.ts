import request from 'supertest';
import { addDays } from '../../../src/core/business-date';
import { TransferGraceSweeper } from '../../../src/modules/personnel/transfer-grace/transfer-grace.job';
import { declareApplication } from '../../support/builders/catalog.builder';
import { createDepartment } from '../../support/builders/organization.builder';
import { TransferHarness } from '../../support/transfer-harness';

describe('department transfer keeps device registrations and activations intact (integration, real PostgreSQL)', () => {
  const h = new TransferHarness();
  let des: { id: string; code: string };
  let fin: { id: string; code: string };
  let seq = 0;

  beforeAll(async () => {
    await h.start();
    des = await createDepartment(h.ctx, h.admin, { code: 'TR-DES', name: 'Transfer Source Dept' });
    fin = await createDepartment(h.ctx, h.admin, { code: 'TR-FIN', name: 'Transfer Target Dept' });
    await h.ctx.sql.query(`UPDATE departments SET it_admin_employee_id = $2 WHERE id = ANY($1::uuid[])`, [
      [des.id, fin.id],
      h.it1.employeeId,
    ]);
  }, 300_000);

  afterAll(async () => {
    await h.stop();
  });

  it('keeps registration and bundled activation unchanged after transfer grace and reflects new currentDepartment', async () => {
    seq += 1;
    const mover = await h.veteran({ ...des, unitId: '' }, `E-TRD-${seq}`);

    const appId = await declareApplication(h.ctx, h.it1.accessToken, {
      name: `TRBundledApp-${seq}`,
      kind: 'LICENSED',
      vendorName: `TRVendor-${seq}`,
      dataSensitivity: 'LOW',
    });
    const planId = h.dataOf<{ id: string }>(
      await request(h.server())
        .post('/api/v1/plans')
        .set(h.as(h.it1))
        .send({
          applicationId: appId,
          name: `TRPlan-${seq}`,
          provisioningType: 'K4',
          controlLevel: 'FULL',
          keyBinding: 'DEVICE_BUNDLED',
        })
        .expect(201),
    ).id;

    const device = h.dataOf<{ id: string; registrationId: string }>(
      await request(h.server())
        .post('/api/v1/devices')
        .set(h.as(h.it1))
        .send({
          deviceType: 'LAP',
          hostname: `TR-LAP-${seq}`,
          os: 'Windows 11',
          bundledPlanIds: [planId],
          holderEmployeeId: mover.employeeId,
          handedOverOn: '2026-10-15',
        })
        .expect(201),
    );

    const transfer = await h.moveToday(mover, { ...fin, unitId: '' });
    await h.ctx.sql.query(`UPDATE department_transfers SET grace_ends_on = $2::date WHERE id = $1`, [
      transfer.id,
      addDays(h.today(), -1),
    ]);
    const sweeper = h.ctx.app.get(TransferGraceSweeper, { strict: false });
    await (sweeper as unknown as { sweep: () => Promise<void> }).sweep();

    const detail = h.dataOf<{
      custody: string;
      registrationId: string | null;
      holder: { id: string } | null;
      currentDepartment: { id: string; name: string } | null;
    }>(await request(h.server()).get(`/api/v1/devices/${device.id}`).set(h.as(h.it1)).expect(200));

    expect(detail.custody).toBe('ASSIGNED');
    expect(detail.registrationId).toBe(device.registrationId);
    expect(detail.holder?.id).toBe(mover.employeeId);
    expect(detail.currentDepartment).toEqual({ id: fin.id, name: 'Transfer Target Dept' });

    const actCount = await h.ctx.sql.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM device_activations WHERE device_id = $1 AND deactivated_at IS NULL`,
      [device.id],
    );
    expect(Number(actCount.rows[0].count)).toBe(1);

    const taskCount = await h.ctx.sql.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM device_return_tasks WHERE device_id = $1`,
      [device.id],
    );
    expect(Number(taskCount.rows[0].count)).toBe(0);
  });
});
