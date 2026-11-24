import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { ItCoverageSweepService } from '../../../src/modules/identity-access/it-coverage/it-coverage-sweep.service';
import type { ApiAccount } from '../../support/api-accounts';
import { OffboardingHarness, type CaseWire, type RightWire } from '../../support/offboarding-harness';
import type { TaskWire } from '../../support/provisioning-harness';
import type { Department, Person } from '../../support/request-harness';

interface DesignationWire {
  id: string;
  workKind: 'PROVISIONING_TASK' | 'OFFBOARDING_CASE' | 'DEVICE_RETURN_TASK' | 'DEVICE';
  workId: string;
  employee: { id: string; fullName: string };
  designee: { id: string; fullName: string; usable: boolean };
  reason: string;
  appointedAt: string;
  endedAt: string | null;
  endCause: 'REMOVED' | 'WORK_CLOSED' | null;
}

interface ReturnTaskWire {
  id: string;
  device: { id: string; assetCode: string; hostname: string };
  employee: { id: string; employeeCode: string; fullName: string };
  offboardingCaseId: string;
  department: { id: string; name: string } | null;
  actingItAdmins: Array<{ id: string; fullName: string; bySubstitute: boolean }>;
  waiting: boolean;
  state: 'OPEN' | 'RECEIVED' | 'NOT_RECOVERED' | 'CANCELLED';
}

describe('unplaced-work IT Admin designations across offboarding, revocation, return tasks, and coverage sweep (integration, real PostgreSQL)', () => {
  const h = new OffboardingHarness();
  let des: Department;
  let itB: Person;
  let itC: Person;
  let plainStaff: Person;
  let tool: string;
  let itCoverageSweeps: ItCoverageSweepService;
  let seq = 0;

  const nextCode = (prefix: string) => `${prefix}-${(seq += 1)}`;

  const appoint = (body: object, account: ApiAccount = h.sa) =>
    request(h.server()).post('/api/v1/unplaced-work-designations').set(h.as(account)).send(body);

  const endDesignation = (id: string, account: ApiAccount = h.sa) =>
    request(h.server()).post(`/api/v1/unplaced-work-designations/${id}/end`).set(h.as(account)).send();

  const listDesignations = (query = '', account: ApiAccount = h.sa) =>
    request(h.server()).get(`/api/v1/unplaced-work-designations${query}`).set(h.as(account));

  const listReturnTasks = (query = '', account: ApiAccount = h.sa) =>
    request(h.server()).get(`/api/v1/device-return-tasks${query}`).set(h.as(account));

  const completeReturnTask = (taskId: string, body: object, account: ApiAccount) =>
    request(h.server()).post(`/api/v1/device-return-tasks/${taskId}/completion`).set(h.as(account)).send(body);

  const createAssignedDevice = async (holderEmployeeId: string, actor = h.it1) => {
    const res = await request(h.server())
      .post('/api/v1/devices')
      .set(h.as(actor))
      .send({
        deviceType: 'LAP',
        hostname: `UNP-HOST-${(seq += 1)}`,
        os: 'Windows 11',
        holderEmployeeId,
        handedOverOn: '2025-01-15',
      });
    if (res.status !== 201) throw new Error(`device create failed: ${res.status} ${JSON.stringify(res.body)}`);

    return h.dataOf<{ id: string; assetCode: string; registrationId: string }>(res);
  };

  const noticesByCodeAndKey = async (code: string, eventKey: string) =>
    (
      await h.ctx.sql.query<{
        recipient_employee_id: string;
        subject_type: string | null;
        subject_id: string | null;
        params: Record<string, unknown>;
        event_key: string;
      }>(
        `SELECT recipient_employee_id, subject_type, subject_id, params, event_key
           FROM in_app_notifications
          WHERE code = $1 AND event_key = $2
          ORDER BY id`,
        [code, eventKey],
      )
    ).rows;

  const designationEndCause = async (id: string) =>
    (
      await h.ctx.sql.query<{ end_cause: string | null; ended_at: Date | null }>(
        `SELECT end_cause::text AS end_cause, ended_at FROM unplaced_work_it_designations WHERE id = $1`,
        [id],
      )
    ).rows[0];

  beforeAll(async () => {
    await h.start();
    itCoverageSweeps = h.ctx.app.get(ItCoverageSweepService);
    des = await h.departmentWithUnit('UWD-DES');
    await h.ctx.sql.query(`UPDATE departments SET it_admin_employee_id = $2 WHERE id = $1`, [des.id, h.it1.employeeId]);
    itB = await h.worker(des, nextCode('E-UWD-ITB'), ['IT_ADMIN']);
    itC = await h.worker(des, nextCode('E-UWD-ITC'), ['IT_ADMIN']);
    plainStaff = await h.worker(des, nextCode('E-UWD-EMP'));
    tool = await h.subscription(20, 'K2');
  }, 300_000);

  afterAll(async () => {
    await h.stop();
  });

  it('routes never-placed departure work through Super Admin alerts, batch designations, bySubstitute audit, and WORK_CLOSED closure', async () => {
    const empCode = nextCode('E-BINH');
    const binh = await h.worker(des, empCode);
    await h.seatOf(binh, { subscriptionId: tool }, empCode);
    await createAssignedDevice(binh.employeeId, h.it1);
    await h.stripPlacements(binh.employeeId);
    expect(await h.placementCount(binh.employeeId)).toBe(0);

    // Never-placed employee departs abruptly holding 1 personal seat + 1 registered device.
    const offboarding = await h.recordedCase(binh, {
      accessBlockMode: 'BLOCK_NOW',
      lastWorkingDay: h.today(),
    });
    expect(offboarding.department ?? null).toBeNull();
    expect(offboarding.state).toBe('LEFT');

    const saReturnTasks = h.dataOf<{ items: ReturnTaskWire[] }>(await listReturnTasks('?state=OPEN', h.sa).expect(200));
    const returnTask = saReturnTasks.items.find((item) => item.offboardingCaseId === offboarding.id);
    expect(returnTask).toBeDefined();
    expect(returnTask?.department).toBeNull();
    expect(returnTask?.waiting).toBe(true);

    // Super Admin receives UNPLACED_WORK_WAITING for OFFBOARDING_CASE and DEVICE_RETURN_WAITING (not UNPLACED_WORK_WAITING) for the return task.
    const caseWaiting = await noticesByCodeAndKey(
      'UNPLACED_WORK_WAITING',
      `unplacedWork:OFFBOARDING_CASE:${offboarding.id}`,
    );
    expect(caseWaiting).toEqual([
      expect.objectContaining({
        recipient_employee_id: h.sa.employeeId,
        subject_type: null,
        subject_id: null,
        params: { workKind: 'OFFBOARDING_CASE', workId: offboarding.id, employeeId: binh.employeeId },
      }),
    ]);

    const returnWaiting = await noticesByCodeAndKey('DEVICE_RETURN_WAITING', `deviceReturnWaiting:${returnTask!.id}`);
    expect(returnWaiting).toHaveLength(1);
    expect(returnWaiting[0].recipient_employee_id).toBe(h.sa.employeeId);
    expect(
      await noticesByCodeAndKey('UNPLACED_WORK_WAITING', `unplacedWork:DEVICE_RETURN_TASK:${returnTask!.id}`),
    ).toEqual([]);

    // Before designation, IT B is refused on offboarding account lock and device return task completion, and sees neither in MINE.
    expect(
      h.codeOf(await h.lockAccount(offboarding.id, { note: 'Attempt before designation' }, itB.account).expect(403)),
    ).toBe('OFFBOARDING_CASE.NOT_IN_CHARGE');
    expect(
      h.codeOf(
        await completeReturnTask(
          returnTask!.id,
          { outcome: 'RECEIVED', condition: 'USABLE', softwareRemoval: { outcome: 'REMOVED' } },
          itB.account,
        ).expect(403),
      ),
    ).toBe('DEVICE_RETURN_TASK.NOT_IN_CHARGE');
    expect(
      h
        .dataOf<{ items: ReturnTaskWire[] }>(await listReturnTasks('?scope=MINE&state=OPEN', itB.account).expect(200))
        .items.map((item) => item.id),
    ).not.toContain(returnTask!.id);

    // Super Admin designates IT B for both OFFBOARDING_CASE and DEVICE_RETURN_TASK in one batch request.
    const batchCreated = h.dataOf<{ items: DesignationWire[] }>(
      await appoint({
        employeeId: binh.employeeId,
        designeeEmployeeId: itB.employeeId,
        reason: 'Handle unplaced leaver case and laptop return',
        works: [
          { workKind: 'OFFBOARDING_CASE', workId: offboarding.id },
          { workKind: 'DEVICE_RETURN_TASK', workId: returnTask!.id },
        ],
      }).expect(201),
    );
    expect(batchCreated.items).toHaveLength(2);
    const caseDesignation = batchCreated.items.find((item) => item.workKind === 'OFFBOARDING_CASE')!;
    const returnDesignation = batchCreated.items.find((item) => item.workKind === 'DEVICE_RETURN_TASK')!;
    expect(caseDesignation.designee).toMatchObject({ id: itB.employeeId, usable: true });
    expect(returnDesignation.designee).toMatchObject({ id: itB.employeeId, usable: true });

    // IT B receives UNPLACED_WORK_DESIGNATED for each created designation; list is scoped to own rows for IT Admins.
    for (const item of batchCreated.items) {
      const designatedNotices = await noticesByCodeAndKey(
        'UNPLACED_WORK_DESIGNATED',
        `unplacedWorkDesignated:${item.id}`,
      );
      expect(designatedNotices).toEqual([
        expect.objectContaining({
          recipient_employee_id: itB.employeeId,
          subject_type: 'UNPLACED_WORK_DESIGNATION',
          subject_id: item.id,
          params: {
            designationId: item.id,
            workKind: item.workKind,
            workId: item.workId,
            employeeId: binh.employeeId,
          },
        }),
      ]);
    }
    const listForB = h.dataOf<{ items: DesignationWire[] }>(
      await listDesignations(`?employeeId=${binh.employeeId}`, itB.account).expect(200),
    );
    expect(listForB.items.map((item) => item.id).sort()).toEqual([caseDesignation.id, returnDesignation.id].sort());
    const listForC = h.dataOf<{ items: DesignationWire[] }>(
      await listDesignations(`?employeeId=${binh.employeeId}`, itC.account).expect(200),
    );
    expect(listForC.items).toEqual([]);

    // IT C is still refused on both works.
    expect(h.codeOf(await h.lockAccount(offboarding.id, { note: 'Unauthorized' }, itC.account).expect(403))).toBe(
      'OFFBOARDING_CASE.NOT_IN_CHARGE',
    );
    expect(
      h.codeOf(
        await completeReturnTask(
          returnTask!.id,
          { outcome: 'RECEIVED', condition: 'USABLE', softwareRemoval: { outcome: 'REMOVED' } },
          itC.account,
        ).expect(403),
      ),
    ).toBe('DEVICE_RETURN_TASK.NOT_IN_CHARGE');

    // IT B now sees the return task in MINE, performs account lock + opens revocation, and completes the return task.
    const mineReturnsForB = h.dataOf<{ items: ReturnTaskWire[] }>(
      await listReturnTasks('?scope=MINE&state=OPEN', itB.account).expect(200),
    );
    expect(mineReturnsForB.items.find((item) => item.id === returnTask!.id)).toMatchObject({
      waiting: false,
      actingItAdmins: [expect.objectContaining({ id: itB.employeeId, bySubstitute: true })],
    });

    await h.lockAccount(offboarding.id, { note: 'Locked company account' }, itB.account).expect(200);
    const lockEvents = await h.auditEventsOf('OFFBOARDING_CASE.ACCOUNT_LOCK_RECORDED', offboarding.id);
    expect(lockEvents.at(-1)?.after).toMatchObject({ bySubstitute: true });

    await h.revokeRights(offboarding.id, {}, itB.account).expect(200);
    const [right] = h.dataOf<{ items: RightWire[] }>(
      await h.rightsOf(offboarding.id, '?pageSize=20', itB.account).expect(200),
    ).items;
    const revTaskId = right.revocation?.taskId ?? '';
    expect(revTaskId).not.toBe('');

    // Opening revocation for the never-placed leaver alerts Super Admin with UNPLACED_WORK_WAITING.
    const taskWaiting = await noticesByCodeAndKey(
      'UNPLACED_WORK_WAITING',
      `unplacedWork:PROVISIONING_TASK:${revTaskId}`,
    );
    expect(taskWaiting).toEqual([
      expect.objectContaining({
        recipient_employee_id: h.sa.employeeId,
        subject_type: null,
        subject_id: null,
        params: { workKind: 'PROVISIONING_TASK', workId: revTaskId, employeeId: binh.employeeId },
      }),
    ]);

    // Before designation for the revocation task, IT B cannot see it in MINE or claim/complete it.
    expect(
      h
        .dataOf<{ items: TaskWire[] }>(await h.list({ scope: 'MINE', pageSize: 100 }, itB.account).expect(200))
        .items.map((item) => item.id),
    ).not.toContain(revTaskId);
    expect(h.codeOf(await h.claim(revTaskId, itB.account).expect(403))).toBe('PROVISIONING.NOT_IN_CHARGE');

    // Designate IT B for the revocation task -> visible in MINE, completes with bySubstitute: true, designation closes WORK_CLOSED.
    const [revDesignation] = h.dataOf<{ items: DesignationWire[] }>(
      await appoint({
        employeeId: binh.employeeId,
        designeeEmployeeId: itB.employeeId,
        reason: 'Complete unplaced seat revocation',
        works: [{ workKind: 'PROVISIONING_TASK', workId: revTaskId }],
      }).expect(201),
    ).items;
    expect(
      await noticesByCodeAndKey('UNPLACED_WORK_DESIGNATED', `unplacedWorkDesignated:${revDesignation.id}`),
    ).toHaveLength(1);
    expect(
      h
        .dataOf<{ items: TaskWire[] }>(await h.list({ scope: 'MINE', pageSize: 100 }, itB.account).expect(200))
        .items.map((item) => item.id),
    ).toContain(revTaskId);

    await h.claim(revTaskId, itB.account).expect(200);
    await h.revoked(revTaskId, { completion: 'ACCOUNT_REMOVED', evidence: 'Seat removed' }, itB.account).expect(200);
    const revAudit = await h.auditEvents('ProvisioningTask', revTaskId);
    expect(revAudit.at(-1)?.after).toMatchObject({ status: 'COMPLETED', bySubstitute: true });
    expect(await designationEndCause(revDesignation.id)).toMatchObject({ end_cause: 'WORK_CLOSED' });

    // IT B completes the device return task -> audit bySubstitute: true and designation closes WORK_CLOSED.
    await completeReturnTask(
      returnTask!.id,
      { outcome: 'RECEIVED', condition: 'USABLE', softwareRemoval: { outcome: 'REMOVED' } },
      itB.account,
    ).expect(201);
    const returnAudit = await h.auditEventsOf('DEVICE_RETURN_TASK.COMPLETED', returnTask!.id);
    expect(returnAudit.at(-1)?.after).toMatchObject({ outcome: 'RECEIVED', bySubstitute: true });
    expect(await designationEndCause(returnDesignation.id)).toMatchObject({ end_cause: 'WORK_CLOSED' });

    // Closing the offboarding case after mailbox lock closes the OFFBOARDING_CASE designation with WORK_CLOSED.
    await h.blockPass();
    const closedCase = h.dataOf<CaseWire>(await h.lockMailbox(offboarding.id, {}, itB.account).expect(200));
    expect(closedCase.closed).toBe(true);
    const mailboxAudit = await h.auditEventsOf('OFFBOARDING_CASE.MAILBOX_LOCK_RECORDED', offboarding.id);
    expect(mailboxAudit.at(-1)?.after).toMatchObject({ bySubstitute: true });
    expect(await designationEndCause(caseDesignation.id)).toMatchObject({ end_cause: 'WORK_CLOSED' });

    // Criterion (r): bySubstitute is recorded only in audit_events (no dedicated substitute report table exists).
    const substituteReportTables = await h.ctx.sql.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name LIKE '%substitute_report%'`,
    );
    expect(substituteReportTables.rows).toEqual([]);
  });

  it('enforces error paths, manual REMOVED ending, and daily coverage sweep for unusable unplaced-work designees', async () => {
    const unplaced = await h.unplacedStaff(nextCode('E-UNP-ERR'));
    const placedLeaver = await h.worker(des, nextCode('E-PLACED-LVR'));
    await h.ctx.sql.query(
      `UPDATE employee_placements SET valid_to = $2::date WHERE employee_id = $1 AND valid_to IS NULL`,
      [placedLeaver.employeeId, h.today()],
    );
    await h.ctx.sql.query(`UPDATE employees SET status = 'TERMINATED' WHERE id = $1`, [placedLeaver.employeeId]);

    const workId = randomUUID();

    // Non-Super Admin cannot appoint.
    expect(
      h.codeOf(
        await appoint(
          {
            employeeId: unplaced.employeeId,
            designeeEmployeeId: itB.employeeId,
            reason: 'Forbidden',
            works: [{ workKind: 'DEVICE', workId }],
          },
          itB.account,
        ).expect(403),
      ),
    ).toBe('AUTHORIZATION.FORBIDDEN');

    // Employee who has ever had a placement (even terminated) -> 409 EMPLOYEE_PLACED.
    expect(
      h.codeOf(
        await appoint({
          employeeId: placedLeaver.employeeId,
          designeeEmployeeId: itB.employeeId,
          reason: 'Should fail for placed leaver',
          works: [{ workKind: 'DEVICE', workId }],
        }).expect(409),
      ),
    ).toBe('UNPLACED_WORK_DESIGNATION.EMPLOYEE_PLACED');

    // Non-usable IT Admin (plain employee without IT_ADMIN role) -> 422 NOT_USABLE_IT_ADMIN.
    expect(
      h.codeOf(
        await appoint({
          employeeId: unplaced.employeeId,
          designeeEmployeeId: plainStaff.employeeId,
          reason: 'Plain staff cannot be designated',
          works: [{ workKind: 'DEVICE', workId }],
        }).expect(422),
      ),
    ).toBe('UNPLACED_WORK_DESIGNATION.NOT_USABLE_IT_ADMIN');

    // Valid appointment -> 201; second active appointment for same work -> 409 ALREADY_ACTIVE.
    const [created] = h.dataOf<{ items: DesignationWire[] }>(
      await appoint({
        employeeId: unplaced.employeeId,
        designeeEmployeeId: itC.employeeId,
        reason: 'Temporary coverage',
        works: [{ workKind: 'DEVICE', workId }],
      }).expect(201),
    ).items;

    expect(
      h.codeOf(
        await appoint({
          employeeId: unplaced.employeeId,
          designeeEmployeeId: itB.employeeId,
          reason: 'Duplicate active designation',
          works: [{ workKind: 'DEVICE', workId }],
        }).expect(409),
      ),
    ).toBe('UNPLACED_WORK_DESIGNATION.ALREADY_ACTIVE');

    // Lock designee -> weekday coverage sweep emits one UNPLACED_WORK_WAITING per day and skips weekends.
    await h.ctx.sql.query(`UPDATE app_users SET status = 'LOCKED' WHERE employee_id = $1`, [itC.employeeId]);
    try {
      const saturday = new Date('2026-11-28T03:00:00.000Z');
      expect(await itCoverageSweeps.run(saturday)).toEqual({ told: 0 });

      const monday = new Date('2026-11-30T03:00:00.000Z');
      await itCoverageSweeps.run(monday);
      await itCoverageSweeps.run(monday);
      const sweepNotices = await noticesByCodeAndKey(
        'UNPLACED_WORK_WAITING',
        `unplacedWork:DEVICE:${workId}:2026-11-30`,
      );
      expect(sweepNotices).toEqual([
        expect.objectContaining({
          recipient_employee_id: h.sa.employeeId,
          subject_type: null,
          subject_id: null,
          params: { workKind: 'DEVICE', workId, employeeId: unplaced.employeeId },
        }),
      ]);
    } finally {
      await h.ctx.sql.query(`UPDATE app_users SET status = 'ACTIVE' WHERE employee_id = $1`, [itC.employeeId]);
    }

    // Ending active designation -> 201 REMOVED; second end -> 409 ALREADY_ENDED; missing -> 404 NOT_FOUND.
    const ended = h.dataOf<DesignationWire>(await endDesignation(created.id).expect(201));
    expect(ended.endCause).toBe('REMOVED');
    expect(ended.endedAt).not.toBeNull();
    expect(h.codeOf(await endDesignation(created.id).expect(409))).toBe('UNPLACED_WORK_DESIGNATION.ALREADY_ENDED');
    expect(h.codeOf(await endDesignation(randomUUID()).expect(404))).toBe('UNPLACED_WORK_DESIGNATION.NOT_FOUND');
  });
});
