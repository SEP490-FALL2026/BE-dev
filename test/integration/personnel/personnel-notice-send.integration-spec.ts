import { addWorkingDays } from '../../../src/core/working-days';
import { ACCOUNT_PASSWORD, loginAs } from '../../support/api-accounts';
import { NoticeHarness, type NoticeWire } from '../../support/notice-harness';
import { PgRelay } from '../../support/pg-relay';
import { handOthersToSecondItAdmin } from '../../support/second-it-admin';
import { QueryCounter, dataStatements } from '../../support/query-count';
import type { Department, Person } from '../../support/request-harness';

const h = new NoticeHarness();

/**
 * US-03-10: a department head sends a notice of a change coming for one of their people, over HTTP, on real PostgreSQL (head H1 of
 * N-DES with E1, head H2 of N-FIN with E9). A notice is information: it never changes the person.
 */
describe('the notices of the department heads (integration, real PostgreSQL)', () => {
  let relay: PgRelay;
  let counter: QueryCounter;
  let des: Department;
  let fin: Department;
  let h1: Person;
  let h2: Person;
  let e9: Person;
  let sequence = 0;
  const code = (prefix = 'E') => `${prefix}-NS-${(sequence += 1)}`;
  const departure = (person: Person, extra: object = {}) => ({
    employeeId: person.employeeId,
    kind: 'DEPARTURE',
    proposedOn: h.day(5),
    note: 'Resignation letter received',
    ...extra,
  });
  /** What a notice must leave alone: the state of the person, their places, their events, and the tasks of the system. */
  const personFacts = async (person: Person) => ({
    state: await h.workState(person.employeeId),
    placements: await h.placements(person.employeeId),
    events: await h.eventCounts(person.employeeId),
    tasks: await h.taskCount(),
  });

  beforeAll(async () => {
    await h.start({
      appDatabaseUrl: async (directUrl) => {
        const url = new URL(directUrl);
        relay = await PgRelay.start(url.hostname, Number(url.port || 5432));
        url.port = String(relay.port);

        return url.toString();
      },
    });
    counter = QueryCounter.on(relay);
    des = { ...(await h.department('N-DES', h.it1.employeeId)), unitId: '' };
    fin = { ...(await h.department('N-FIN')), unitId: '' };
    h1 = await h.head(des, 'H1-NS');
    h2 = await h.head(fin, 'H2-NS');
    e9 = await h.worker(fin, 'E9-NS');
  }, 300000);

  afterAll(async () => {
    await h.stop();
    await relay?.stop();
  });

  it('sends the notice of E1 leaving with the IT Admin in charge and the day to handle it, and changes nothing of E1 (AC-1, AC-2)', async () => {
    const e1 = await h.worker(des, code());
    const before = await personFacts(e1);

    const wire = await h.sentNotice(departure(e1), h1.account);

    expect(wire).toMatchObject({
      status: 'PENDING_VERIFICATION',
      kind: 'DEPARTURE',
      proposedOn: h.day(5),
      note: 'Resignation letter received',
      overdue: false,
      priority: false,
      employee: { id: e1.employeeId },
      sender: { id: h1.employeeId },
      defaultItAdminEmployeeId: h.it1.employeeId,
      dueOn: addWorkingDays(h.today(), 2, new Set()),
      verification: null,
    });
    expect(wire.code).toMatch(new RegExp(`^BM09-${h.today().slice(0, 4)}-\\d{6}$`));
    const [event] = await h.auditEventsOf('PERSONNEL_NOTICE.SENT', wire.id);
    expect(event).toMatchObject({ actor_kind: 'USER', actor_app_user_id: h1.account.appUserId });
    expect(event.after).toMatchObject({ code: wire.code, kind: 'DEPARTURE', defaultItAdmin: h.it1.employeeId });
    expect(await personFacts(e1)).toEqual(before);
  });

  it('numbers the codes one after the other and keeps them apart', async () => {
    const first = await h.sentNotice(departure(await h.worker(des, code())), h1.account);
    const second = await h.sentNotice(departure(await h.worker(des, code())), h1.account);

    expect(Number(second.code.slice(-6))).toBeGreaterThan(Number(first.code.slice(-6)));
    expect(second.code).not.toBe(first.code);
  });

  describe('a day passes without the IT Admin (AC-2)', () => {
    it('tells once and never acts: the notice waits and E1 is as before', async () => {
      const e1 = await h.worker(des, code());
      const wire = await h.sentNotice(departure(e1), h1.account);
      const before = await personFacts(e1);

      await h.noticeOverdueAt(h.day(30));
      await h.noticeOverdueAt(h.day(31));

      const events = await h.auditEventsOf('PERSONNEL_NOTICE.OVERDUE', wire.id);
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ actor_kind: 'SYSTEM' });
      expect(events[0].after).toMatchObject({ code: wire.code, defaultItAdmin: h.it1.employeeId });
      const [row] = await h.noticeRows(e1.employeeId);
      expect(row).toMatchObject({ status: 'PENDING_VERIFICATION', recorded_event_id: null });
      expect(row.overdue_noticed_at).not.toBeNull();
      expect(await personFacts(e1)).toEqual(before);
    });

    it('shows the notice as late in the queue, only once its day has passed', async () => {
      const e1 = await h.worker(des, code());
      const wire = await h.sentNotice(departure(e1), h1.account);

      const queue = h.dataOf<{ items: NoticeWire[] }>(await h.listNotices(`?employeeId=${e1.employeeId}`, h.sa));

      expect(queue.items).toMatchObject([{ id: wire.id, overdue: false }]);
      const late = await h.noticeRows(e1.employeeId);
      await h.ctx.sql.query(`ALTER TABLE personnel_notices DISABLE TRIGGER personnel_notices_no_rewrite`);
      try {
        await h.ctx.sql.query(`UPDATE personnel_notices SET due_on = $2::date WHERE id = $1`, [late[0].id, h.day(-1)]);
      } finally {
        await h.ctx.sql.query(`ALTER TABLE personnel_notices ENABLE TRIGGER personnel_notices_no_rewrite`);
      }
      const overdue = h.dataOf<{ items: NoticeWire[] }>(await h.listNotices('?overdue=true', h.sa));
      expect(overdue.items.map((item) => item.id)).toContain(wire.id);
      expect(overdue.items.every((item) => item.overdue && item.status === 'PENDING_VERIFICATION')).toBe(true);
    });
  });

  describe('who may be told about (AC-3, AC-4)', () => {
    it('refuses H1 a notice about E9 of another department and about H1 themselves, and saves nothing', async () => {
      const before = await h.noticeCount();

      const other = await h.sendNotice(departure(e9), h1.account);
      const self = await h.sendNotice(departure(h1), h1.account);

      expect([other.status, h.codeOf(other)]).toEqual([403, 'PERSONNEL_NOTICE.NOT_DEPARTMENT_HEAD']);
      expect([self.status, h.codeOf(self)]).toEqual([422, 'PERSONNEL_NOTICE.SELF_NOTICE']);
      expect(await h.noticeCount()).toBe(before);
    });

    it('takes a transfer in from the head of the receiving department, and refuses the other kinds for a person outside theirs', async () => {
      const e1 = await h.worker(des, code());

      const transfer = await h.sendNotice(
        { employeeId: e1.employeeId, kind: 'DEPARTMENT_TRANSFER_IN', proposedOn: h.day(7), targetDepartmentId: fin.id },
        h2.account,
      );
      const leaving = await h.sendNotice(departure(e1), h2.account);
      const title = await h.sendNotice(
        { employeeId: e1.employeeId, kind: 'JOB_TITLE_CHANGE', proposedOn: h.day(7) },
        h2.account,
      );
      // A change of job title is not told any more (QĐ-87e): the body is refused before anyone is asked who sends it.

      expect(transfer.status).toBe(201);
      expect(h.dataOf<NoticeWire>(transfer)).toMatchObject({
        kind: 'DEPARTMENT_TRANSFER_IN',
        targetDepartment: { id: fin.id },
      });
      expect([leaving.status, h.codeOf(leaving)]).toEqual([403, 'PERSONNEL_NOTICE.NOT_DEPARTMENT_HEAD']);
      expect([title.status, h.codeOf(title)]).toEqual([422, 'VALIDATION_ERROR']);
      expect(await h.noticeRows(e1.employeeId)).toHaveLength(1);
    });

    it('refuses a person who does not exist (404) and one who has left (409)', async () => {
      const unknown = await h.sendNotice(
        { employeeId: '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11', kind: 'DEPARTURE', proposedOn: h.day(5) },
        h1.account,
      );
      const gone = await h.worker(des, code());
      await h.recordedCase(gone, { accessBlockMode: 'BLOCK_NOW', lastWorkingDay: h.today() });

      const left = await h.sendNotice(departure(gone), h1.account);

      expect([unknown.status, h.codeOf(unknown)]).toEqual([404, 'PERSONNEL_NOTICE.EMPLOYEE_NOT_FOUND']);
      expect([left.status, h.codeOf(left)]).toEqual([409, 'PERSONNEL_NOTICE.EMPLOYEE_LEFT']);
    });
  });

  describe('one waiting notice for each person and kind (AC-5)', () => {
    it('answers a second notice of leaving with the code of the one that waits, and takes one of long leave', async () => {
      const e1 = await h.worker(des, code());
      const first = await h.sentNotice(departure(e1), h1.account);

      const second = await h.sendNotice(departure(e1, { proposedOn: h.day(8) }), h1.account);
      const leave = await h.sendNotice(
        { employeeId: e1.employeeId, kind: 'LONG_LEAVE', proposedOn: h.day(8) },
        h1.account,
      );

      expect([second.status, h.codeOf(second)]).toEqual([409, 'PERSONNEL_NOTICE.DUPLICATE_PENDING']);
      expect(h.detailsOf(second)).toEqual({ pendingCode: first.code });
      expect(leave.status).toBe(201);
      expect(await h.noticeRows(e1.employeeId)).toHaveLength(2);
    });

    it('is held by the database: a second waiting row of the kind is a unique violation', async () => {
      const e1 = await h.worker(des, code());
      const first = await h.sentNotice(departure(e1), h1.account);

      const insert = h.ctx.sql.query(
        `INSERT INTO personnel_notices (id, code, organization_id, employee_id, kind, proposed_on, sender_employee_id,
                                        sender_department_id, due_on)
         SELECT gen_random_uuid(), 'BM09-2026-999998', organization_id, employee_id, kind, proposed_on, sender_employee_id,
                sender_department_id, due_on
           FROM personnel_notices WHERE id = $1`,
        [first.id],
      );

      await expect(insert).rejects.toMatchObject({
        code: '23505',
        constraint: 'personnel_notices_one_pending_per_employee_kind',
      });
    });

    it('lets a person be told about again once the first notice has been withdrawn', async () => {
      const e1 = await h.worker(des, code());
      const first = await h.sentNotice(departure(e1), h1.account);
      await h.withdrawNotice(first.id, h1.account).expect(200);

      const again = await h.sendNotice(departure(e1), h1.account);

      expect(again.status).toBe(201);
    });
  });

  describe('a sudden departure (AC-6)', () => {
    it('is told with a priority event and changes nothing: E1 is still working and still signs in', async () => {
      const e1 = await h.worker(des, code());
      const before = await personFacts(e1);

      const wire = await h.sentNotice(
        { employeeId: e1.employeeId, kind: 'ABRUPT_DEPARTURE', proposedOn: h.today() },
        h1.account,
      );

      expect(wire).toMatchObject({ kind: 'ABRUPT_DEPARTURE', priority: true, status: 'PENDING_VERIFICATION' });
      const [event] = await h.auditEventsOf('PERSONNEL_NOTICE.ABRUPT_SENT', wire.id);
      expect(event.after).toMatchObject({ code: wire.code, kind: 'ABRUPT_DEPARTURE' });
      expect(await personFacts(e1)).toEqual(before);
      expect(before.state).toBe('ACTIVE/WORKING');
      await expect(loginAs(h.ctx.app, `${e1.account.email}`, ACCOUNT_PASSWORD)).resolves.toEqual(expect.any(String));
      const priority = h.dataOf<{ items: NoticeWire[] }>(await h.listNotices('?priority=true', h.sa));
      expect(priority.items.map((item) => item.id)).toContain(wire.id);
      expect(priority.items.every((item) => item.priority)).toBe(true);
    });
  });

  describe('the form (AC-7)', () => {
    it.each([
      [
        'a transfer out with no department',
        { kind: 'DEPARTMENT_TRANSFER_OUT' },
        422,
        'PERSONNEL_NOTICE.TARGET_DEPARTMENT_REQUIRED',
      ],
      [
        'a department named for a departure',
        { kind: 'DEPARTURE', targetDepartmentId: 'FIN' },
        422,
        'PERSONNEL_NOTICE.TARGET_DEPARTMENT_INVALID',
      ],
      ['a reason for leaving', { reason: 'Better offer' }, 422, 'VALIDATION_ERROR'],
      ['a note over 500 characters', { note: 'x'.repeat(501) }, 422, 'VALIDATION_ERROR'],
    ])('does not send %s', async (_name, extra, status, expected) => {
      const e1 = await h.worker(des, code());
      const body = { ...departure(e1), ...extra } as Record<string, unknown>;
      if (body.targetDepartmentId === 'FIN') body.targetDepartmentId = fin.id;
      const before = await h.noticeCount();

      const response = await h.sendNotice(body, h1.account);

      expect([response.status, h.codeOf(response)]).toEqual([status, expected]);
      expect(await h.noticeCount()).toBe(before);
    });

    it('does not send without the day proposed', async () => {
      const e1 = await h.worker(des, code());
      const response = await h.sendNotice({ employeeId: e1.employeeId, kind: 'DEPARTURE' }, h1.account);

      expect([response.status, h.codeOf(response)]).toEqual([422, 'VALIDATION_ERROR']);
    });
  });

  describe('taking a notice back (AC-8)', () => {
    it('lets the head who sent it withdraw it while it waits, which takes it out of the queue', async () => {
      const e1 = await h.worker(des, code());
      const wire = await h.sentNotice(departure(e1), h1.account);

      const withdrawn = h.dataOf<NoticeWire>(await h.withdrawNotice(wire.id, h1.account).expect(200));

      expect(withdrawn.status).toBe('WITHDRAWN');
      expect(withdrawn.handledAt).not.toBeNull();
      const waiting = h.dataOf<{ items: NoticeWire[] }>(
        await h.listNotices(`?employeeId=${e1.employeeId}&status=PENDING_VERIFICATION`, h.sa),
      );
      expect(waiting.items).toEqual([]);
      expect(await h.auditEventsOf('PERSONNEL_NOTICE.WITHDRAWN', wire.id)).toHaveLength(1);
    });

    it('refuses a second withdrawal (409) and a withdrawal by another head (404)', async () => {
      const e1 = await h.worker(des, code());
      const wire = await h.sentNotice(departure(e1), h1.account);

      const other = await h.withdrawNotice(wire.id, h2.account);
      await h.withdrawNotice(wire.id, h1.account).expect(200);
      const again = await h.withdrawNotice(wire.id, h1.account);

      expect([other.status, h.codeOf(other)]).toEqual([404, 'PERSONNEL_NOTICE.NOT_FOUND']);
      expect([again.status, h.codeOf(again)]).toEqual([409, 'PERSONNEL_NOTICE.NOT_PENDING']);
    });
  });

  describe('who sends and who reads (AC-9, SoD-2)', () => {
    it.each([
      ['an IT Admin who heads no department', () => h.it1],
      ['Finance', () => h.finance],
      ['an employee', () => h.employee],
    ])('refuses %s with 403 and saves nothing', async (_name, who) => {
      const e1 = await h.worker(des, code());
      const before = await h.noticeCount();

      const response = await h.sendNotice(departure(e1), who());

      expect([response.status, h.codeOf(response)]).toEqual([403, 'AUTHORIZATION.FORBIDDEN']);
      expect(await h.noticeCount()).toBe(before);
    });

    it('shows a head only the notices they sent and the Super Admin all of them, the IT Admin only the minimal projection of the departments in their charge (F12)', async () => {
      const own = await h.sentNotice(departure(await h.worker(des, code())), h1.account);
      const others = await h.sentNotice(departure(await h.worker(fin, code())), h2.account);

      const mine = h.dataOf<{ items: NoticeWire[] }>(await h.listNotices('?pageSize=100', h1.account)).items;
      const queue = h.dataOf<{ items: NoticeWire[] }>(await h.listNotices('?pageSize=100', h.sa)).items;
      const foreign = await h.readNotice(others.id, h1.account);
      const own1 = h.dataOf<NoticeWire>(await h.readNotice(own.id, h1.account).expect(200));
      const itView = h.dataOf<NoticeWire>(await h.readNotice(own.id, h.sa).expect(200));

      expect(mine.map((item) => item.id)).toContain(own.id);
      expect(mine.map((item) => item.id)).not.toContain(others.id);
      expect(queue.map((item) => item.id)).toEqual(expect.arrayContaining([own.id, others.id]));
      expect([foreign.status, h.codeOf(foreign)]).toEqual([404, 'PERSONNEL_NOTICE.NOT_FOUND']);
      expect(own1.verification).toBeNull();
      expect(itView.verification).toBeNull();

      // The IT Admin of N-DES reads the notices about people of that department only, and what is outside it does not exist for them.
      // A department nobody usable is in charge of would be theirs too (F12), so the others have a second IT Admin.
      await handOthersToSecondItAdmin(h);
      const inCharge = h.dataOf<{ items: NoticeWire[] }>(await h.listNotices('?pageSize=100', h.it1)).items;
      const outside = await h.readNotice(others.id, h.it1);
      expect(inCharge.map((item) => item.id)).toContain(own.id);
      expect(inCharge.map((item) => item.id)).not.toContain(others.id);
      expect([outside.status, h.codeOf(outside)]).toEqual([404, 'PERSONNEL_NOTICE.NOT_FOUND']);
    });

    it('orders the queue by the day to handle it and filters it', async () => {
      const queue = h.dataOf<{ items: NoticeWire[] }>(await h.listNotices('?pageSize=100', h.sa)).items;
      const ordered = [...queue].sort((a, b) =>
        a.dueOn === b.dueOn ? (a.id < b.id ? -1 : 1) : a.dueOn < b.dueOn ? -1 : 1,
      );
      const byKind = h.dataOf<{ items: NoticeWire[] }>(await h.listNotices('?kind=LONG_LEAVE', h.sa)).items;

      expect(queue.map((item) => item.id)).toEqual(ordered.map((item) => item.id));
      expect(byKind.length).toBeGreaterThan(0);
      expect(byKind.every((item) => item.kind === 'LONG_LEAVE')).toBe(true);
    });
  });

  it('reads a page in a fixed number of statements whatever its size (collection)', async () => {
    const page = (account: Person['account']) => counter.run(() => h.listNotices('?pageSize=100', account));
    const small = await page(h.sa);
    // A head is a MANAGER heading a department today: that one check is a statement of its own, whatever the page size (QĐ-93a).
    const headSmall = await page(h1.account);
    for (let n = 0; n < 6; n += 1) await h.sentNotice(departure(await h.worker(des, code())), h1.account);
    const large = await page(h.sa);
    const headPage = await page(h1.account);

    expect(large.result.status).toBe(200);
    expect(dataStatements(large.statements).length).toBe(dataStatements(small.statements).length);
    expect(dataStatements(headPage.statements).length).toBe(dataStatements(headSmall.statements).length);
    expect(dataStatements(large.statements).join('\n')).not.toMatch(/reject_reason|\bnote\b/);
    const items = h.dataOf<{ items: NoticeWire[] }>(large.result).items;
    expect(items.length).toBeGreaterThanOrEqual(7);
    expect(items[0]).not.toHaveProperty('note');
  });
});
