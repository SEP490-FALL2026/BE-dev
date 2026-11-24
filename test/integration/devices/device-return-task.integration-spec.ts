import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { addDays } from '../../../src/core/business-date';
import { DeviceReturnTaskSweepService } from '../../../src/modules/devices/return-task/device-return-task-sweep.service';
import { declareApplication } from '../../support/builders/catalog.builder';
import { createDepartment, enterEmployee } from '../../support/builders/organization.builder';
import { OffboardingHarness } from '../../support/offboarding-harness';
import type { Department } from '../../support/request-harness';

interface ReturnTaskWire {
  id: string;
  device: { id: string; assetCode: string; hostname: string };
  employee: { id: string; employeeCode: string; fullName: string };
  offboardingCaseId: string;
  department: { id: string; name: string } | null;
  actingItAdmins: Array<{ id: string; fullName: string; bySubstitute: boolean }>;
  waiting: boolean;
  dueOn: string;
  overdue: boolean;
  state: 'OPEN' | 'RECEIVED' | 'NOT_RECOVERED' | 'CANCELLED';
  handledAt: string | null;
}

describe('device return task list, completion, device detail, and dashboard (integration, real PostgreSQL)', () => {
  const h = new OffboardingHarness();
  let des: Department;
  let seq = 0;

  beforeAll(async () => {
    await h.start();
    des = await h.departmentWithUnit('P-RT');
    await h.ctx.sql.query(`UPDATE departments SET it_admin_employee_id = $2 WHERE id = $1`, [des.id, h.it1.employeeId]);
  }, 300_000);

  afterAll(async () => {
    await h.stop();
  });

  const createAssignedDevice = async (holderEmployeeId: string, actor = h.it1) => {
    seq += 1;
    const res = await request(h.server())
      .post('/api/v1/devices')
      .set(h.as(actor))
      .send({
        deviceType: 'LAP',
        hostname: `RT-HOST-${seq}`,
        os: 'Windows 11',
        holderEmployeeId,
        handedOverOn: '2025-01-15',
      });
    if (res.status !== 201) throw new Error(`device create failed: ${res.status} ${JSON.stringify(res.body)}`);

    return h.dataOf<{ id: string; assetCode: string; registrationId: string }>(res);
  };

  const listTasks = (query = '', account = h.it1) =>
    request(h.server()).get(`/api/v1/device-return-tasks${query}`).set(h.as(account));

  const completeTask = (taskId: string, body: object, account = h.it1) =>
    request(h.server()).post(`/api/v1/device-return-tasks/${taskId}/completion`).set(h.as(account)).send(body);

  const appointSubstitute = (departmentId: string, substituteEmployeeId: string) =>
    request(h.server())
      .post(`/api/v1/departments/${departmentId}/it-substitute`)
      .set(h.as(h.sa))
      .send({ substituteEmployeeId, reason: 'Cover leaving IT Admin' });

  it('excludes leaving IT Admin from acting, lets appointed substitute complete as RECEIVED, and updates dashboard', async () => {
    const itDeptCode = `P-ITSELF-${(seq += 1)}`;
    const itDept = await createDepartment(h.ctx, h.admin, { code: itDeptCode, name: 'IT Dept Self Leave' });
    const leaverItEmp = await enterEmployee(h.ctx, h.admin, {
      employeeCode: `E-RT-IT-${(seq += 1)}`,
      fullName: 'Leaving IT Admin',
      workEmail: `it-leave-${seq}@acme.vn`,
      employmentType: 'STAFF',
      hireDate: '2025-01-01',
      departmentCode: itDeptCode,
      jobTitle: 'IT Admin',
    });
    const leaverItAcc = await h.account(`ITLV-${seq}`, leaverItEmp.id, 'IT_ADMIN');
    await h.ctx.sql.query(`UPDATE departments SET it_admin_employee_id = $2 WHERE id = $1`, [
      itDept.id,
      leaverItEmp.id,
    ]);

    const otherItEmp = await enterEmployee(h.ctx, h.admin, {
      employeeCode: `E-RT-SUB-${(seq += 1)}`,
      fullName: 'Substitute IT Admin',
      workEmail: `it-sub-${seq}@acme.vn`,
      employmentType: 'STAFF',
      hireDate: '2025-01-01',
      departmentCode: des.code,
      jobTitle: 'IT Admin',
    });
    const subAcc = await h.account(`ITSUB-${seq}`, otherItEmp.id, 'IT_ADMIN');

    const device = await createAssignedDevice(leaverItEmp.id, leaverItAcc);
    const recordedRes = await h
      .recordCase({
        employeeId: leaverItEmp.id,
        lastWorkingDay: addDays(h.today(), -1),
        accessBlockMode: 'WITH_LAST_DAY',
        groundsNote: h.groundsNote,
      })
      .expect(201);
    const wire = h.dataOf<{ id: string }>(recordedRes);

    // Other IT Admin cannot see in MINE nor complete while unassigned; Super Admin sees waiting=true.
    const mineBefore = h.dataOf<{ items: ReturnTaskWire[] }>(await listTasks('?scope=MINE', subAcc).expect(200));
    expect(mineBefore.items.some((t) => t.offboardingCaseId === wire.id)).toBe(false);

    const saList = h.dataOf<{ items: ReturnTaskWire[] }>(await listTasks('?state=OPEN', h.sa).expect(200));
    const waitingTask = saList.items.find((t) => t.offboardingCaseId === wire.id)!;
    expect(waitingTask.waiting).toBe(true);
    expect(waitingTask.overdue).toBe(true);
    expect(waitingTask.actingItAdmins).toEqual([]);

    const waitingNotice = await h.ctx.sql.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM in_app_notifications
        WHERE code = 'DEVICE_RETURN_WAITING' AND subject_id = $1 AND recipient_employee_id = $2`,
      [waitingTask.id, h.sa.employeeId],
    );
    expect(Number(waitingNotice.rows[0].count)).toBe(1);

    const denied = await completeTask(
      waitingTask.id,
      { outcome: 'RECEIVED', condition: 'USABLE', softwareRemoval: { outcome: 'REMOVED' } },
      subAcc,
    ).expect(403);
    expect(h.codeOf(denied)).toBe('DEVICE_RETURN_TASK.NOT_IN_CHARGE');

    // Device detail shows openReturnTask with waiting=true.
    const devDetail = h.dataOf<{ custody: string; openReturnTask: { id: string; waiting: boolean } | null }>(
      await request(h.server()).get(`/api/v1/devices/${device.id}`).set(h.as(h.it1)).expect(200),
    );
    expect(devDetail.custody).toBe('AWAITING_RETURN');
    expect(devDetail.openReturnTask).toMatchObject({ id: waitingTask.id, waiting: true });

    // Super Admin appoints substitute -> visible in sub's MINE, dashboard counts reflect open + overdue, sub completes.
    await appointSubstitute(itDept.id, otherItEmp.id).expect(201);

    const dashBefore = h.dataOf<{
      sections: { deviceReturnTasksOpen: { count: number }; deviceReturnTasksOverdue: { count: number } };
    }>(await request(h.server()).get('/api/v1/dashboards/it-admin').set(h.as(subAcc)).expect(200));
    expect(dashBefore.sections.deviceReturnTasksOpen.count).toBeGreaterThanOrEqual(1);
    expect(dashBefore.sections.deviceReturnTasksOverdue.count).toBeGreaterThanOrEqual(1);

    const mineAfter = h.dataOf<{ items: ReturnTaskWire[] }>(await listTasks('?scope=MINE', subAcc).expect(200));
    const readyTask = mineAfter.items.find((t) => t.id === waitingTask.id)!;
    expect(readyTask.waiting).toBe(false);
    expect(readyTask.actingItAdmins).toEqual([
      { id: otherItEmp.id, fullName: 'Substitute IT Admin', bySubstitute: true },
    ]);

    await h.blockPass();

    const completed = await completeTask(
      waitingTask.id,
      { outcome: 'RECEIVED', condition: 'IN_REPAIR', softwareRemoval: { outcome: 'REMOVED' } },
      subAcc,
    ).expect(201);
    expect(h.dataOf<{ task: ReturnTaskWire }>(completed).task.state).toBe('RECEIVED');

    const afterDev = h.dataOf<{ custody: string; condition: string; openReturnTask: unknown }>(
      await request(h.server()).get(`/api/v1/devices/${device.id}`).set(h.as(h.it1)).expect(200),
    );
    expect(afterDev).toMatchObject({ custody: 'IN_STOCK', condition: 'IN_REPAIR', openReturnTask: null });
    expect((await h.auditEventsOf('DEVICE_RETURN_TASK.COMPLETED', waitingTask.id)).length).toBe(1);
  });

  it('completes NOT_RECOVERED to RETIRED LOST, completes via POST /devices/:id/returns, closes case while open, and denies non-acting IT even if in-charge locked', async () => {
    const otherIt = await h.worker(des, `E-RT-NO-${(seq += 1)}`, ['IT_ADMIN']);
    const emp1 = await h.worker(des, `E-RT-1-${(seq += 1)}`);
    const emp2 = await h.worker(des, `E-RT-2-${(seq += 1)}`);

    const d1 = await createAssignedDevice(emp1.employeeId);
    const d2 = await createAssignedDevice(emp2.employeeId);

    // Attach a DEVICE_KEY activation on d1 to verify LOST retirement decision handling.
    const appId = await declareApplication(h.ctx, h.it1.accessToken, {
      name: `RTLostApp-${(seq += 1)}`,
      kind: 'LICENSED',
      vendorName: `RTVendor-${seq}`,
      dataSensitivity: 'LOW',
    });
    const planId = h.dataOf<{ id: string }>(
      await request(h.server())
        .post('/api/v1/plans')
        .set(h.as(h.it1))
        .send({
          applicationId: appId,
          name: `RTPlan-${seq}`,
          provisioningType: 'K4',
          controlLevel: 'FULL',
          keyBinding: 'DEVICE_KEY',
        })
        .expect(201),
    ).id;
    const subId = h.dataOf<{ id: string }>(
      await request(h.server())
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
        .expect(201),
    ).id;
    const keyId = h.dataOf<{ keys: Array<{ id: string }> }>(
      await request(h.server())
        .post('/api/v1/license-keys/imports')
        .set(h.as(h.it1))
        .send({ subscriptionId: subId, keys: [`RTK-${randomUUID().slice(0, 12).toUpperCase()}`], maxActivations: 5 })
        .expect(201),
    ).keys[0].id;
    const actId = h.dataOf<{ activation: { id: string } }>(
      await request(h.server())
        .post(`/api/v1/devices/${d1.id}/activations`)
        .set(h.as(h.it1))
        .send({ planId, licenseKeyId: keyId })
        .expect(201),
    ).activation.id;

    const case1 = await h.recordedCase(emp1, { lastWorkingDay: h.today(), accessBlockMode: 'BLOCK_NOW' });
    const case2 = await h.recordedCase(emp2, { lastWorkingDay: h.day(3), accessBlockMode: 'WITH_LAST_DAY' });
    const openTasks = h.dataOf<{ items: ReturnTaskWire[] }>(await listTasks('?state=OPEN', h.sa).expect(200)).items;
    const t1 = openTasks.find((t) => t.offboardingCaseId === case1.id)!;
    const t2 = openTasks.find((t) => t.offboardingCaseId === case2.id)!;

    // Non-acting IT gets 403 NOT_IN_CHARGE even if in-charge IT is locked.
    await h.ctx.sql.query(`UPDATE app_users SET locked_at = now() WHERE employee_id = $1`, [h.it1.employeeId]);
    const blockedRes = await completeTask(
      t1.id,
      {
        outcome: 'NOT_RECOVERED',
        reason: 'Lost',
        activationDecisions: [{ activationId: actId, licenseRelease: 'LOST_WITH_DEVICE' }],
      },
      otherIt.account,
    ).expect(403);
    expect(h.codeOf(blockedRes)).toBe('DEVICE_RETURN_TASK.NOT_IN_CHARGE');
    await h.ctx.sql.query(`UPDATE app_users SET locked_at = NULL WHERE employee_id = $1`, [h.it1.employeeId]);

    // Complete t1 as NOT_RECOVERED -> RETIRED LOST.
    await completeTask(
      t1.id,
      {
        outcome: 'NOT_RECOVERED',
        reason: 'Unrecoverable after departure',
        activationDecisions: [{ activationId: actId, licenseRelease: 'LOST_WITH_DEVICE' }],
      },
      h.it1,
    ).expect(201);
    const retiredDev = h.dataOf<{ custody: string; retirementKind: string | null }>(
      await request(h.server()).get(`/api/v1/devices/${d1.id}`).set(h.as(h.it1)).expect(200),
    );
    expect(retiredDev).toMatchObject({ custody: 'RETIRED', retirementKind: 'LOST' });

    // Return via POST /devices/:id/returns closes t2 as RECEIVED.
    await request(h.server())
      .post(`/api/v1/devices/${d2.id}/returns`)
      .set(h.as(h.it1))
      .send({ condition: 'USABLE', softwareRemoval: { outcome: 'REMOVED' } })
      .expect(201);
    const closedTasks = h.dataOf<{ items: ReturnTaskWire[] }>(await listTasks('?state=CLOSED', h.sa).expect(200)).items;
    expect(closedTasks.find((t) => t.id === t2.id)?.state).toBe('RECEIVED');

    // Departure case can still complete closure while a return task remains OPEN.
    const emp3 = await h.worker(des, `E-RT-3-${(seq += 1)}`);
    await createAssignedDevice(emp3.employeeId);
    const case3 = await h.recordedCase(emp3, { lastWorkingDay: h.today(), accessBlockMode: 'BLOCK_NOW' });
    await h.lockAccount(case3.id, { note: 'Locked account' }).expect(200);
    await h.lockMailbox(case3.id).expect(200);
    const closureRes = await h.readCase(case3.id).expect(200);
    expect(h.dataOf<{ closed: boolean }>(closureRes).closed).toBe(true);
    const open3 = h.dataOf<{ items: ReturnTaskWire[] }>(await listTasks('?state=OPEN', h.sa).expect(200)).items;
    expect(open3.some((t) => t.offboardingCaseId === case3.id)).toBe(true);
  });

  it('sends overdue return task reminders once per working day and skips weekends', async () => {
    const emp = await h.worker(des, `E-RT-SW-${(seq += 1)}`);
    await createAssignedDevice(emp.employeeId);
    const caseWire = await h.recordedCase(emp, { lastWorkingDay: h.day(5), accessBlockMode: 'WITH_LAST_DAY' });
    const tasks = h.dataOf<{ items: ReturnTaskWire[] }>(await listTasks('?state=OPEN', h.sa).expect(200)).items;
    const task = tasks.find((t) => t.offboardingCaseId === caseWire.id)!;
    await h.ctx.sql.query(`UPDATE device_return_tasks SET due_on = $2::date WHERE id = $1`, [task.id, '2026-01-01']);

    const sweeper = h.ctx.app.get(DeviceReturnTaskSweepService, { strict: false });
    const countNotices = async (recipientId: string) =>
      Number(
        (
          await h.ctx.sql.query<{ count: string }>(
            `SELECT count(*)::text AS count FROM in_app_notifications
              WHERE code = 'DEVICE_RETURN_OVERDUE' AND subject_id = $1 AND recipient_employee_id = $2`,
            [task.id, recipientId],
          )
        ).rows[0].count,
      );

    // Next working Monday -> Saturday/Sunday skipped; Monday runs twice -> 1 notice per recipient.
    const findWeekday = (offset: number, weekend: boolean) => {
      for (let i = offset; i < offset + 10; i += 1) {
        const d = new Date(Date.now() + i * 86_400_000);
        const day = d.getUTCDay();
        if (weekend ? day === 0 || day === 6 : day >= 1 && day <= 5) return d;
      }
      throw new Error('Could not find target calendar date');
    };

    const mondayLike = findWeekday(0, false);
    const nextWorkday = findWeekday(14, false);
    const weekendDay = findWeekday(0, true);

    await sweeper.run(weekendDay);
    expect(await countNotices(h.it1.employeeId)).toBe(0);

    await sweeper.run(mondayLike);
    await sweeper.run(mondayLike);
    expect(await countNotices(h.it1.employeeId)).toBe(1);
    expect(await countNotices(h.sa.employeeId)).toBe(1);

    await sweeper.run(nextWorkday);
    expect(await countNotices(h.it1.employeeId)).toBe(2);
    expect(await countNotices(h.sa.employeeId)).toBe(2);
  });
});
