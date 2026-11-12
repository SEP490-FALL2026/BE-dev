import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { ACCOUNT_PASSWORD } from '../../support/api-accounts';
import { recordAsSuperAdmin } from '../../support/super-admin-event-runner';
import { OffboardingHarness, type CaseWire } from '../../support/offboarding-harness';
import type { Department, Person } from '../../support/request-harness';

const h = new OffboardingHarness();
const LOCK = { note: 'Đã khóa tài khoản công ty' };

interface TaskRow {
  status: string;
  close_reason: string | null;
  claimed_by_app_user_id: string | null;
}

interface RegistrationRow {
  id: string;
  end_cause: string | null;
  ended: boolean;
}

/**
 * `MF2-C` (S3, P2, `QĐ-110c`, R-41, T-MF2 case 3): a handover cancelled after its last working day takes back what the block did. The
 * reasons the departure gave to the tasks of revocation are withdrawn (a task that waits is cancelled, one in progress is left to the IT
 * Admin to close by what happened at the provider, one another source asks for goes on), the machines the person holds stop being
 * registered to them (cause `DEPARTURE_BLOCKED`) so that the unlock which lifts the block revives nothing, and a person who has left
 * cannot be cancelled. Over HTTP, on real PostgreSQL; "after the last working day" is made by moving the days of the case and of its block
 * into the past, as the other specs of the departure do.
 */
describe('cancelling a handover after its last working day (integration, real PostgreSQL)', () => {
  let des: Department;
  let subscriptions: string[];
  let k1: string;
  let counter = 0;
  let assets = 0;

  beforeAll(async () => {
    await h.start();
    des = await h.departmentWithUnit('P-CL');
    subscriptions = [await h.subscription(60, 'K2'), await h.subscription(60, 'K2'), await h.subscription(60, 'K2')];
    k1 = await h.subscription(60, 'K1');
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  const leaver = async (): Promise<{ person: Person; seats: string[] }> => {
    const code = `E-CL-${(counter += 1)}`;
    const person = await h.worker(des, code);
    const seats: string[] = [];
    for (const subscriptionId of subscriptions) seats.push(await h.seatOf(person, { subscriptionId }, code));

    return { person, seats };
  };
  const login = (person: Person) =>
    request(h.server()).post('/api/v1/auth/login').send({ email: person.account.email, password: ACCOUNT_PASSWORD });
  const unlock = (person: Person) =>
    request(h.server())
      .post(`/api/v1/app-users/${person.account.appUserId}/unlock`)
      .set(h.as(h.sa))
      .send({ reason: 'Hủy bàn giao, mở lại truy cập' });
  const pastLastDay = async (wire: CaseWire, person: Person): Promise<void> => {
    await h.ctx.sql.query(
      `UPDATE offboarding_cases SET last_working_day = $2::date, departure_effective_on = $3::date WHERE id = $1`,
      [wire.id, h.day(-2), h.day(-1)],
    );
    await h.ctx.sql.query(`UPDATE employee_access_blocks SET blocked_from = $2::date WHERE employee_id = $1`, [
      person.employeeId,
      h.day(-1),
    ]);
  };
  const taskOf = async (id: string): Promise<TaskRow> =>
    (
      await h.ctx.sql.query<TaskRow>(
        `SELECT status::text AS status, close_reason, claimed_by_app_user_id::text FROM provisioning_tasks WHERE id = $1`,
        [id],
      )
    ).rows[0];
  const reasonsOf = async (taskId: string): Promise<{ source: string; withdrawn: boolean }[]> =>
    (
      await h.ctx.sql.query<{ source: string; withdrawn: boolean }>(
        `SELECT source::text AS source, withdrawn_at IS NOT NULL AS withdrawn FROM provisioning_task_reasons
          WHERE task_id = $1 ORDER BY source::text`,
        [taskId],
      )
    ).rows;
  /** A machine registered to the holder, as the IT Admin does; returns its registration. */
  const machineOf = async (holderEmployeeId: string): Promise<string> => {
    assets += 1;
    const response = await request(h.server())
      .post('/api/v1/devices')
      .set(h.as(h.it1))
      .send({ assetCode: `CL-${assets}`, hostname: `CL-HOST-${assets}`, os: 'Windows 11', holderEmployeeId });
    if (response.status !== 201) throw new Error(`device: ${response.status} ${JSON.stringify(response.body)}`);

    return h.dataOf<{ registrationId: string }>(response).registrationId;
  };
  const credentialOf = async (registrationId: string): Promise<string> => {
    const id = randomUUID();
    await h.ctx.sql.query(
      `INSERT INTO device_credentials (id, organization_id, registration_id, device_id, collector_kind, secret_hash, expires_at)
       SELECT $2::uuid, r.organization_id, r.id, r.device_id, 'AI_COLLECTOR', 'hash', now() + interval '30 days'
         FROM device_registrations r WHERE r.id = $1`,
      [registrationId, id],
    );

    return id;
  };
  const registrationsOf = async (employeeId: string): Promise<RegistrationRow[]> =>
    (
      await h.ctx.sql.query<RegistrationRow>(
        `SELECT id::text, end_cause::text AS end_cause, ended_at IS NOT NULL AS ended FROM device_registrations
          WHERE holder_employee_id = $1 ORDER BY created_at, id`,
        [employeeId],
      )
    ).rows;
  const credentialRow = async (id: string) =>
    (
      await h.ctx.sql.query<{ revoked: boolean; revocation_cause: string | null }>(
        `SELECT revoked_at IS NOT NULL AS revoked, revocation_cause::text AS revocation_cause
           FROM device_credentials WHERE id = $1`,
        [id],
      )
    ).rows[0];
  const noticesAbout = async (caseId: string): Promise<{ code: string; params: Record<string, unknown> }[]> =>
    (
      await h.ctx.sql.query<{ code: string; params: Record<string, unknown> }>(
        `SELECT code, params FROM in_app_notifications
          WHERE code = 'DEPARTURE_REVOCATION_IT_CLOSE' AND subject_id = $1`,
        [caseId],
      )
    ).rows;

  describe('a handover past its last working day, with revocations opened by the IT Admin', () => {
    /**
     * Three seats of one person: A waits in the queue, B is taken by the IT Admin (in progress), C was asked for by a ghost seat
     * recommendation before the departure added its reason. The person holds two machines, one with a credential; another person holds one.
     */
    const prepared = async () => {
      const { person, seats } = await leaver();
      const [a, b, c] = seats;
      const first = await machineOf(person.employeeId);
      const second = await machineOf(person.employeeId);
      const credential = await credentialOf(first);
      const colleague = await h.worker(des, `E-CL-${(counter += 1)}`);
      const kept = await machineOf(colleague.employeeId);
      const wire = await h.recordedCase(person);
      const ghost = await h.open(c, 'GHOST_SEAT');
      await pastLastDay(wire, person);
      await h.lockAccount(wire.id, LOCK).expect(200);
      await h.revokeRights(wire.id, {}).expect(200);
      await h.open(c, 'DEPARTURE', {
        decision: { decidedRole: 'OFFBOARDING_PROCESS', referenceKind: 'OFFBOARDING_CASE', referenceId: wire.id },
      });
      const tasks = { a: (await h.liveTaskOf(a)) as string, b: (await h.liveTaskOf(b)) as string, c: ghost.taskId };
      await h.claim(tasks.b).expect(200);

      return { person, wire, seats, tasks, machines: { first, second, credential, colleague, kept } };
    };

    it('withdraws the reasons of the departure, ends the machines and counts what it did to the tasks (S3, D08, D09)', async () => {
      const { person, wire, seats, tasks, machines } = await prepared();
      expect(await taskOf(tasks.a)).toMatchObject({ status: 'QUEUED' });
      expect(await taskOf(tasks.b)).toMatchObject({ status: 'IN_PROGRESS' });
      expect(await reasonsOf(tasks.c)).toEqual([
        { source: 'DEPARTURE', withdrawn: false },
        { source: 'GHOST_SEAT', withdrawn: false },
      ]);

      const cancelled = await h.cancelCase(wire.id, { reason: 'Ở lại sau ngày cuối' }).expect(200);

      const body = h.dataOf<CaseWire & { revocationsWithdrawn: object }>(cancelled);
      expect(body).toMatchObject({ state: 'CANCELLED' });
      expect(body.revocationsWithdrawn).toEqual({ cancelled: 1, itAdminToClose: 1, continues: 1, alreadyDone: 0 });
      // The task that waited is cancelled as no longer applying; the seat stays as it was.
      expect(await taskOf(tasks.a)).toMatchObject({ status: 'CANCELLED', close_reason: 'NO_LONGER_APPLIES' });
      expect((await h.assignmentRow(seats[0])).valid_until).toBeNull();
      // The task in progress is left alone, with the reason of the departure taken back: the IT Admin closes it by what happened.
      expect(await taskOf(tasks.b)).toMatchObject({ status: 'IN_PROGRESS', claimed_by_app_user_id: h.it1.appUserId });
      expect(await reasonsOf(tasks.b)).toEqual([{ source: 'DEPARTURE', withdrawn: true }]);
      // The task another source asks for goes on.
      expect(await taskOf(tasks.c)).toMatchObject({ status: 'QUEUED' });
      expect(await reasonsOf(tasks.c)).toEqual([
        { source: 'DEPARTURE', withdrawn: true },
        { source: 'GHOST_SEAT', withdrawn: false },
      ]);
      expect((await h.auditEventsOf('PROVISIONING_TASK.REASON_WITHDRAWN', tasks.a)).length).toBe(1);
      expect(await h.changeKinds(wire.id)).toEqual(expect.arrayContaining(['REVOCATIONS_WITHDRAWN', 'CANCELLED']));
      // The machines of the person stop being registered to them and their credentials end with the registration.
      expect(await registrationsOf(person.employeeId)).toEqual([
        { id: machines.first, end_cause: 'DEPARTURE_BLOCKED', ended: true },
        { id: machines.second, end_cause: 'DEPARTURE_BLOCKED', ended: true },
      ]);
      expect(await credentialRow(machines.credential)).toEqual({
        revoked: true,
        revocation_cause: 'REGISTRATION_ENDED',
      });
      expect(await registrationsOf(machines.colleague.employeeId)).toEqual([
        { id: machines.kept, end_cause: null, ended: false },
      ]);
      // The IT Admin is told once that a task in progress no longer has a reason.
      const notices = await noticesAbout(wire.id);
      expect(notices).toHaveLength(1);
      expect(notices[0].params).toMatchObject({ caseId: wire.id, employeeId: person.employeeId, taskCount: 1 });
    });

    it('does not bring the machines back when the Super Admin lifts the block with an unlock (D09)', async () => {
      const { person, wire, machines } = await prepared();
      await h.cancelCase(wire.id, { reason: 'Ở lại sau ngày cuối' }).expect(200);
      await login(person).expect(401);

      await unlock(person).expect(200);

      await login(person).expect(200);
      expect((await registrationsOf(person.employeeId)).map((row) => [row.id, row.end_cause, row.ended])).toEqual([
        [machines.first, 'DEPARTURE_BLOCKED', true],
        [machines.second, 'DEPARTURE_BLOCKED', true],
      ]);
      expect(await credentialRow(machines.credential)).toMatchObject({ revoked: true });
    });

    it('asking again is refused as the handover is not under way any more, and nothing more is withdrawn', async () => {
      const { wire, tasks } = await prepared();
      await h.cancelCase(wire.id, { reason: 'Ở lại sau ngày cuối' }).expect(200);

      const again = await h.cancelCase(wire.id, { reason: 'Lần hai' });

      expect([again.status, h.codeOf(again)]).toEqual([409, 'OFFBOARDING_CASE.NOT_HANDING_OVER']);
      expect((await h.auditEventsOf('PROVISIONING_TASK.REASON_WITHDRAWN', tasks.a)).length).toBe(1);
      expect((await noticesAbout(wire.id)).length).toBe(1);
    });
  });

  describe('what a cancellation leaves alone (MF2-C review)', () => {
    /** A person with a seat in a plan of K2, a seat in a plan of K1 and a second seat in a plan of K2, past their last working day. */
    const pastLastDayWithThreeSeats = async () => {
      const code = `E-CL-${(counter += 1)}`;
      const person = await h.worker(des, code);
      const [waiting, runsOn, done] = [
        await h.seatOf(person, { subscriptionId: subscriptions[0] }, code),
        await h.seatOf(person, { subscriptionId: k1 }, code),
        await h.seatOf(person, { subscriptionId: subscriptions[1] }, code),
      ];
      const wire = await h.recordedCase(person);
      await pastLastDay(wire, person);
      await h.lockAccount(wire.id, LOCK).expect(200);
      await h.revokeRights(wire.id, {}).expect(200);

      return { person, wire, seats: { waiting, runsOn, done } };
    };
    const completeTask = async (taskId: string, body: object): Promise<void> => {
      await h.claim(taskId).expect(200);
      await h.revoked(taskId, body).expect(200);
    };

    it('takes nothing back from a task that is completed, and tells those whose access runs on apart (alreadyDone)', async () => {
      const { wire, seats } = await pastLastDayWithThreeSeats();
      const [waiting, runsOn, done] = [
        (await h.liveTaskOf(seats.waiting)) as string,
        (await h.liveTaskOf(seats.runsOn)) as string,
        (await h.liveTaskOf(seats.done)) as string,
      ];
      // A K1 seat whose renewal is cancelled keeps its access to the end of the paid period: its task is completed and the seat is still held.
      await completeTask(runsOn, {
        completion: 'RENEWAL_CANCELLED',
        evidence: 'Đã hủy gia hạn',
        paidThroughOn: h.day(36),
        accessState: 'UNTIL_PAID_END',
      });
      await completeTask(done, { completion: 'ACCOUNT_REMOVED', evidence: 'Đã gỡ khỏi workspace' });

      const cancelled = await h.cancelCase(wire.id, { reason: 'Ở lại sau ngày cuối' }).expect(200);

      expect(h.dataOf<{ revocationsWithdrawn: object }>(cancelled).revocationsWithdrawn).toEqual({
        cancelled: 1,
        itAdminToClose: 0,
        continues: 0,
        alreadyDone: 1,
      });
      for (const completed of [runsOn, done]) {
        expect(await taskOf(completed)).toMatchObject({ status: 'COMPLETED' });
        expect(await reasonsOf(completed)).toEqual([{ source: 'DEPARTURE', withdrawn: false }]);
        expect((await h.auditEventsOf('PROVISIONING_TASK.REASON_WITHDRAWN', completed)).length).toBe(0);
      }
      expect(await taskOf(waiting)).toMatchObject({ status: 'CANCELLED', close_reason: 'NO_LONGER_APPLIES' });
      // Only the withdrawal is written in the log of the case: the completed tasks are not part of it.
      const [line] = (
        await h.ctx.sql.query<{ detail: { count: number } }>(
          `SELECT detail FROM offboarding_case_changes WHERE case_id = $1 AND kind = 'REVOCATIONS_WITHDRAWN'`,
          [wire.id],
        )
      ).rows;
      expect(line.detail.count).toBe(1);
    }, 240_000);

    it('tells an IT Admin who can act, never the person who left, when that person was the IT Admin in charge', async () => {
      const itDepartment = await h.departmentWithUnit('P-CL2');
      const code = `E-CL-${(counter += 1)}`;
      const person = await h.worker(itDepartment, code, ['IT_ADMIN']);
      await h.setItAdminInCharge(itDepartment, person);
      const seat = await h.seatOf(person, { subscriptionId: subscriptions[2] }, code);
      const wire = await h.recordedCase(person);
      await pastLastDay(wire, person);
      await h.lockAccount(wire.id, LOCK).expect(200);
      await h.revokeRights(wire.id, {}).expect(200);
      await h.claim((await h.liveTaskOf(seat)) as string).expect(200);

      const cancelled = await h.cancelCase(wire.id, { reason: 'Ở lại sau ngày cuối' }).expect(200);

      expect(
        h.dataOf<{ revocationsWithdrawn: { itAdminToClose: number } }>(cancelled).revocationsWithdrawn,
      ).toMatchObject({
        itAdminToClose: 1,
      });
      const recipients = (
        await h.ctx.sql.query<{ recipient_employee_id: string }>(
          `SELECT recipient_employee_id FROM in_app_notifications WHERE code = 'DEPARTURE_REVOCATION_IT_CLOSE' AND subject_id = $1`,
          [wire.id],
        )
      ).rows.map((row) => row.recipient_employee_id);
      expect(recipients).toHaveLength(1);
      expect(recipients[0]).not.toBe(person.employeeId);
      expect(recipients).toEqual([h.it1.employeeId]);
    }, 240_000);
  });

  describe('a handover whose last working day is not past', () => {
    it('takes nothing back: the person keeps their machines and no task is touched', async () => {
      const { person } = await leaver();
      const registration = await machineOf(person.employeeId);
      const wire = await h.recordedCase(person);
      const tasks = await h.taskCount();

      const cancelled = await h.cancelCase(wire.id, { reason: 'Ở lại' }).expect(200);

      expect(h.dataOf<{ revocationsWithdrawn: object }>(cancelled).revocationsWithdrawn).toEqual({
        cancelled: 0,
        itAdminToClose: 0,
        continues: 0,
        alreadyDone: 0,
      });
      expect(await registrationsOf(person.employeeId)).toEqual([{ id: registration, end_cause: null, ended: false }]);
      expect(await h.taskCount()).toBe(tasks);
      expect(await h.changeKinds(wire.id)).not.toContain('REVOCATIONS_WITHDRAWN');
      expect(await noticesAbout(wire.id)).toEqual([]);
    });

    it('counts nothing for a block in force when the IT Admin opened no revocation, and still ends the machines', async () => {
      const { person } = await leaver();
      const registration = await machineOf(person.employeeId);
      const wire = await h.recordedCase(person);
      await pastLastDay(wire, person);

      const cancelled = await h.cancelCase(wire.id, { reason: 'Ở lại sau ngày cuối' }).expect(200);

      expect(h.dataOf<{ revocationsWithdrawn: object }>(cancelled).revocationsWithdrawn).toEqual({
        cancelled: 0,
        itAdminToClose: 0,
        continues: 0,
        alreadyDone: 0,
      });
      expect(await registrationsOf(person.employeeId)).toEqual([
        { id: registration, end_cause: 'DEPARTURE_BLOCKED', ended: true },
      ]);
      expect(await h.changeKinds(wire.id)).not.toContain('REVOCATIONS_WITHDRAWN');
    });
  });

  describe('a person who has left (R-41)', () => {
    it('cannot be cancelled: 409, and the tasks and the registrations stay as the departure left them', async () => {
      const { person } = await leaver();
      const registration = await machineOf(person.employeeId);
      const wire = await h.recordedCase(person);
      await h.leaveOnLastDay(wire.id).expect(200);
      await h.lockAccount(wire.id, LOCK).expect(200);
      await h.revokeRights(wire.id, {}).expect(200);
      const tasks = await h.taskCount();

      const refused = await h.cancelCase(wire.id, { reason: 'Quay lại' });

      expect([refused.status, h.codeOf(refused)]).toEqual([409, 'OFFBOARDING_CASE.CASE_LEFT']);
      expect((await h.caseRow(wire.id)).state).toBe('LEFT');
      expect(await h.taskCount()).toBe(tasks);
      expect(await registrationsOf(person.employeeId)).toEqual([
        { id: registration, end_cause: 'EMPLOYEE_LEFT', ended: true },
      ]);
      expect(await h.changeKinds(wire.id)).not.toContain('REVOCATIONS_WITHDRAWN');
    });
  });

  // Last: the Super Admin is blocked from here on, which no case above can have.
  describe('the controlled procedure (no account)', () => {
    it('cancels the departure of the Super Admin after the last working day and withdraws as the OPERATOR, not as an account', async () => {
      const code = (
        await h.ctx.sql.query<{ employee_code: string }>(`SELECT employee_code FROM employees WHERE id = $1`, [
          h.sa.employeeId,
        ])
      ).rows[0].employee_code;
      const seat = await h.seatOf(
        { employeeId: h.sa.employeeId } as Person,
        { subscriptionId: subscriptions[0] },
        code,
      );
      const registration = await machineOf(h.sa.employeeId);
      const recorded = await recordAsSuperAdmin(h.ctx.app, code, 'R-CL-001', {
        mode: 'departure-record',
        lastWorkingDay: h.day(12),
      });
      await pastLastDay({ id: recorded.recordId } as CaseWire, { employeeId: h.sa.employeeId } as Person);
      await h.lockAccount(recorded.recordId, LOCK).expect(200);
      await h.revokeRights(recorded.recordId, {}).expect(200);
      const task = (await h.liveTaskOf(seat)) as string;

      const cancelled = await recordAsSuperAdmin(h.ctx.app, code, 'R-CL-002', {
        mode: 'departure-cancel',
        caseId: recorded.recordId,
        reason: 'The person stays',
      });

      expect(cancelled.outcome).toBe('RECORDED');
      expect((await h.caseRow(recorded.recordId)).state).toBe('CANCELLED');
      expect(await taskOf(task)).toMatchObject({ status: 'CANCELLED', close_reason: 'NO_LONGER_APPLIES' });
      const [withdrawn] = await h.auditEventsOf('PROVISIONING_TASK.REASON_WITHDRAWN', task);
      expect(withdrawn).toMatchObject({ actor_kind: 'OPERATOR', actor_app_user_id: null });
      expect(withdrawn.after).toMatchObject({ ticket: 'R-CL-002', outcome: 'CANCELLED' });
      expect(await registrationsOf(h.sa.employeeId)).toEqual([
        { id: registration, end_cause: 'DEPARTURE_BLOCKED', ended: true },
      ]);
    });
  });
});
