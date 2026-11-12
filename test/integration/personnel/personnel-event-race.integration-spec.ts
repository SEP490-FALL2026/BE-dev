import type request from 'supertest';
import { NoticeHarness } from '../../support/notice-harness';
import type { Department, Person } from '../../support/request-harness';

const h = new NoticeHarness();

type Call = () => PromiseLike<request.Response>;

/**
 * `g0-g6-final-business-baseline-remediation`, Task 5.4 (F46, F37, F48): two events of the personnel context about the same person
 * that meet at the same moment. The employee row is held in another connection (`queuedOnEmployee`), the first call reaches its lock,
 * then the second: released together, the first is recorded and the second gets the answer of its place, with its own code, in both
 * orders, and never a 500 nor two pending events.
 */
describe('events about one person that meet at once (integration, real PostgreSQL)', () => {
  let des: Department;
  let fin: Department;
  let head: Person;
  let sequence = 0;

  beforeAll(async () => {
    await h.start();
    des = await h.departmentWithUnit('R-DES');
    fin = await h.departmentWithUnit('R-FIN');
    head = await h.head(des, 'RACEHEAD');
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  const person = () => h.worker(des, `RACE${(sequence += 1)}`);
  const transferOf =
    (who: Person): Call =>
    () =>
      h.recordTransfer({
        employeeId: who.employeeId,
        toDepartmentId: fin.id,
        effectiveOn: h.day(20),
        grounds: h.grounds,
      });
  const departureOf =
    (who: Person): Call =>
    () =>
      h.recordCase(h.body(who, { lastWorkingDay: h.day(15) }));
  const leaveOf =
    (who: Person): Call =>
    () =>
      h.startLongLeave({
        employeeId: who.employeeId,
        startedOn: h.day(-1),
        approvedReturnOn: h.day(60),
        groundsNote: 'Đơn xin nghỉ dài hạn số DN-07/2026',
      });

  /** Holds the row of the person, lets `first` and then `second` reach the lock, releases it, and gives both answers in that order. */
  const meet = (who: Person, first: Call, second: Call) => h.queuedOnEmployee(who.employeeId, [first, second]);
  /** The status of each answer and, for a refusal, its code; a success has none. */
  const answers = (responses: request.Response[]) =>
    responses.map((response) => [response.status, response.status < 300 ? null : h.codeOf(response)]);
  const pendingEvents = async (who: Person) =>
    (
      await h.ctx.sql.query<{ n: string }>(
        `SELECT (SELECT count(*) FROM department_transfers WHERE employee_id = $1 AND status = 'PENDING')
              + (SELECT count(*) FROM offboarding_cases WHERE employee_id = $1 AND state = 'HANDING_OVER') AS n`,
        [who.employeeId],
      )
    ).rows[0].n;

  it.each([
    ['a transfer and then a departure', 'TRANSFER', 'DEPARTURE', [409, 'OFFBOARDING_CASE.CONCURRENT_CHANGE']],
    ['a departure and then a transfer', 'DEPARTURE', 'TRANSFER', [409, 'DEPARTMENT_TRANSFER.PENDING_EVENT_EXISTS']],
  ] as const)(
    '%s: the first is recorded (201), the second is refused with its own code, and the person keeps one pending event (F46)',
    async (_name, a, b, refused) => {
      const who = await person();
      const call = (kind: 'TRANSFER' | 'DEPARTURE') => (kind === 'TRANSFER' ? transferOf(who) : departureOf(who));

      const responses = await meet(who, call(a), call(b));

      expect(answers(responses)).toEqual([[201, null], refused]);
      expect(await pendingEvents(who)).toBe('1');
    },
  );

  const leaveRows = async (who: Person) =>
    (
      await h.ctx.sql.query<{ status: string; end_kind: string | null }>(
        `SELECT status::text AS status, end_kind::text AS end_kind FROM employee_leaves WHERE employee_id = $1 ORDER BY started_at`,
        [who.employeeId],
      )
    ).rows;

  it('a long leave and then a departure: both are recorded, the departure ends the leave the day it is recorded, and the person is handing over (US-03-03 AC-6)', async () => {
    const who = await person();

    const responses = await meet(who, leaveOf(who), departureOf(who));

    expect(answers(responses)).toEqual([
      [201, null],
      [201, null],
    ]);
    expect(await leaveRows(who)).toEqual([{ status: 'ENDED', end_kind: 'DEPARTURE_STARTED' }]);
    expect(await h.workState(who.employeeId)).toBe('ACTIVE/HANDING_OVER');
    expect(await pendingEvents(who)).toBe('1');
  });

  it('a departure and then a long leave: the leave is refused as the person no longer works, and none is written', async () => {
    const who = await person();

    const responses = await meet(who, departureOf(who), leaveOf(who));

    expect(answers(responses)).toEqual([
      [201, null],
      [409, 'LONG_LEAVE.EMPLOYEE_NOT_WORKING'],
    ]);
    expect(await leaveRows(who)).toEqual([]);
    expect(await h.workState(who.employeeId)).toBe('ACTIVE/HANDING_OVER');
  });

  describe('a departure written from a notice of a head (F37)', () => {
    const departureNoticeOf = (who: Person) =>
      h.sentNotice({ employeeId: who.employeeId, kind: 'DEPARTURE', proposedOn: h.day(5) }, head.account);

    it('the same notice recorded twice at once: the notice is locked first, so one departure is written and the other call finds the notice no longer waiting', async () => {
      const who = await person();
      const notice = await departureNoticeOf(who);
      const record = () =>
        h.recordNotice(notice.id, h.recording({ lastWorkingDay: h.day(12), accessBlockMode: 'WITH_LAST_DAY' }));

      const responses = await meet(who, record, record);

      expect(answers(responses)).toEqual([
        [201, null],
        [409, 'PERSONNEL_NOTICE.NOT_PENDING'],
      ]);
      expect(await h.caseCount(who.employeeId)).toBe(1);
      expect((await h.noticeRows(who.employeeId))[0].status).toBe('RECORDED');
    });

    it('a departure from a notice that meets a transfer from another notice of the same person: 409 CONCURRENT_CHANGE, never a 500, and the departure notice keeps waiting', async () => {
      const who = await person();
      const departure = await departureNoticeOf(who);
      const move = await h.sentNotice(
        {
          employeeId: who.employeeId,
          kind: 'DEPARTMENT_TRANSFER_OUT',
          proposedOn: h.day(5),
          targetDepartmentId: fin.id,
        },
        head.account,
      );

      const responses = await meet(
        who,
        () => h.recordNotice(move.id, h.recording({ effectiveOn: h.day(20) })),
        () =>
          h.recordNotice(departure.id, h.recording({ lastWorkingDay: h.day(15), accessBlockMode: 'WITH_LAST_DAY' })),
      );

      expect(answers(responses)).toEqual([
        [201, null],
        [409, 'OFFBOARDING_CASE.CONCURRENT_CHANGE'],
      ]);
      expect(await h.caseCount(who.employeeId)).toBe(0);
      expect(await pendingEvents(who)).toBe('1');
      const statuses = (await h.noticeRows(who.employeeId)).map((row) => [row.kind, row.status]);
      expect(statuses).toEqual(
        expect.arrayContaining([
          ['DEPARTURE', 'PENDING_VERIFICATION'],
          ['DEPARTMENT_TRANSFER_OUT', 'RECORDED'],
        ]),
      );
    });
  });

  it('two transfers of the same person: the second is refused as a transfer already waiting (PENDING_EVENT_EXISTS)', async () => {
    const who = await person();

    const responses = await meet(who, transferOf(who), transferOf(who));

    expect(answers(responses)).toEqual([
      [201, null],
      [409, 'DEPARTMENT_TRANSFER.PENDING_EVENT_EXISTS'],
    ]);
  });

  it('the number of a notice is drawn from one counter of the year: notices sent at once never share a code (F48)', async () => {
    // The people are made one by one: the server of the test is opened and closed by each call, so calls that overlap are not a proof of anything but this.
    const staff: Person[] = [];
    for (let index = 0; index < 3; index += 1) staff.push(await person());

    const responses = await Promise.all(
      staff.map((who) =>
        h.sendNotice({ employeeId: who.employeeId, kind: 'DEPARTURE', proposedOn: h.day(5) }, head.account),
      ),
    );

    expect(responses.map((response) => response.status)).toEqual([201, 201, 201]);
    const codes = responses.map((response) => h.dataOf<{ code: string }>(response).code);
    expect(new Set(codes).size).toBe(3);
    const { rows } = await h.ctx.sql.query<{ last_value: number }>(
      `SELECT last_value FROM personnel_notice_counters WHERE year = $1`,
      [Number(h.today().slice(0, 4))],
    );
    expect(Math.max(...codes.map((code) => Number(code.slice(-6))))).toBe(rows[0].last_value);
  });

  /**
   * F48 (spec K): the number of a notice (`BM09-<year>-<number>`) is drawn from a counter of its year, which starts at 1 in a new year,
   * never repeats a number already in a code of its year, and lifts the old sequence the compatibility image still draws from, never
   * lowers it. Each case lives in a year of its own, so no other test of the suite shares its counter.
   */
  describe('the code of a notice is numbered again every year (F48)', () => {
    /** A notice sent on `day` in the calendar of the organization; the person is made first, on the real day. */
    const noticeOn = async (day: string) => {
      const who = await person();
      const restore = h.pretendToday(day);
      try {
        return await h.sentNotice({ employeeId: who.employeeId, kind: 'DEPARTURE', proposedOn: day }, head.account);
      } finally {
        restore();
      }
    };
    const counterOf = async (year: number): Promise<number | null> =>
      (
        await h.ctx.sql.query<{ last_value: number }>(
          `SELECT last_value FROM personnel_notice_counters WHERE year = $1`,
          [year],
        )
      ).rows[0]?.last_value ?? null;
    const sequence = async (): Promise<number> =>
      Number(
        (
          await h.ctx.sql.query<{ n: string }>(
            `SELECT (CASE WHEN is_called THEN last_value ELSE last_value - 1 END)::text AS n FROM personnel_notice_seq`,
          )
        ).rows[0].n,
      );

    it('starts at 1 in a new year and keeps the counter of each year apart', async () => {
      const first = await noticeOn('2027-02-01');
      const second = await noticeOn('2027-02-02');
      const next = await noticeOn('2028-02-01');

      expect([first.code, second.code]).toEqual(['BM09-2027-000001', 'BM09-2027-000002']);
      expect(next.code).toBe('BM09-2028-000001');
      expect([await counterOf(2027), await counterOf(2028)]).toEqual([2, 1]);
    });

    it('never issues again a number that is already in a code of its year, even when the counter does not know it (the compatibility image drew it)', async () => {
      const first = await noticeOn('2029-02-01');
      expect(first.code).toBe('BM09-2029-000001');
      // The image before this one draws its numbers from the old sequence and knows nothing of the counter: the counter is behind the codes.
      await h.ctx.sql.query(`UPDATE personnel_notice_counters SET last_value = 0 WHERE year = 2029`);

      const again = await noticeOn('2029-02-02');

      expect(again.code).toBe('BM09-2029-000002');
      expect(await counterOf(2029)).toBe(2);
    });

    it('lifts the old sequence to the number it issued and never lowers it, so the compatibility image never draws a number the counter issued', async () => {
      const issued = await noticeOn('2030-02-01');
      expect(issued.code).toBe('BM09-2030-000001');
      expect(await sequence()).toBeGreaterThanOrEqual(1);

      // A sequence that is already far ahead stays where it is when a small number is issued.
      await h.ctx.sql.query(`SELECT setval('personnel_notice_seq', 5000, true)`);
      const later = await noticeOn('2030-02-02');

      expect(later.code).toBe('BM09-2030-000002');
      expect(await sequence()).toBe(5000);
      // And a counter that gets ahead of the sequence lifts it: the next draw of the old image is above every issued number.
      await h.ctx.sql.query(`SELECT setval('personnel_notice_seq', 1, false)`);
      await h.ctx.sql.query(`UPDATE personnel_notice_counters SET last_value = 41 WHERE year = 2030`);
      const lifted = await noticeOn('2030-02-03');

      expect(lifted.code).toBe('BM09-2030-000042');
      expect(await sequence()).toBeGreaterThanOrEqual(42);
    });
  });
});
