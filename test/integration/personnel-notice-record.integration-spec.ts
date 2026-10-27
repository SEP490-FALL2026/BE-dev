import request from 'supertest';
import type { ApiAccount } from '../support/api-accounts';
import { NoticeHarness, type NoticeWire } from '../support/notice-harness';
import type { Department, Person } from '../support/request-harness';

const h = new NoticeHarness();

/**
 * US-03-11: the IT Admin verifies a notice against an authoritative basis outside it and records the event, or rejects it, over HTTP,
 * on real PostgreSQL (head H1 of R-DES with E1, head H2 of R-FIN; IT1 is in charge of R-DES, A2 is not).
 */
describe('verifying and recording the notices of the heads (integration, real PostgreSQL)', () => {
  let des: Department;
  let fin: Department;
  let h1: Person;
  let a2: Person;
  let h2: Person;
  let sequence = 0;
  const code = (prefix = 'E') => `${prefix}-NR-${(sequence += 1)}`;
  const me = (person: Person) =>
    request(h.server())
      .get('/api/v1/me')
      .set({ Authorization: `Bearer ${person.account.accessToken}` });
  const superAdmin = () => ({ accessToken: h.admin }) as ApiAccount;
  const notice = (person: Person, kind: string, extra: object = {}) =>
    h.sendNotice({ employeeId: person.employeeId, kind, proposedOn: h.day(5), ...extra }, h1.account);
  const read = async (id: string, account: ApiAccount = h.it1) => h.dataOf<NoticeWire>(await h.readNotice(id, account));
  const stillWaiting = async (person: Person) =>
    (await h.noticeRows(person.employeeId)).every((row) => row.status === 'PENDING_VERIFICATION');

  beforeAll(async () => {
    await h.start();
    des = { ...(await h.department('R-DES', h.it1.employeeId)), unitId: '' };
    fin = { ...(await h.department('R-FIN')), unitId: '' };
    h1 = await h.head(des, 'H1-NR');
    a2 = await h.worker(fin, 'A2-NR', ['IT_ADMIN']);
    h2 = await h.head(fin, 'H2-NR');
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  describe('recording the notice of a departure (AC-1)', () => {
    it('records the handover of E1 with the last day of the letter, tied to the notice and to the check, and tells the head and E1', async () => {
      const e1 = await h.worker(des, code());
      const wire = await notice(e1, 'DEPARTURE').then((sent) => h.dataOf<NoticeWire>(sent));

      const recorded = h.dataOf<NoticeWire>(
        await h.recordNotice(wire.id, h.recording({ lastWorkingDay: h.day(6) })).expect(201),
      );

      expect(recorded.handledAt).not.toBeNull();
      expect(recorded).toMatchObject({
        status: 'RECORDED',
        recordedEvent: { kind: 'OFFBOARDING_CASE' },
        verification: { method: 'ATTACHED_DOCUMENT', reference: h.verification.reference },
      });
      const [row] = await h.noticeRows(e1.employeeId);
      expect(row).toMatchObject({
        status: 'RECORDED',
        recorded_event_kind: 'OFFBOARDING_CASE',
        handled_by_app_user_id: h.it1.appUserId,
      });
      const caseId = row.recorded_event_id as string;
      expect(await h.eventsOfNotice(wire.id)).toEqual([`case:${caseId}`]);
      expect(await h.caseRow(caseId)).toMatchObject({ state: 'HANDING_OVER', last_working_day: h.day(6) });
      expect(await h.workState(e1.employeeId)).toBe('ACTIVE/HANDING_OVER');
      expect(await h.verificationRows(wire.id)).toEqual([
        { method: 'ATTACHED_DOCUMENT', reference: h.verification.reference, verified_by_app_user_id: h.it1.appUserId },
      ]);
      const [event] = await h.auditEventsOf('PERSONNEL_NOTICE.RECORDED', wire.id);
      expect(event.after).toMatchObject({
        code: wire.code,
        senderEmployeeId: h1.employeeId,
        event: { kind: 'OFFBOARDING_CASE', id: caseId },
        verification: { method: 'ATTACHED_DOCUMENT', reference: h.verification.reference },
        grounds: h.resignation,
      });
      expect(await h.auditEventsOf('PERSONNEL.EMPLOYEE_INFORMED', caseId)).toHaveLength(1);
      // The head sees how it ended but not how it was checked.
      expect(await read(wire.id, h1.account)).toMatchObject({
        status: 'RECORDED',
        recordedEvent: { id: caseId },
        verification: null,
      });
    });

    it('takes the day of the basis and not the day the head proposed', async () => {
      const e1 = await h.worker(des, code());
      const wire = h.dataOf<NoticeWire>(await notice(e1, 'DEPARTURE', { proposedOn: h.day(5) }));

      await h.recordNotice(wire.id, h.recording({ lastWorkingDay: h.day(12) })).expect(201);

      const [row] = await h.noticeRows(e1.employeeId);
      expect(await h.caseRow(row.recorded_event_id as string)).toMatchObject({ last_working_day: h.day(12) });
    });
  });

  describe('rejecting (AC-2)', () => {
    it('keeps nothing without a reason, then rejects with one, tells the head why and makes no event', async () => {
      const e1 = await h.worker(des, code());
      const wire = h.dataOf<NoticeWire>(await notice(e1, 'DEPARTURE'));

      const none = await h.rejectNotice(wire.id, {});
      const blank = await h.rejectNotice(wire.id, { reason: '   ' });
      expect([none.status, h.codeOf(none)]).toEqual([422, 'VALIDATION_ERROR']);
      expect([blank.status, h.codeOf(blank)]).toEqual([422, 'PERSONNEL_NOTICE.REASON_REQUIRED']);
      expect(await stillWaiting(e1)).toBe(true);

      const rejected = h.dataOf<NoticeWire>(
        await h.rejectNotice(wire.id, { reason: 'The letter names another day' }).expect(200),
      );

      expect(rejected).toMatchObject({ status: 'REJECTED', rejectReason: 'The letter names another day' });
      expect(await h.eventCounts(e1.employeeId)).toEqual({ transfers: 0, leaves: 0, cases: 0 });
      const [event] = await h.auditEventsOf('PERSONNEL_NOTICE.REJECTED', wire.id);
      expect(event.after).toMatchObject({
        reason: 'The letter names another day',
        senderEmployeeId: h1.employeeId,
        code: wire.code,
      });
      expect(await read(wire.id, h1.account)).toMatchObject({
        status: 'REJECTED',
        rejectReason: 'The letter names another day',
      });
    });

    it('cannot reject, record or link a notice the head withdrew or that was handled already (AC-8 of the notice)', async () => {
      const e1 = await h.worker(des, code());
      const wire = h.dataOf<NoticeWire>(await notice(e1, 'DEPARTURE'));
      await h.withdrawNotice(wire.id, h1.account).expect(200);

      const attempts = [
        await h.rejectNotice(wire.id, { reason: 'x' }),
        await h.recordNotice(wire.id, h.recording({ lastWorkingDay: h.day(6) })),
        await h.linkNotice(wire.id, { eventId: wire.id, verification: h.verification }),
      ];

      expect(attempts.map((response) => [response.status, h.codeOf(response)])).toEqual([
        [409, 'PERSONNEL_NOTICE.NOT_PENDING'],
        [409, 'PERSONNEL_NOTICE.NOT_PENDING'],
        [409, 'PERSONNEL_NOTICE.NOT_PENDING'],
      ]);
      expect(await h.eventCounts(e1.employeeId)).toEqual({ transfers: 0, leaves: 0, cases: 0 });
    });
  });

  describe('a document that arrives without a notice (AC-3)', () => {
    it('refuses the transfer with no basis and records the one with a decision number, leaving the queue as it was', async () => {
      const e1 = await h.worker(des, code());
      const queue = async () => h.dataOf<{ items: NoticeWire[] }>(await h.listNotices('?pageSize=100', h.it1)).items;
      const before = {
        notices: await h.noticeCount(),
        verifications: await verificationTotal(),
        queue: (await queue()).length,
      };
      const body = { employeeId: e1.employeeId, toDepartmentId: fin.id, effectiveOn: h.day(3) };

      const refused = await h.recordTransfer(body);
      const recorded = await h.recorded({ ...body, grounds: h.grounds });

      expect([refused.status, h.codeOf(refused)]).toEqual([422, 'DEPARTMENT_TRANSFER.GROUNDS_REQUIRED']);
      expect(recorded.status).toBe('PENDING');
      expect(await h.noticeCount()).toBe(before.notices);
      expect(await verificationTotal()).toBe(before.verifications);
      expect((await queue()).length).toBe(before.queue);
      expect(await h.eventsOfNotice(recorded.id)).toEqual([]);
    });
  });

  describe('a sudden departure (AC-4)', () => {
    it('is recorded as left with the instruction of the person in authority, and the person is refused from then on', async () => {
      const e1 = await h.worker(des, code());
      const wire = h.dataOf<NoticeWire>(await notice(e1, 'ABRUPT_DEPARTURE', { proposedOn: h.today() }));
      await me(e1).expect(200);

      await h.recordNotice(wire.id, h.recording({ lastWorkingDay: h.today() })).expect(201);

      expect(await h.workState(e1.employeeId)).toBe('TERMINATED/LEFT');
      expect(await h.employeeLeftOn(e1.employeeId)).toBe(h.today());
      await me(e1).expect(401);
      const [row] = await h.noticeRows(e1.employeeId);
      expect(row.status).toBe('RECORDED');
      expect(await h.caseRow(row.recorded_event_id as string)).toMatchObject({ state: 'LEFT', abrupt: true });
    });

    it('waits with nothing changed while there is no document, and the Super Admin can still lock the sign-in with a reason', async () => {
      const e1 = await h.worker(des, code());
      const wire = h.dataOf<NoticeWire>(await notice(e1, 'ABRUPT_DEPARTURE', { proposedOn: h.today() }));

      const without = await h.recordNotice(wire.id, {
        verification: h.verification,
        event: { lastWorkingDay: h.today() },
      });
      const locked = await request(h.server())
        .post(`/api/v1/app-users/${e1.account.appUserId}/lock`)
        .set(h.as(superAdmin()))
        .send({ reason: 'Contain the account while the document of the departure is awaited' });

      expect([without.status, h.codeOf(without)]).toEqual([422, 'PERSONNEL_NOTICE.GROUNDS_REQUIRED']);
      expect(await stillWaiting(e1)).toBe(true);
      expect(await h.workState(e1.employeeId)).toBe('ACTIVE/WORKING');
      expect(locked.status).toBe(200);
      expect(await stillWaiting(e1)).toBe(true);
      expect(await h.eventCounts(e1.employeeId)).toEqual({ transfers: 0, leaves: 0, cases: 0 });
    });
  });

  describe('an event that is there already (AC-6)', () => {
    it('refuses to record a second handover, can be rejected for it, or tied to the one that exists without a second case', async () => {
      const e1 = await h.worker(des, code());
      const existing = await h.recordedCase(e1);
      const first = h.dataOf<NoticeWire>(await notice(e1, 'DEPARTURE'));

      const second = await h.recordNotice(first.id, h.recording({ lastWorkingDay: h.day(10) }));

      expect([second.status, h.codeOf(second)]).toEqual([409, 'PERSONNEL_NOTICE.DUPLICATE_EVENT']);
      expect(await stillWaiting(e1)).toBe(true);
      expect((await h.eventCounts(e1.employeeId)).cases).toBe(1);

      const stranger = await h.recordedCase(await h.worker(des, code()));
      const wrong = await h.linkNotice(first.id, { eventId: stranger.id, verification: h.verification });
      expect([wrong.status, h.codeOf(wrong)]).toEqual([409, 'PERSONNEL_NOTICE.NO_MATCHING_EVENT']);

      const linked = h.dataOf<NoticeWire>(
        await h.linkNotice(first.id, { eventId: existing.id, verification: h.verification }).expect(200),
      );

      expect(linked).toMatchObject({
        status: 'RECORDED',
        recordedEvent: { kind: 'OFFBOARDING_CASE', id: existing.id },
        verification: { method: 'ATTACHED_DOCUMENT' },
      });
      expect((await h.eventCounts(e1.employeeId)).cases).toBe(1);
      expect(await h.eventsOfNotice(first.id)).toEqual([]);
      expect(await h.verificationRows(first.id)).toHaveLength(1);
      expect(await h.auditEventsOf('PERSONNEL_NOTICE.LINKED', first.id)).toHaveLength(1);
    });

    it('is rejected with the reason that the event was recorded already', async () => {
      const e1 = await h.worker(des, code());
      await h.recordedCase(e1);
      const wire = h.dataOf<NoticeWire>(await notice(e1, 'DEPARTURE'));

      const rejected = await h.rejectNotice(wire.id, { reason: 'Duplicate of the departure already recorded' });

      expect(rejected.status).toBe(200);
      expect((await h.eventCounts(e1.employeeId)).cases).toBe(1);
    });
  });

  describe('the rules of the event stay where they were (AC-7)', () => {
    it('refuses a day before today with the code of the transfer, keeps the notice waiting, and records from today', async () => {
      const e1 = await h.worker(des, code());
      const wire = h.dataOf<NoticeWire>(
        await notice(e1, 'DEPARTMENT_TRANSFER_OUT', { proposedOn: h.day(-4), targetDepartmentId: fin.id }),
      );

      const past = await h.recordNotice(wire.id, h.recording({ effectiveOn: h.day(-4) }));

      expect([past.status, h.codeOf(past)]).toEqual([422, 'DEPARTMENT_TRANSFER.EFFECTIVE_DATE_IN_PAST']);
      expect(await stillWaiting(e1)).toBe(true);
      expect(await h.eventCounts(e1.employeeId)).toEqual({ transfers: 0, leaves: 0, cases: 0 });

      await h.recordNotice(wire.id, h.recording({ effectiveOn: h.today() })).expect(201);

      const [row] = await h.noticeRows(e1.employeeId);
      expect(row).toMatchObject({ status: 'RECORDED', recorded_event_kind: 'DEPARTMENT_TRANSFER' });
      expect(await h.eventsOfNotice(wire.id)).toEqual([`transfer:${row.recorded_event_id}`]);
      const placements = await h.placements(e1.employeeId);
      expect(placements[placements.length - 1].department_id).toBe(fin.id);
      expect(await h.auditEventsOf('PERSONNEL.EMPLOYEE_INFORMED', row.recorded_event_id as string)).toHaveLength(1);
    });

    it('leaves a notice of a change of title that was sent before to be rejected: it can no longer be recorded as an event, and nothing is written (QĐ-87e)', async () => {
      const e1 = await h.worker(des, code());
      // Sent by a release that still took this kind: the row is history now, and cannot be sent again.
      const sent = await h.ctx.sql.query<{ id: string }>(
        `INSERT INTO personnel_notices (id, code, organization_id, employee_id, kind, proposed_on, sender_employee_id,
                                        sender_department_id, due_on)
         VALUES (gen_random_uuid(), 'BM09-2026-900001', $1, $2, 'JOB_TITLE_CHANGE', $3, $4, $5, $6) RETURNING id`,
        [h.seed.organizationId, e1.employeeId, h.day(5), h1.employeeId, des.id, h.day(8)],
      );
      const id = sent.rows[0].id;

      const asEvent = await h.recordNotice(id, h.recording({ effectiveOn: h.day(4) }));
      const wrong = await h.recordNotice(id, h.recording({ effectiveOn: h.day(4), lastWorkingDay: h.day(6) }));

      expect([asEvent.status, h.codeOf(asEvent)]).toEqual([422, 'DEPARTMENT_TRANSFER.NO_CHANGE']);
      expect([wrong.status, h.codeOf(wrong)]).toEqual([422, 'PERSONNEL_NOTICE.EVENT_INVALID']);
      expect(h.detailsOf(wrong)).toEqual({ missing: [], notAllowed: ['lastWorkingDay'] });
      expect(await h.eventCounts(e1.employeeId)).toEqual({ transfers: 0, leaves: 0, cases: 0 });
      expect(await stillWaiting(e1)).toBe(true);

      await h.rejectNotice(id, { reason: 'Loại BM-09 đã bỏ (QĐ-87e, D-1)' }).expect(200);

      const [row] = await h.noticeRows(e1.employeeId);
      expect(row).toMatchObject({ status: 'REJECTED', reject_reason: 'Loại BM-09 đã bỏ (QĐ-87e, D-1)' });
    });

    it('records a long leave from the notice and puts the person on leave', async () => {
      const e1 = await h.worker(des, code());
      const wire = h.dataOf<NoticeWire>(await notice(e1, 'LONG_LEAVE'));

      const recorded = h.dataOf<NoticeWire>(
        await h.recordNotice(wire.id, h.recording({ startedOn: h.day(-1), approvedReturnOn: h.day(40) })).expect(201),
      );

      expect(recorded.recordedEvent).toMatchObject({ kind: 'LONG_LEAVE' });
      expect(await h.workState(e1.employeeId)).toBe('ACTIVE/ON_LONG_LEAVE');
      const leave = await h.runningLeaveOf(e1.employeeId);
      expect(leave).toMatchObject({ status: 'ACTIVE', approved_return_on: h.day(40) });
      expect(await h.eventsOfNotice(wire.id)).toEqual([`leave:${leave.id}`]);
    });
  });

  describe('who handles a notice (AC-8)', () => {
    it.each([
      ['the head who sent it', () => h1.account],
      ['Finance', () => h.finance],
      ['the Super Admin', () => superAdmin()],
      ['an employee', () => h.employee],
    ])('refuses %s with 403 on all three routes, and the notice keeps waiting', async (_name, who) => {
      const e1 = await h.worker(des, code());
      const wire = h.dataOf<NoticeWire>(await notice(e1, 'DEPARTURE'));

      const attempts = [
        await h.rejectNotice(wire.id, { reason: 'x' }, who()),
        await h.recordNotice(wire.id, h.recording({ lastWorkingDay: h.day(6) }), who()),
        await h.linkNotice(wire.id, { eventId: wire.id, verification: h.verification }, who()),
      ];

      expect(attempts.map((response) => [response.status, h.codeOf(response)])).toEqual([
        [403, 'AUTHORIZATION.FORBIDDEN'],
        [403, 'AUTHORIZATION.FORBIDDEN'],
        [403, 'AUTHORIZATION.FORBIDDEN'],
      ]);
      expect(await stillWaiting(e1)).toBe(true);
    });

    it('lets A2, who is not in charge of R-DES, handle it for the IT Admin in charge, and names both', async () => {
      const e1 = await h.worker(des, code());
      const wire = h.dataOf<NoticeWire>(await notice(e1, 'DEPARTURE'));

      await h.recordNotice(wire.id, h.recording({ lastWorkingDay: h.day(6) }), a2.account).expect(201);

      const [event] = await h.auditEventsOf('PERSONNEL_NOTICE.RECORDED', wire.id);
      expect(event.actor_app_user_id).toBe(a2.account.appUserId);
      expect(event.after).toMatchObject({ handledByEmployeeId: a2.employeeId, defaultItAdmin: h.it1.employeeId });
      expect((await h.noticeRows(e1.employeeId))[0].handled_by_app_user_id).toBe(a2.account.appUserId);
    });
  });

  describe('a notice about an IT Admin (the rule of the events)', () => {
    it('is recorded by another IT Admin and refused to the IT Admin it is about, while another can', async () => {
      const wire = h.dataOf<NoticeWire>(
        await h.sendNotice({ employeeId: a2.employeeId, kind: 'DEPARTURE', proposedOn: h.day(5) }, h2.account),
      );

      const own = await h.recordNotice(wire.id, h.recording({ lastWorkingDay: h.day(6) }), a2.account);

      expect([own.status, h.codeOf(own)]).toEqual([409, 'OFFBOARDING_CASE.SELF_EVENT_NEEDS_ANOTHER_IT_ADMIN']);
      expect(await stillWaiting(a2)).toBe(true);
      await h.recordNotice(wire.id, h.recording({ lastWorkingDay: h.day(6) })).expect(201);
    });
  });

  describe('the basis outside the notice (AC-9)', () => {
    it('refuses the code of a notice, this one or another, and a basis without its issuer, and keeps the notice waiting', async () => {
      const e1 = await h.worker(des, code());
      const wire = h.dataOf<NoticeWire>(await notice(e1, 'DEPARTURE'));
      const other = h.dataOf<NoticeWire>(await notice(await h.worker(des, code()), 'DEPARTURE'));
      const record = (grounds: object | undefined) =>
        h.recordNotice(wire.id, {
          verification: h.verification,
          ...(grounds ? { grounds } : {}),
          event: { lastWorkingDay: h.day(6) },
        });

      const ownCode = await record({ ...h.resignation, reference: wire.code });
      const otherCode = await record({ ...h.resignation, reference: other.code });
      const noIssuer = await record({ type: 'RESIGNATION_LETTER', reference: 'DN-31/2026', issuedOn: '2026-10-20' });
      const none = await record(undefined);

      expect([ownCode.status, h.codeOf(ownCode)]).toEqual([422, 'PERSONNEL_NOTICE.GROUNDS_IS_NOTICE']);
      expect([otherCode.status, h.codeOf(otherCode)]).toEqual([422, 'PERSONNEL_NOTICE.GROUNDS_IS_NOTICE']);
      expect([noIssuer.status, h.codeOf(noIssuer)]).toEqual([422, 'PERSONNEL_NOTICE.GROUNDS_INCOMPLETE']);
      expect(h.detailsOf(noIssuer)).toEqual({ missing: ['issuer'] });
      expect([none.status, h.codeOf(none)]).toEqual([422, 'PERSONNEL_NOTICE.GROUNDS_REQUIRED']);
      expect(await stillWaiting(e1)).toBe(true);
      expect(await h.eventCounts(e1.employeeId)).toEqual({ transfers: 0, leaves: 0, cases: 0 });
    });

    it('requires how it was checked, and records with all four parts of the basis and the check kept in the Audit Trail', async () => {
      const e1 = await h.worker(des, code());
      const wire = h.dataOf<NoticeWire>(await notice(e1, 'DEPARTURE'));

      const unchecked = await h.recordNotice(wire.id, {
        verification: { method: 'DIRECT_CONTACT', reference: '  ' },
        grounds: h.resignation,
        event: { lastWorkingDay: h.day(6) },
      });
      expect([unchecked.status, h.codeOf(unchecked)]).toEqual([422, 'PERSONNEL_NOTICE.VERIFICATION_REQUIRED']);

      await h.recordNotice(wire.id, h.recording({ lastWorkingDay: h.day(6) })).expect(201);

      const [row] = await h.noticeRows(e1.employeeId);
      const stored = await h.caseRow(row.recorded_event_id as string);
      expect(stored).toBeDefined();
      const [event] = await h.auditEventsOf('PERSONNEL_NOTICE.RECORDED', wire.id);
      expect(event.after).toMatchObject({ grounds: h.resignation });
      const [offboarding] = await h.auditEventsOf('OFFBOARDING_CASE.RECORDED', row.recorded_event_id as string);
      expect(offboarding.after).toMatchObject({ grounds: h.resignation });
    });
  });

  async function verificationTotal(): Promise<number> {
    const { rows } = await h.ctx.sql.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM personnel_notice_verifications`,
    );

    return Number(rows[0].n);
  }
});
