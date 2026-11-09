import type { Department, Person } from '../../support/request-harness';
import { ServiceAccountHandoverHarness } from '../../support/service-account-handover-harness';

const h = new ServiceAccountHandoverHarness();

interface InboxRow {
  recipient_employee_id: string;
  subject_id: string;
  params: Record<string, unknown>;
}

/**
 * `a03-license-inbox-alerts` E2–E4 on real PostgreSQL (`US-12-15` lines 12, 13, 38): a handover that waits for its confirmation
 * (`US-03-09` AC-3, AC-6, `US-07-09` AC-17, AC-18), the service accounts of a person who is transferred or leaves (`US-03-08` AC-1,
 * AC-5) and a person who leaves keeping a K1 access to the end of the paid period (`QĐ-77l`). Each alert goes to the person holding
 * the role at that moment, once however many times its pass or call runs, nobody in the place of a missing head, and nothing once the
 * work it is about was confirmed, cancelled or handed on.
 */
describe('the inbox alerts of handovers and of rights that run on (integration, real PostgreSQL)', () => {
  let des: Department;
  let fin: Department;
  let h1: Person;
  let it1: Person;
  let tools: string[];
  let bots: string;
  let seq = 0;
  const code = (prefix = 'E') => `${prefix}-LI-${(seq += 1)}`;
  const LOCK = { note: 'Đã khóa tài khoản công ty, phiên và token thiết bị' };

  beforeAll(async () => {
    await h.start();
    des = await h.departmentWithUnit('P-DES');
    fin = await h.departmentWithUnit('P-FIN');
    h1 = await h.worker(des, 'H1-LI');
    await h.makeHead(des, h1);
    it1 = { employeeId: h.it1.employeeId, account: h.it1 };
    await h.setItAdminInCharge(des, it1);
    tools = [await h.subscription(40, 'K2'), await h.subscription(40, 'K2')];
    bots = await h.subscription(400, 'K2', des.id);
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  const inbox = async (code: string, subjectIds: readonly string[]): Promise<InboxRow[]> =>
    (
      await h.ctx.sql.query<InboxRow>(
        `SELECT recipient_employee_id, subject_id, params FROM in_app_notifications
          WHERE code = $1 AND subject_id = ANY($2::uuid[]) ORDER BY subject_id, recipient_employee_id`,
        [code, [...subjectIds]],
      )
    ).rows;
  const recipients = async (code: string, subjectIds: readonly string[]) =>
    [...new Set((await inbox(code, subjectIds)).map((row) => row.recipient_employee_id))].sort();

  /** A person of the department with a seat in each tool; the handover of a planned departure opened for them. */
  const leaving = async (department: Department, dueOn: string, caseRefId: string | null = null) => {
    const employeeCode = code();
    const person = await h.veteran(department, employeeCode);
    for (const subscriptionId of tools) await h.seatOf(person, { subscriptionId }, employeeCode);
    await h.openDuties({
      leaverEmployeeId: person.employeeId,
      source: 'DEPARTURE',
      caseRefId,
      lastWorkingDay: h.day(10),
      dueOn,
      leaverIsHead: false,
    });
    const duties = (await h.dutyRows()).filter((row) => row.employee_id === person.employeeId).map((row) => row.id);

    return { person, duties };
  };

  describe('a handover that waits for its confirmation (line 12)', () => {
    it('tells the head and the IT Admin in charge when it opens, once, and never the person who leaves', async () => {
      const { person, duties } = await leaving(des, h.day(9));

      expect(duties).toHaveLength(2);
      const due = await inbox('HANDOVER_CONFIRMATION_DUE', duties);
      expect(due).toHaveLength(4);
      expect(await recipients('HANDOVER_CONFIRMATION_DUE', duties)).toEqual([h1.employeeId, it1.employeeId].sort());
      expect(due[0].params).toMatchObject({ employeeId: person.employeeId, role: 'DEPARTMENT_HEAD', dueOn: h.day(9) });
      // Opening again reuses the duties and tells nobody twice.
      await h.openDuties({
        leaverEmployeeId: person.employeeId,
        source: 'DEPARTURE',
        caseRefId: null,
        lastWorkingDay: h.day(10),
        dueOn: h.day(9),
        leaverIsHead: false,
      });
      expect(await inbox('HANDOVER_CONFIRMATION_DUE', duties)).toHaveLength(4);
    });

    it('reminds the head and alerts the IT Admin once when the deadline passes, and again only for a deadline that moved and passed', async () => {
      const caseRefId = '0b1f4e2a-6c3d-4f8e-9a7b-2d5c8e1f3a40';
      const { duties } = await leaving(des, h.day(-1), caseRefId);

      await h.noticeOverdue();
      await h.noticeOverdue();

      expect(await inbox('HANDOVER_CONFIRMATION_OVERDUE', duties)).toHaveLength(4);
      expect(await recipients('HANDOVER_CONFIRMATION_OVERDUE', duties)).toEqual([h1.employeeId, it1.employeeId].sort());
      // The case moves the deadline; when the new one passes too, it is told for it.
      await h.reconcileDuties(caseRefId, h.day(-2));
      await h.noticeOverdue();
      expect(await inbox('HANDOVER_CONFIRMATION_OVERDUE', duties)).toHaveLength(8);
    });

    it('tells nothing of a duty confirmed or cancelled before its deadline passed', async () => {
      const caseRefId = '6e2a9c4d-1b7f-4a3e-8c5d-9f0a2b4c6d81';
      const { duties } = await leaving(des, h.day(-1), caseRefId);
      const [confirmed] = duties;
      await h.confirmDuty(confirmed, { value: 'HANDED_OVER' }, h1.account).expect(201);
      await h.cancelDuties(caseRefId, 'The departure was cancelled');

      await h.noticeOverdue();

      expect(await inbox('HANDOVER_CONFIRMATION_OVERDUE', duties)).toEqual([]);
    });

    it('tells nobody in the place of a head a department lacks, and the head named later is the one reminded (AC-6, AC-18)', async () => {
      const ops = await h.departmentWithUnit(`P-OPS${(seq += 1)}`);
      await h.setItAdminInCharge(ops, it1);
      const { duties } = await leaving(ops, h.day(-1));

      expect(await recipients('HANDOVER_CONFIRMATION_DUE', duties)).toEqual([it1.employeeId]);
      const h4 = await h.worker(ops, code('H4'));
      await h.makeHead(ops, h4);
      await h.noticeOverdue();
      expect(await recipients('HANDOVER_CONFIRMATION_OVERDUE', duties)).toEqual([h4.employeeId, it1.employeeId].sort());
    });
  });

  describe('the service accounts of a person who leaves their place (line 13)', () => {
    const owner = async () => {
      const employeeCode = code();
      const person = await h.worker(des, employeeCode);
      const ci = await h.botOf(person, bots, `ci-bot-${employeeCode}`, employeeCode);
      const release = await h.botOf(person, bots, `release-bot-${employeeCode}`, employeeCode);

      return { person, ci, release };
    };

    it('reminds the IT Admin in charge of the owning department once when the transfer is recorded, naming how many accounts (AC-1)', async () => {
      const { person } = await owner();

      const transfer = await h.recorded({
        employeeId: person.employeeId,
        toDepartmentId: fin.id,
        effectiveOn: h.day(10),
        grounds: h.grounds,
      });

      const due = await inbox('SERVICE_ACCOUNT_RESPONSIBLE_DUE', [person.employeeId]);
      expect(due.map((row) => row.recipient_employee_id)).toEqual([it1.employeeId]);
      expect(due[0].params).toEqual({
        employeeId: person.employeeId,
        fileKind: 'TRANSFER',
        fileId: transfer.id,
        dueOn: h.day(10),
        accountCount: 2,
      });
      expect(JSON.stringify(due)).not.toContain('bot-');
    });

    it('alerts the IT Admin once for each account still without a person after the day, and nothing for one handed on (AC-5)', async () => {
      const { person, ci, release } = await owner();
      const successor = await h.worker(des, code('S'));
      await h.changeResponsibleOf(release, { employeeId: successor.employeeId, effectiveFrom: h.today() }).expect(200);
      const wire = await h.recordedCase(person, { accessBlockMode: 'BLOCK_NOW', lastWorkingDay: h.today() });
      await h.lockAccount(wire.id, LOCK).expect(200);
      const later = new Date(`${h.day(3)}T05:00:00.000Z`);

      await h.sweepOverdue(later);
      await h.sweepOverdue(later);

      const overdue = await inbox('SERVICE_ACCOUNT_RESPONSIBLE_OVERDUE', [ci, release]);
      expect(overdue.map((row) => [row.subject_id, row.recipient_employee_id])).toEqual([[ci, it1.employeeId]]);
      expect(overdue[0].params).toMatchObject({ employeeId: person.employeeId, owningDepartmentId: des.id });
    });

    it('tells nobody when the owning department has no IT Admin in charge', async () => {
      const { person, ci, release } = await owner();
      await h.ctx.sql.query(`UPDATE departments SET it_admin_employee_id = NULL WHERE id = $1`, [des.id]);
      try {
        const wire = await h.recordedCase(person, { accessBlockMode: 'BLOCK_NOW', lastWorkingDay: h.today() });
        await h.lockAccount(wire.id, LOCK).expect(200);
        await h.sweepOverdue(new Date(`${h.day(3)}T05:00:00.000Z`));

        expect(await h.noticeCount(ci)).toBe(1);
        expect(await inbox('SERVICE_ACCOUNT_RESPONSIBLE_OVERDUE', [ci, release])).toEqual([]);
        expect(await inbox('SERVICE_ACCOUNT_RESPONSIBLE_DUE', [person.employeeId])).toEqual([]);
      } finally {
        await h.setItAdminInCharge(des, it1);
      }
    });
  });

  describe('a person who leaves keeps a K1 access to the end of the paid period (line 38, QĐ-77l)', () => {
    const renewal = (extra: object) => ({ completion: 'RENEWAL_CANCELLED', evidence: 'đã hủy gia hạn', ...extra });
    const k1Seat = async (source: string) => {
      const subscriptionId = await h.subscription(1, 'K1', des.id);
      const employeeCode = code('K');
      const person = await h.worker(des, employeeCode);
      const assignmentId = await h.seatOf(person, { subscriptionId }, employeeCode);
      const { taskId } = await h.open(assignmentId, source);
      await h.claim(taskId).expect(200);

      return { person, assignmentId, taskId };
    };

    it('tells the IT Admin in charge once when the renewal is cancelled with the access left to run', async () => {
      const { person, assignmentId, taskId } = await k1Seat('ABRUPT_DEPARTURE');

      await h.revoked(taskId, renewal({ paidThroughOn: h.day(36), accessState: 'UNTIL_PAID_END' })).expect(200);

      const told = await inbox('LEAVER_K1_ACCESS_RUNS_ON', [taskId]);
      expect(told.map((row) => row.recipient_employee_id)).toEqual([it1.employeeId]);
      expect(told[0].params).toMatchObject({
        taskId,
        assignmentId,
        employeeId: person.employeeId,
        accessUntil: h.day(36),
      });
    });

    it('tells nothing when the access was cut, or when nobody leaves', async () => {
      const cut = await k1Seat('ABRUPT_DEPARTURE');
      const kept = await k1Seat('MANAGER_NOT_NEEDED');

      await h
        .revoked(
          cut.taskId,
          renewal({ paidThroughOn: h.day(36), accessState: 'CUT', accessCutOn: h.today(), accessEvidence: 'x' }),
        )
        .expect(200);
      await h.revoked(kept.taskId, renewal({ paidThroughOn: h.day(36), accessState: 'UNTIL_PAID_END' })).expect(200);

      expect(await inbox('LEAVER_K1_ACCESS_RUNS_ON', [cut.taskId, kept.taskId])).toEqual([]);
    });
  });
});
