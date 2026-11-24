import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { addDays } from '../../../src/core/business-date';
import { declareApplication } from '../../support/builders/catalog.builder';
import { OffboardingHarness } from '../../support/offboarding-harness';
import type { Department, Person } from '../../support/request-harness';

interface ReturnTaskRow {
  id: string;
  device_id: string;
  registration_id: string;
  offboarding_case_id: string;
  department_id: string | null;
  due_on: string;
  state: string;
  handled_at: Date | null;
  handled_by_app_user_id: string | null;
  overdue_noticed_on: string | null;
}

describe('departure device return tasks and cancellation lock ordering (integration, real PostgreSQL)', () => {
  const h = new OffboardingHarness();
  let des: Department;
  let seq = 0;

  beforeAll(async () => {
    await h.start();
    des = await h.departmentWithUnit('P-DR');
    await h.ctx.sql.query(`UPDATE departments SET it_admin_employee_id = $2 WHERE id = $1`, [des.id, h.it1.employeeId]);
  }, 300_000);

  afterAll(async () => {
    await h.stop();
  });

  const registerDevice = async (holderEmployeeId: string) => {
    seq += 1;
    const response = await request(h.server())
      .post('/api/v1/devices')
      .set(h.as(h.it1))
      .send({
        deviceType: 'LAP',
        hostname: `DR-HOST-${seq}`,
        os: 'Windows 11',
        holderEmployeeId,
        handedOverOn: '2025-01-15',
      });
    if (response.status !== 201) {
      throw new Error(`create device failed: ${response.status} ${JSON.stringify(response.body)}`);
    }

    return h.dataOf<{ id: string; registrationId: string }>(response);
  };

  const tasksOfCase = async (caseId: string): Promise<ReturnTaskRow[]> =>
    (
      await h.ctx.sql.query<ReturnTaskRow>(
        `SELECT id::text, device_id::text, registration_id::text, offboarding_case_id::text, department_id::text,
                to_char(due_on, 'YYYY-MM-DD') AS due_on, state::text AS state,
                handled_at, handled_by_app_user_id::text,
                to_char(overdue_noticed_on, 'YYYY-MM-DD') AS overdue_noticed_on
           FROM device_return_tasks
          WHERE offboarding_case_id = $1
          ORDER BY created_at, id`,
        [caseId],
      )
    ).rows;

  const tasksOfRegistration = async (registrationId: string): Promise<ReturnTaskRow[]> =>
    (
      await h.ctx.sql.query<ReturnTaskRow>(
        `SELECT id::text, device_id::text, registration_id::text, offboarding_case_id::text, department_id::text,
                to_char(due_on, 'YYYY-MM-DD') AS due_on, state::text AS state,
                handled_at, handled_by_app_user_id::text,
                to_char(overdue_noticed_on, 'YYYY-MM-DD') AS overdue_noticed_on
           FROM device_return_tasks
          WHERE registration_id = $1
          ORDER BY created_at, id`,
        [registrationId],
      )
    ).rows;

  const registrationEnded = async (registrationId: string) =>
    (
      await h.ctx.sql.query<{ ended: boolean; end_cause: string | null }>(
        `SELECT ended_at IS NOT NULL AS ended, end_cause::text AS end_cause
           FROM device_registrations WHERE id = $1`,
        [registrationId],
      )
    ).rows[0];

  const setupKeyActivation = async (deviceId: string) => {
    seq += 1;
    const appId = await declareApplication(h.ctx, h.it1.accessToken, {
      name: `DRKeyApp-${seq}`,
      kind: 'LICENSED',
      vendorName: `DRVendor-${seq}`,
      dataSensitivity: 'LOW',
    });
    const planRes = await request(h.server())
      .post('/api/v1/plans')
      .set(h.as(h.it1))
      .send({
        applicationId: appId,
        name: `DRPlan-${seq}`,
        provisioningType: 'K4',
        controlLevel: 'FULL',
        keyBinding: 'DEVICE_KEY',
      })
      .expect(201);
    const planId = h.dataOf<{ id: string }>(planRes).id;

    const subRes = await request(h.server())
      .post('/api/v1/subscriptions')
      .set(h.as(h.it1))
      .send({
        planId,
        kind: 'PERPETUAL',
        purchasedQuantity: 2,
        unitPrice: { amount: '1000000', currency: 'VND' },
        startDate: '2026-01-01',
        responsibleItAdminEmployeeId: h.it1.employeeId,
      })
      .expect(201);
    const subscriptionId = h.dataOf<{ id: string }>(subRes).id;

    const keyRes = await request(h.server())
      .post('/api/v1/license-keys/imports')
      .set(h.as(h.it1))
      .send({
        subscriptionId,
        keys: [`DRKEY-${randomUUID().replace(/-/g, '').slice(0, 16).toUpperCase()}`],
        maxActivations: 10,
      })
      .expect(201);
    const licenseKeyId = h.dataOf<{ keys: Array<{ id: string }> }>(keyRes).keys[0].id;

    const actRes = await request(h.server())
      .post(`/api/v1/devices/${deviceId}/activations`)
      .set(h.as(h.it1))
      .send({ planId, licenseKeyId })
      .expect(201);

    return h.dataOf<{ activation: { id: string } }>(actRes).activation.id;
  };

  it('creates OPEN tasks with lastWorkingDay for WITH_LAST_DAY and today for BLOCK_NOW', async () => {
    const plannedUser = await h.worker(des, `E-DR-A-${(seq += 1)}`);
    const plannedDev = await registerDevice(plannedUser.employeeId);
    const lastDay = h.day(5);

    const plannedCase = await h.recordedCase(plannedUser, {
      lastWorkingDay: lastDay,
      accessBlockMode: 'WITH_LAST_DAY',
    });
    const plannedTasks = await tasksOfCase(plannedCase.id);

    expect(plannedTasks).toHaveLength(1);
    expect(plannedTasks[0]).toMatchObject({
      device_id: plannedDev.id,
      registration_id: plannedDev.registrationId,
      department_id: des.id,
      due_on: lastDay,
      state: 'OPEN',
    });
    expect(plannedTasks[0].due_on).not.toBe(addDays(lastDay, 1));

    const abruptUser = await h.worker(des, `E-DR-B-${(seq += 1)}`);
    const abruptDev = await registerDevice(abruptUser.employeeId);
    const abruptCase = await h.recordedCase(abruptUser, {
      lastWorkingDay: h.today(),
      accessBlockMode: 'BLOCK_NOW',
    });
    const abruptTasks = await tasksOfCase(abruptCase.id);

    expect(abruptTasks).toHaveLength(1);
    expect(abruptTasks[0]).toMatchObject({
      device_id: abruptDev.id,
      due_on: h.today(),
      state: 'OPEN',
    });
  });

  it('updates due_on and clears overdue_noticed_on when moving last working day to >= today', async () => {
    const person = await h.worker(des, `E-DR-D-${(seq += 1)}`);
    await registerDevice(person.employeeId);
    const wire = await h.recordedCase(person, { lastWorkingDay: h.day(5), accessBlockMode: 'WITH_LAST_DAY' });

    await h.ctx.sql.query(
      `UPDATE device_return_tasks SET overdue_noticed_on = $2::date WHERE offboarding_case_id = $1`,
      [wire.id, h.day(-1)],
    );

    const movedTo = h.day(8);
    await h.changeLastDay(wire.id, { lastWorkingDay: movedTo, reason: 'Gia hạn bàn giao' }).expect(200);

    const tasks = await tasksOfCase(wire.id);
    expect(tasks[0]).toMatchObject({ due_on: movedTo, overdue_noticed_on: null, state: 'OPEN' });
  });

  it('cancels open return tasks before block moment while keeping registration open, and keeps task open past block moment', async () => {
    const cancelUser = await h.worker(des, `E-DR-E-${(seq += 1)}`);
    const cancelDev = await registerDevice(cancelUser.employeeId);
    const cancelWire = await h.recordedCase(cancelUser, { lastWorkingDay: h.day(4) });

    await h.cancelCase(cancelWire.id, { reason: 'Nhân viên ở lại' }).expect(200);
    const cancelledTasks = await tasksOfCase(cancelWire.id);
    expect(cancelledTasks[0]).toMatchObject({
      state: 'CANCELLED',
      handled_by_app_user_id: null,
    });
    expect(cancelledTasks[0].handled_at).not.toBeNull();
    expect(await registrationEnded(cancelDev.registrationId)).toEqual({ ended: false, end_cause: null });

    const blockUser = await h.worker(des, `E-DR-F-${(seq += 1)}`);
    const blockDev = await registerDevice(blockUser.employeeId);
    const blockWire = await h.recordedCase(blockUser, { lastWorkingDay: h.day(3) });
    await h.ctx.sql.query(
      `UPDATE offboarding_cases SET last_working_day = $2::date, departure_effective_on = $3::date WHERE id = $1`,
      [blockWire.id, h.day(-2), h.day(-1)],
    );
    await h.ctx.sql.query(`UPDATE employee_access_blocks SET blocked_from = $2::date WHERE employee_id = $1`, [
      blockUser.employeeId,
      h.day(-1),
    ]);
    await h.blockPass();

    expect(await registrationEnded(blockDev.registrationId)).toEqual({
      ended: true,
      end_cause: 'DEPARTURE_BLOCKED',
    });
    const stillOpen = await tasksOfCase(blockWire.id);
    expect(stillOpen[0]).toMatchObject({ state: 'OPEN', handled_at: null });
  });

  it('creates a new OPEN return task for the same registration when re-recording offboarding after pre-block cancellation', async () => {
    const user = await h.worker(des, `E-DR-REOPEN-${(seq += 1)}`);
    const dev = await registerDevice(user.employeeId);

    const firstWire = await h.recordedCase(user, { lastWorkingDay: h.day(4) });
    const firstTasks = await tasksOfCase(firstWire.id);
    expect(firstTasks).toHaveLength(1);
    expect(firstTasks[0]).toMatchObject({
      device_id: dev.id,
      registration_id: dev.registrationId,
      state: 'OPEN',
    });

    await h.cancelCase(firstWire.id, { reason: 'Tạm hoãn nghỉ việc' }).expect(200);
    expect(await tasksOfCase(firstWire.id)).toMatchObject([{ id: firstTasks[0].id, state: 'CANCELLED' }]);
    expect(await registrationEnded(dev.registrationId)).toEqual({ ended: false, end_cause: null });

    const secondWire = await h.recordedCase(user, { lastWorkingDay: h.day(6) });
    const secondTasks = await tasksOfCase(secondWire.id);
    expect(secondTasks).toHaveLength(1);
    expect(secondTasks[0]).toMatchObject({
      device_id: dev.id,
      registration_id: dev.registrationId,
      state: 'OPEN',
    });
    expect(secondTasks[0].id).not.toBe(firstTasks[0].id);

    const history = await tasksOfRegistration(dev.registrationId);
    expect(history).toHaveLength(2);
    expect(history).toMatchObject([
      { id: firstTasks[0].id, offboarding_case_id: firstWire.id, state: 'CANCELLED' },
      { id: secondTasks[0].id, offboarding_case_id: secondWire.id, state: 'OPEN' },
    ]);
  });

  it('cancels past-block departure concurrently with closing a keyed activation without deadlocks for 20 rounds', async () => {
    const subAccount = await h.subscription(30, 'K2');
    for (let round = 0; round < 20; round += 1) {
      const workerCode = `E-DR-K-${round}-${(seq += 1)}`;
      const worker: Person = await h.worker(des, workerCode);
      await h.seatOf(worker, { subscriptionId: subAccount }, workerCode);
      const dev = await registerDevice(worker.employeeId);
      const activationId = await setupKeyActivation(dev.id);
      const wire = await h.recordedCase(worker, { lastWorkingDay: h.day(4) });

      await h.ctx.sql.query(
        `UPDATE offboarding_cases SET last_working_day = $2::date, departure_effective_on = $3::date WHERE id = $1`,
        [wire.id, h.day(-2), h.day(-1)],
      );
      await h.ctx.sql.query(`UPDATE employee_access_blocks SET blocked_from = $2::date WHERE employee_id = $1`, [
        worker.employeeId,
        h.day(-1),
      ]);
      await h.lockAccount(wire.id, { note: 'Locked' }).expect(200);
      await h.revokeRights(wire.id, {}).expect(200);

      const [cancelRes, deactivateRes] = await Promise.all([
        h.cancelCase(wire.id, { reason: `Concurrency round ${round}` }),
        request(h.server())
          .post(`/api/v1/device-activations/${activationId}/deactivation`)
          .set(h.as(h.it1))
          .send({ licenseRelease: 'RETURN_TO_LOT' }),
      ]);

      expect(cancelRes.status).toBe(200);
      expect(deactivateRes.status).toBe(201);
      expect((await tasksOfCase(wire.id))[0].state).toBe('CANCELLED');
    }
  }, 120_000);
});
