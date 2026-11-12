import { NoticeHarness } from '../../support/notice-harness';
import type { Department, Person } from '../../support/request-harness';
import type { CaseWire } from '../../support/offboarding-harness';

const h = new NoticeHarness();

interface NoticeRow {
  recipient_employee_id: string;
  code: string;
  subject_type: string | null;
  params: Record<string, unknown>;
  event_key: string;
}

/**
 * `g0-g6-final-business-baseline-remediation`, Task 5.2 (F17, spec B "Thông báo bù"): the people concerned are told in the same
 * transaction as the event, with ids, codes and days only. A refused or rolled-back event tells nobody; a person who would be told
 * twice for one thing is told once.
 */
describe('the notices of the personnel context (integration, real PostgreSQL)', () => {
  let des: Department;
  let fin: Department;
  let desHead: Person;
  let finHead: Person;
  let sequence = 0;

  beforeAll(async () => {
    await h.start();
    des = await h.departmentWithUnit('N-DES');
    fin = await h.departmentWithUnit('N-FIN');
    desHead = await h.head(des, 'N-HEAD-D');
    finHead = await h.head(fin, 'N-HEAD-F');
    await h.setItAdminInCharge(des, { employeeId: h.it1.employeeId, account: h.it1 });
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  const worker = () => h.worker(des, `NTF${(sequence += 1)}`);
  const noticesOf = async (code: string, subjectId: string): Promise<NoticeRow[]> =>
    (
      await h.ctx.sql.query<NoticeRow>(
        `SELECT recipient_employee_id, code, subject_type, params, event_key FROM in_app_notifications
          WHERE code = $1 AND subject_id = $2 ORDER BY recipient_employee_id`,
        [code, subjectId],
      )
    ).rows;
  const recipients = (rows: NoticeRow[]) => rows.map((row) => row.recipient_employee_id).sort();
  const totalNotices = async () =>
    Number((await h.ctx.sql.query<{ n: string }>(`SELECT count(*) AS n FROM in_app_notifications`)).rows[0].n);

  describe('an event that was recorded', () => {
    it('tells the person and the heads of both departments of a transfer, once each, with ids and days only', async () => {
      const who = await worker();

      const wire = await h.recorded({
        employeeId: who.employeeId,
        toDepartmentId: fin.id,
        effectiveOn: h.day(20),
        groundsNote: h.groundsNote,
      });

      const rows = await noticesOf('PERSONNEL_EVENT_RECORDED', wire.id);
      expect(recipients(rows)).toEqual([desHead.employeeId, finHead.employeeId, who.employeeId].sort());
      for (const row of rows) {
        expect(row.params).toMatchObject({
          employeeId: who.employeeId,
          eventKind: 'TRANSFER_RECORDED',
          effectiveOn: h.day(20),
        });
        expect(Object.keys(row.params).sort()).toEqual(['departmentId', 'effectiveOn', 'employeeId', 'eventKind']);
      }
      await h.cancelTransfer(wire.id, { reason: 'No longer needed', groundsNote: h.groundsNote }).expect(200);
      expect(recipients(await noticesOf('PERSONNEL_EVENT_RECORDED', wire.id))).toHaveLength(6);
    });

    it('tells nobody when the event is refused: a transfer to the department the person is in writes no notice at all', async () => {
      const who = await worker();
      const before = await totalNotices();

      const response = await h.recordTransfer({
        employeeId: who.employeeId,
        toDepartmentId: des.id,
        effectiveOn: h.day(20),
        groundsNote: h.groundsNote,
      });

      expect([response.status, h.codeOf(response)]).toEqual([422, 'DEPARTMENT_TRANSFER.NO_CHANGE']);
      expect(await totalNotices()).toBe(before);
    });

    it('tells the person and the head of a long leave that starts and of the return', async () => {
      const who = await worker();

      const leave = await h.startLongLeave({
        employeeId: who.employeeId,
        startedOn: h.day(-1),
        approvedReturnOn: h.day(40),
        groundsNote: 'Đơn xin nghỉ dài hạn số DN-05/2026',
      });

      expect(leave.status).toBe(201);
      const id = h.dataOf<{ id: string }>(leave).id;
      expect(recipients(await noticesOf('PERSONNEL_EVENT_RECORDED', id))).toEqual(
        [desHead.employeeId, who.employeeId].sort(),
      );
    });

    it('tells the Super Admin and the IT Admin in charge of an abrupt departure, once each', async () => {
      const who = await worker();

      const wire = h.dataOf<CaseWire>(
        await h.recordCase(h.body(who, { accessBlockMode: 'BLOCK_NOW', lastWorkingDay: h.day(-1) })).expect(201),
      );

      const rows = await noticesOf('ABRUPT_DEPARTURE_RECORDED', wire.id);
      expect(recipients(rows)).toEqual([h.it1.employeeId, h.sa.employeeId].sort());
      expect(new Set(rows.map((row) => row.event_key)).size).toBe(1);
    });
  });

  describe('a notice of a head (BM-09)', () => {
    it('tells the Super Admin it arrived, and again once when it is late, never twice for the same lateness', async () => {
      const who = await worker();

      const notice = await h.sentNotice(
        { employeeId: who.employeeId, kind: 'DEPARTURE', proposedOn: h.day(5) },
        desHead.account,
      );

      expect(recipients(await noticesOf('PERSONNEL_NOTICE_RECEIVED', notice.id))).toEqual([h.sa.employeeId]);
      await h.noticeOverdueAt(h.day(30));
      await h.noticeOverdueAt(h.day(31));
      const late = await noticesOf('PERSONNEL_NOTICE_OVERDUE', notice.id);
      expect(recipients(late)).toEqual([h.sa.employeeId]);
      expect(late[0].params).toEqual({
        noticeId: notice.id,
        employeeId: who.employeeId,
        departmentId: late[0].params.departmentId,
        eventKind: 'DEPARTURE',
      });
    });

    it('tells nobody of a notice that was not sent: a head cannot send one about themselves', async () => {
      const before = await totalNotices();

      const response = await h.sendNotice(
        { employeeId: desHead.employeeId, kind: 'DEPARTURE', proposedOn: h.day(5) },
        desHead.account,
      );

      expect([response.status, h.codeOf(response)]).toEqual([422, 'PERSONNEL_NOTICE.SELF_NOTICE']);
      expect(await totalNotices()).toBe(before);
    });
  });
});
