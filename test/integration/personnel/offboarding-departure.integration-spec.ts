import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { OffboardingBlockerContributions } from '../../../src/modules/personnel/public/personnel.extension-points';
import { OffboardingHarness, type CaseWire, type RightWire } from '../../support/offboarding-harness';
import type { Department, Person } from '../../support/request-harness';

const h = new OffboardingHarness();

/**
 * US-03-04 AC-3, AC-4, AC-5, AC-9, AC-10, AC-16, AC-18, AC-20, AC-21: the person who has left, the lock of the company account, the
 * revocations the IT Admin asks for and the closing of the case, over HTTP, on real PostgreSQL.
 */
describe('the departure of a person, the revocations and the closing (integration, real PostgreSQL)', () => {
  let des: Department;
  let h1: Person;
  let counter = 0;
  const code = (prefix = 'E') => `${prefix}-OD-${(counter += 1)}`;
  let figma: string;
  let canva: string;
  let chatgpt: string;
  const NOTE = 'Xuất dữ liệu trước khi gỡ';

  beforeAll(async () => {
    await h.start();
    des = await h.departmentWithUnit('P-DES');
    h1 = await h.worker(des, 'H1-OD');
    await h.makeHead(des, h1);
    figma = await h.subscription(60, 'K2');
    canva = await h.subscription(60, 'K2');
    chatgpt = await h.subscription(60, 'K2');
    await h.describePlan(chatgpt, true, NOTE);
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  const leaver = async (subscriptions = [figma, canva, chatgpt]) => {
    const employeeCode = code();
    const person = await h.worker(des, employeeCode);
    const seats: string[] = [];
    for (const subscriptionId of subscriptions) seats.push(await h.seatOf(person, { subscriptionId }, employeeCode));

    return { person, seats };
  };

  const me = (person: Person) => request(h.server()).get('/api/v1/me').set(h.as(person.account));
  const rightsOf = async (id: string) =>
    h.dataOf<{ items: RightWire[] }>(await h.rightsOf(id, '?pageSize=100').expect(200)).items;
  const LOCK = { note: 'Đã khóa tài khoản công ty, phiên và token thiết bị' };

  describe('the person has left (AC-3, AC-9, AC-10)', () => {
    it('works until the handover becomes the departure, then every call is refused although nothing is locked', async () => {
      const { person, seats } = await leaver();
      const wire = await h.recordedCase(person);
      await me(person).expect(200);
      const tasks = await h.taskCount();

      const left = h.dataOf<CaseWire>(await h.leaveOnLastDay(wire.id).expect(200));

      expect(left).toMatchObject({
        state: 'LEFT',
        left: { leftOn: h.today() },
        accountLockMissing: true,
        heldRights: 3,
      });
      expect(left.warnings?.accountLockNotRecorded).toBe(true);
      await me(person).expect(401);
      expect(await h.workState(person.employeeId)).toBe('TERMINATED/LEFT');
      expect(await h.employeeLeftOn(person.employeeId)).toBe(h.today());
      expect(await h.taskCount()).toBe(tasks);
      expect((await rightsOf(wire.id)).map((right) => right.assignmentId).sort()).toEqual([...seats].sort());
      const [event] = await h.auditEventsOf('OFFBOARDING_CASE.LEFT', wire.id);
      expect(event.after).toMatchObject({ state: 'LEFT', alert: 'VERY_HIGH' });
      expect((await h.auditEventsOf('OFFBOARDING_CASE.ACCOUNT_LOCK_REMINDER', wire.id)).length).toBe(1);
      expect(await h.changeKinds(wire.id)).toEqual(['RECORDED', 'MARKED_LEFT']);
      const again = await h.leaveOnLastDay(wire.id);
      expect([again.status, h.codeOf(again)]).toEqual([409, 'OFFBOARDING_CASE.CASE_LEFT']);
      // The Super Admin lists the accounts of the people who have left and are not locked.
      const accounts = (query: string) =>
        request(h.server())
          .get(`/api/v1/app-users?pageSize=100&${query}`)
          .set({ Authorization: `Bearer ${h.admin}` })
          .expect(200)
          .then((response) => h.dataOf<{ items: { id: string }[] }>(response).items.map((item) => item.id));
      expect(await accounts('employeeLeft=true&status=ACTIVE')).toContain(person.account.appUserId);
      expect(await accounts('employeeLeft=false')).not.toContain(person.account.appUserId);
    });

    it('does not take the rights away when the last working day is past and nobody has said they left, but the person is refused (QĐ-100q)', async () => {
      const { person } = await leaver();
      const wire = await h.recordedCase(person);
      await h.ctx.sql.query(
        `UPDATE offboarding_cases SET last_working_day = $2::date, departure_effective_on = $3::date WHERE id = $1`,
        [wire.id, h.day(-3), h.day(-2)],
      );
      await h.ctx.sql.query(`UPDATE employee_access_blocks SET blocked_from = $2::date WHERE employee_id = $1`, [
        person.employeeId,
        h.day(-2),
      ]);
      const tasks = await h.taskCount();

      await me(person).expect(401);
      const listed = h.dataOf<{ items: CaseWire[] }>(
        await h.listCases('?state=HANDING_OVER&pastLastDay=true&pageSize=100').expect(200),
      ).items;

      expect(listed.map((row) => [row.id, row.pastLastDay, row.heldRights])).toContainEqual([wire.id, true, 3]);
      expect(await h.taskCount()).toBe(tasks);
      expect((await h.caseRow(wire.id)).state).toBe('HANDING_OVER');
      const body = await h.leaveOnLastDay(wire.id, { departedOn: h.day(-3) });
      expect([body.status, h.codeOf(body)]).toEqual([422, 'VALIDATION_ERROR']);
      const left = h.dataOf<CaseWire>(await h.leaveOnLastDay(wire.id).expect(200));
      // The person left on their last working day, whenever the Super Admin marks it (Q-04 B).
      expect(left.left?.leftOn).toBe(h.day(-3));
      expect(await h.employeeLeftOn(person.employeeId)).toBe(h.day(-3));
    });

    it('ends the review of the tools that waited for the new head: a person who has left is not asked about a tool any more', async () => {
      const { person } = await leaver();
      const wire = await h.recordedCase(person);
      const placement = (await h.placements(person.employeeId))[0];
      await h.ctx.sql.query(
        `INSERT INTO transfer_reviews (id, organization_id, employee_id, placement_id, department_id, effective_on, due_on)
         SELECT gen_random_uuid(), e.organization_id, e.id, p.id, p.department_id, $2::date, $3::date
           FROM employees e JOIN employee_placements p ON p.id = $4 WHERE e.id = $1`,
        [person.employeeId, h.day(-5), h.day(-1), placement.id],
      );

      await h.leaveOnLastDay(wire.id).expect(200);

      const reviews = await h.ctx.sql.query(
        `SELECT status::text AS status FROM transfer_reviews WHERE employee_id = $1`,
        [person.employeeId],
      );
      expect(reviews.rows).toEqual([{ status: 'SUPERSEDED' }]);
    });
  });

  describe('the revocations (AC-4, AC-5, AC-20)', () => {
    it('are made only when the IT Admin asks, the server counts them, the reason is the standard one and the lock of the account comes first or together', async () => {
      const { person, seats } = await leaver();
      const wire = await h.recordedCase(person);
      await h.leaveOnLastDay(wire.id).expect(200);
      const tasks = await h.taskCount();
      const reason = 'DEPARTURE_REVOCATION: Người dùng đã nghỉ việc, thu hồi mọi quyền';

      const notBlocked = await h.revokeRights((await h.recordedCase((await leaver()).person)).id, {
        accountLock: LOCK,
      });
      const withCount = await h.revokeRights(wire.id, { count: 3, accountLock: LOCK });
      const withReason = await h.revokeRights(wire.id, { reason: 'x', accountLock: LOCK });
      const noLock = await h.revokeRights(wire.id, {});
      expect(
        [notBlocked, withCount, withReason, noLock].map((response) => [response.status, h.codeOf(response)]),
      ).toEqual([
        [409, 'OFFBOARDING_CASE.CASE_NOT_BLOCKED'],
        [422, 'VALIDATION_ERROR'],
        [422, 'VALIDATION_ERROR'],
        [409, 'OFFBOARDING_CASE.ACCOUNT_LOCK_NOT_RECORDED'],
      ]);
      expect(await h.taskCount()).toBe(tasks);
      expect((await h.caseRow(wire.id)).account_lock_at).toBeNull();

      const opened = h.dataOf<CaseWire>(
        await h
          .revokeRights(wire.id, { note: 'Người dùng đã nghỉ việc, thu hồi mọi quyền', accountLock: LOCK })
          .expect(200),
      );

      expect(opened.revocations).toEqual({ created: 3, reasonAdded: 0 });
      expect(opened.accountLock).toMatchObject({ note: LOCK.note });
      expect(opened.checklist).toMatchObject({
        accountLock: { state: 'DONE', urgent: false },
        revokeAccess: { state: 'IN_PROGRESS', heldRights: 3, withoutTask: 0 },
        seatsReleased: { opened: 3, released: 0 },
      });
      expect(await h.taskCount()).toBe(tasks + 3);
      const reasons = await h.ctx.sql.query(
        `SELECT r.source::text AS source, r.decided_role, r.reference_kind, r.reference_id, r.note
           FROM provisioning_task_reasons r JOIN provisioning_tasks t ON t.id = r.task_id
          WHERE t.assignment_id = ANY($1::uuid[])`,
        [seats],
      );
      expect(reasons.rows).toHaveLength(3);
      expect(reasons.rows[0]).toEqual({
        source: 'DEPARTURE',
        decided_role: 'OFFBOARDING_PROCESS',
        reference_kind: 'OFFBOARDING_CASE',
        reference_id: wire.id,
        note: reason,
      });
      expect(await h.changeKinds(wire.id)).toEqual([
        'RECORDED',
        'MARKED_LEFT',
        'ACCOUNT_LOCK_RECORDED',
        'REVOCATIONS_OPENED',
      ]);
      const [event] = await h.auditEventsOf('OFFBOARDING_CASE.REVOCATIONS_OPENED', wire.id);
      expect(event.after).toMatchObject({ count: 3, reason, source: 'DEPARTURE' });
      expect(await h.changeKinds(wire.id)).toContain('REVOCATIONS_OPENED');
      expect((await rightsOf(wire.id)).every((right) => right.revocation?.source === 'DEPARTURE')).toBe(true);

      // Asking again finds every right already under way, and the lock of the account is recorded once.
      const second = await h.revokeRights(wire.id, {});
      expect([second.status, h.codeOf(second)]).toEqual([409, 'OFFBOARDING_CASE.NOTHING_TO_REVOKE']);
      const lockAgain = await h.revokeRights(wire.id, { accountLock: LOCK });
      // Nothing is left to take away, which the selection says before it looks at the lock.
      expect([lockAgain.status, h.codeOf(lockAgain)]).toEqual([409, 'OFFBOARDING_CASE.NOTHING_TO_REVOKE']);
      const lockRoute = await h.lockAccount(wire.id, LOCK);
      expect([lockRoute.status, h.codeOf(lockRoute)]).toEqual([409, 'OFFBOARDING_CASE.ALREADY_RECORDED']);
    });

    it('are completed by the IT Admin with no handover step, and then the case closes with its steps done (AC-20, QĐ-62i)', async () => {
      const { person } = await leaver();
      const wire = await h.recordedCase(person);
      await h.leaveOnLastDay(wire.id).expect(200);
      const lockedFirst = h.dataOf<CaseWire>(await h.lockAccount(wire.id, LOCK).expect(200));
      expect(lockedFirst.accountLock).toMatchObject({ note: LOCK.note });
      const blockers = h.ctx.app.get(OffboardingBlockerContributions);
      let waiting = 1;
      blockers.add('SERVICE_ACCOUNTS_WITHOUT_ANSWERER', {
        code: 'SERVICE_ACCOUNTS_WITHOUT_ANSWERER',
        countFor: () => Promise.resolve(waiting),
      });
      await h.revokeRights(wire.id, {}).expect(200);
      const held = await rightsOf(wire.id);
      expect(held).toHaveLength(3);

      const early = await h.closeCase(wire.id);
      expect([early.status, h.codeOf(early)]).toEqual([409, 'OFFBOARDING_CASE.CASE_NOT_CLOSEABLE']);
      expect(h.detailsOf(early).blockers).toEqual(
        expect.arrayContaining(['PERSONAL_RIGHTS_OPEN', 'SERVICE_ACCOUNTS_WITHOUT_ANSWERER']),
      );
      // No tool is held for a handover (QĐ-110g): the IT Admin takes and completes each task at once.
      for (const right of held) {
        const taskId = right.revocation?.taskId ?? '';
        await h.claim(taskId).expect(200);
        await h.revoked(taskId, { completion: 'ACCOUNT_REMOVED', evidence: 'đã xóa tài khoản' }).expect(200);
      }
      const detail = h.dataOf<CaseWire>(await h.readCase(wire.id).expect(200));
      expect(detail).toMatchObject({ heldRights: 0, blockers: { SERVICE_ACCOUNTS_WITHOUT_ANSWERER: 1 } });
      expect(detail.checklist).toMatchObject({
        dataHandover: { state: 'DONE', pendingDuties: 0 },
        revokeAccess: { state: 'DONE' },
        seatsReleased: { state: 'DONE', opened: 3, released: 3 },
      });

      const blocked = await h.closeCase(wire.id);
      expect(h.detailsOf(blocked).blockers).toEqual(['SERVICE_ACCOUNTS_WITHOUT_ANSWERER']);
      waiting = 0;
      const closed = h.dataOf<CaseWire>(await h.closeCase(wire.id).expect(200));

      expect(closed).toMatchObject({ closed: true, blockers: {} });
      expect(closed.closure).not.toBeNull();
      expect(await h.changeKinds(wire.id)).toContain('CLOSED');
      expect((await h.auditEventsOf('OFFBOARDING_CASE.CLOSED', wire.id)).length).toBe(1);
      const twice = await h.closeCase(wire.id);
      expect([twice.status, h.codeOf(twice)]).toEqual([409, 'OFFBOARDING_CASE.CASE_NOT_CLOSEABLE']);
      waiting = 0;
    });

    it('never close a case whose account is not recorded as locked, even with no right left', async () => {
      const person = await h.worker(des, code());
      const wire = await h.recordedCase(person);
      await h.leaveOnLastDay(wire.id).expect(200);

      const response = await h.closeCase(wire.id);

      expect([response.status, h.codeOf(response)]).toEqual([409, 'OFFBOARDING_CASE.CASE_NOT_CLOSEABLE']);
      expect(h.detailsOf(response).blockers).toContain('ACCOUNT_LOCK_NOT_RECORDED');
    });
  });

  describe('the kinds of provisioning (AC-16, AC-21)', () => {
    it('refuses a seat that has no revocation as a whole command, skips it by default and keeps a K1 whose access runs on', async () => {
      const k1 = await h.subscription(60, 'K1');
      const k4 = await h.subscription(60, 'K4');
      const { person, seats } = await leaver([figma, k1]);
      // A K4 seat has no import path yet: it is written the way a request would write it.
      const k4Seat = randomUUID();
      await h.ctx.sql.query(
        `INSERT INTO license_assignments (id, organization_id, kind, source, plan_id, subscription_id, employee_id,
           account_identifier, normalized_account_identifier, valid_from, valid_from_basis, created_by_app_user_id)
         VALUES ($1, $2, 'PERSONAL', 'REQUEST', $3, $4, $5, 'k4@acme.vn', 'k4@acme.vn', '2026-01-05', 'ACTUAL', $6)`,
        [k4Seat, h.seed.organizationId, await h.planOf(k4), k4, person.employeeId, randomUUID()],
      );
      // BR-MF1-09 / QĐ-103d: K4 is revocable now (its key goes back to the store); K3 is the kind left with no revocation.
      await h.ctx.sql.query(`UPDATE plans SET provisioning_type = 'K3', pricing_model = NULL WHERE id = $1`, [
        await h.planOf(k4),
      ]);
      seats.push(k4Seat);
      const wire = await h.recordedCase(person);
      await h.leaveOnLastDay(wire.id).expect(200);
      await h.lockAccount(wire.id, LOCK).expect(200);
      const tasks = await h.taskCount();
      const [k2Seat, k1Seat] = seats;

      const named = await h.revokeRights(wire.id, { assignmentIds: [k2Seat, k4Seat] });
      expect([named.status, h.codeOf(named)]).toEqual([409, 'OFFBOARDING_CASE.REVOCATION_NOT_SUPPORTED']);
      expect(h.detailsOf(named)).toMatchObject({ assignmentId: k4Seat, provisioningType: 'K3' });
      expect(await h.taskCount()).toBe(tasks);

      const rights = await rightsOf(wire.id);
      expect(rights.find((right) => right.assignmentId === k4Seat)).toMatchObject({
        revocable: false,
        provisioningType: 'K3',
      });
      await h.revokeRights(wire.id, {}).expect(200);
      expect(await h.taskCount()).toBe(tasks + 2);
      const after = await rightsOf(wire.id);
      const task = (assignmentId: string) =>
        after.find((right) => right.assignmentId === assignmentId)?.revocation?.taskId ?? '';
      await h.claim(task(k2Seat)).expect(200);
      await h.revoked(task(k2Seat), { completion: 'ACCOUNT_REMOVED', evidence: 'đã xóa' }).expect(200);
      await h.claim(task(k1Seat)).expect(200);
      await h
        .revoked(task(k1Seat), {
          completion: 'RENEWAL_CANCELLED',
          evidence: 'đã hủy gia hạn',
          paidThroughOn: h.day(36),
          accessState: 'UNTIL_PAID_END',
        })
        .expect(200);

      const detail = h.dataOf<CaseWire>(await h.readCase(wire.id).expect(200));
      expect(detail.heldRights).toBe(2);
      expect(detail.blockers).toEqual({ PERSONAL_RIGHTS_OPEN: 1, ACCESS_RUNS_ON: 1 });
      expect((await rightsOf(wire.id)).find((right) => right.assignmentId === k1Seat)?.accessRunsOnUntil).toBe(
        h.day(36),
      );
      const refused = await h.closeCase(wire.id);
      expect(h.detailsOf(refused).blockers).toEqual(['PERSONAL_RIGHTS_OPEN', 'ACCESS_RUNS_ON']);
      // No seat was handed to anyone: the person holds the seats they held, none moved to another employee.
      const owners = await h.ctx.sql.query(
        `SELECT DISTINCT employee_id FROM license_assignments WHERE id = ANY($1::uuid[])`,
        [seats],
      );
      expect(owners.rows).toEqual([{ employee_id: person.employeeId }]);
    });
  });

  describe('a departure nobody planned (AC-18)', () => {
    it('lets every tool go at once, the one that loses data too: no handover is asked (QĐ-110g)', async () => {
      const { person, seats } = await leaver([canva, chatgpt]);
      const wire = await h.recordedCase(person, { accessBlockMode: 'BLOCK_NOW', lastWorkingDay: h.today() });

      const opened = h.dataOf<CaseWire>(await h.revokeRights(wire.id, { accountLock: LOCK }).expect(200));

      expect(opened.revocations).toEqual({ created: 2, reasonAdded: 0 });
      const rights = await rightsOf(wire.id);
      expect(rights.every((right) => right.revocation?.source === 'ABRUPT_DEPARTURE')).toBe(true);
      const task = (assignmentId: string) =>
        rights.find((right) => right.assignmentId === assignmentId)?.revocation?.taskId ?? '';
      await h.claim(task(seats[0])).expect(200);
      await h.revoked(task(seats[0]), { completion: 'ACCOUNT_REMOVED', evidence: 'đã xóa' }).expect(200);
      await h.claim(task(seats[1])).expect(200);
      await h.revoked(task(seats[1]), { completion: 'ACCOUNT_REMOVED', evidence: 'đã xóa' }).expect(200);
      expect(await rightsOf(wire.id)).toEqual([]);
    });
  });
});
