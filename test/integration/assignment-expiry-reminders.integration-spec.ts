import { randomUUID } from 'node:crypto';
import { ExpiryHarness } from '../support/expiry-harness';
import { PgRelay } from '../support/pg-relay';
import { dataStatements, QueryCounter } from '../support/query-count';
import type { Person } from '../support/request-harness';

const h = new ExpiryHarness();

/**
 * US-03-05 AC-1, AC-10: the reminder seven days before a right that ends on a day ends, over HTTP and the hourly pass, on real
 * PostgreSQL. The holder, the head of their department and the IT Admin in charge are told once each; a department with no head
 * has no reminder for the head; nothing about the right changes.
 */
describe('the reminders that a right is about to end (integration, real PostgreSQL)', () => {
  let relay: PgRelay;
  let counter: QueryCounter;
  let target: { subscriptionId: string };
  let seq = 0;
  let it1: Person;

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
    target = { subscriptionId: await h.subscription(80, 'K2') };
    it1 = { employeeId: h.it1.employeeId, account: h.it1 };
  }, 300000);

  afterAll(async () => {
    await h.stop();
    await relay?.stop();
  });

  /** A department with a head, an IT Admin in charge and a member whose right ends `endsIn` days from today. */
  const holder = async (endsIn: number | null, options: { head?: boolean; itAdmin?: boolean } = {}) => {
    seq += 1;
    const department = await h.departmentWithUnit(`P-XR${seq}`);
    const member = await h.staff(department, `P-XR${seq}-E`);
    const head = await h.staff(department, `P-XR${seq}-H`);
    if (options.head !== false) await h.makeHead(department, head);
    if (options.itAdmin !== false) await h.setItAdminInCharge(department, it1);
    const assignmentId = await h.seatOf(member, target, endsIn === null ? {} : { expectedEndDate: h.inDays(endsIn) });

    return { department, member, head, assignmentId };
  };

  it('tells the holder, the head and the IT Admin once, with the two choices, and changes nothing about the right (AC-1)', async () => {
    const { department, member, head, assignmentId } = await holder(7);
    const tasksBefore = await h.count('provisioning_tasks');

    expect(await h.noticeDue()).toBeGreaterThanOrEqual(3);

    const rows = await h.reminderRows(assignmentId);
    expect(rows.map((row) => [row.audience, row.recipient_employee_id])).toEqual([
      ['EMPLOYEE', member.employeeId],
      ['HEAD', head.employeeId],
      ['IT_ADMIN', it1.employeeId],
    ]);
    expect(rows.every((row) => row.department_id === department.id && row.expected_end_date === h.inDays(7))).toBe(
      true,
    );
    const events = await h.eventsOf('LICENSE_ASSIGNMENT.EXPIRY_REMINDER', assignmentId);
    expect(events).toHaveLength(3);
    expect(events.every((event) => event.actor_kind === 'SYSTEM')).toBe(true);
    expect(events[0].after).toMatchObject({
      options: ['EXTEND', 'LET_EXPIRE'],
      holderEmployeeId: member.employeeId,
      expectedEndDate: h.inDays(7),
    });
    expect(JSON.stringify(events)).not.toContain('@acme.vn');
    // The right is as it was: still open, still held, and no task was made.
    expect(await h.seatRow(assignmentId)).toMatchObject({ valid_until: null, expected_end_date: h.inDays(7) });
    expect(await h.count('provisioning_tasks')).toBe(tasksBefore);

    // The second pass, and a pass on a later day, add nothing for the same end date.
    expect(await h.noticeDue()).toBe(0);
    expect(await h.noticeDue(new Date(Date.now() + 24 * 3_600_000))).toBe(0);
    expect(await h.reminderRows(assignmentId)).toHaveLength(3);
    expect(await h.eventsOf('LICENSE_ASSIGNMENT.EXPIRY_REMINDER', assignmentId)).toHaveLength(3);
  });

  it('reminds on the end day and on a day that was missed, and not before the seventh day or after the end (AC-1)', async () => {
    const early = await holder(8);
    const caught = await holder(3);
    const today = await holder(0);
    const ended = await holder(-1);

    await h.noticeDue();

    expect(await h.reminderRows(early.assignmentId)).toHaveLength(0);
    expect(await h.reminderRows(caught.assignmentId)).toHaveLength(3);
    expect(await h.reminderRows(today.assignmentId)).toHaveLength(3);
    expect(await h.reminderRows(ended.assignmentId)).toHaveLength(0);
    // The eighth day is reminded when the day comes.
    await h.noticeDue(new Date(Date.now() + 24 * 3_600_000));
    expect(await h.reminderRows(early.assignmentId)).toHaveLength(3);
  });

  it('reminds on an end date that was given afterwards, and never a right that has none (AC-1)', async () => {
    const { assignmentId } = await holder(null);

    await h.noticeDue();
    expect(await h.reminderRows(assignmentId)).toHaveLength(0);

    await h.giveEndDate(assignmentId, h.inDays(2));
    await h.noticeDue();

    expect((await h.reminderRows(assignmentId)).map((row) => row.expected_end_date)).toEqual([
      h.inDays(2),
      h.inDays(2),
      h.inDays(2),
    ]);
  });

  it('writes none for the head of a department that has none and nobody takes the place; the head named later is told next pass (AC-10)', async () => {
    const { department, member, head, assignmentId } = await holder(5, { head: false });

    await h.noticeDue();

    expect((await h.reminderRows(assignmentId)).map((row) => [row.audience, row.recipient_employee_id])).toEqual([
      ['EMPLOYEE', member.employeeId],
      ['IT_ADMIN', it1.employeeId],
    ]);
    await h.makeHead(department, head);
    await h.noticeDue();
    expect((await h.reminderRows(assignmentId)).map((row) => row.audience)).toEqual(['EMPLOYEE', 'HEAD', 'IT_ADMIN']);
    expect(await h.eventsOf('LICENSE_ASSIGNMENT.EXPIRY_REMINDER', assignmentId)).toHaveLength(3);
  });

  it('writes none for an IT Admin when the department has none in charge', async () => {
    const { assignmentId, member, head } = await holder(5, { itAdmin: false });

    await h.noticeDue();

    expect((await h.reminderRows(assignmentId)).map((row) => [row.audience, row.recipient_employee_id])).toEqual([
      ['EMPLOYEE', member.employeeId],
      ['HEAD', head.employeeId],
    ]);
  });

  describe('what each person reads (AC-1, AC-10)', () => {
    it('shows each person only the reminders sent to them, and an IT Admin may read everyone', async () => {
      const { member, head, assignmentId } = await holder(6);
      await h.noticeDue();

      const own = await h.remindersOf(assignmentId, member.account, 'mine');
      expect(own.map((row) => [row.audience, row.recipient.id])).toEqual([['EMPLOYEE', member.employeeId]]);
      expect(own[0]).toMatchObject({ assignmentId, expectedEndDate: h.inDays(6), holder: { id: member.employeeId } });
      expect((await h.remindersOf(assignmentId, head.account, 'mine')).map((row) => row.audience)).toEqual(['HEAD']);
      expect((await h.remindersOf(assignmentId, h.it1, 'mine')).map((row) => row.audience)).toEqual(['IT_ADMIN']);
      expect((await h.remindersOf(assignmentId, h.it1, 'all')).map((row) => row.audience).sort()).toEqual([
        'EMPLOYEE',
        'HEAD',
        'IT_ADMIN',
      ]);
      const filtered = await h.reminders('?scope=all&audience=HEAD&pageSize=100', h.it1).expect(200);
      expect(h.dataOf<{ items: { audience: string }[] }>(filtered).items.every((row) => row.audience === 'HEAD')).toBe(
        true,
      );
    });

    it('refuses scope all to anyone who is not an IT Admin and shows an employee nobody else’s', async () => {
      const { member, head, assignmentId } = await holder(6);
      await h.noticeDue();

      for (const account of [member.account, head.account, h.finance]) {
        const response = await h.reminders('?scope=all', account).expect(403);
        expect(h.codeOf(response)).toBe('ASSIGNMENT_EXPIRY.SCOPE_FORBIDDEN');
      }
      const mine = await h.reminders(`?assignmentId=${assignmentId}`, member.account).expect(200);
      expect(h.dataOf<{ items: { recipient: { id: string } }[] }>(mine).items.map((row) => row.recipient.id)).toEqual([
        member.employeeId,
      ]);
    });

    it('answers a page of a size with the same number of statements as a page of another size', async () => {
      await holder(4);
      await h.noticeDue();
      const read = async () => {
        const run = await counter.run(() => h.reminders('?scope=all&pageSize=100', h.it1).expect(200));

        return {
          rows: h.dataOf<{ items: { id: string }[] }>(run.result).items,
          statements: dataStatements(run.statements).length,
        };
      };
      const small = await read();

      for (let index = 0; index < 3; index += 1) await holder(4);
      await h.noticeDue();
      const large = await read();

      expect(large.rows.length).toBeGreaterThan(small.rows.length);
      expect(large.statements).toBe(small.statements);
      const ids = large.rows.map((row) => row.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  describe('what the database refuses (23505, 55000)', () => {
    const sqlState = async (sql: string, params: unknown[] = []): Promise<string | null> => {
      try {
        await h.ctx.sql.query(sql, params);

        return null;
      } catch (error) {
        return (error as { code?: string }).code ?? 'unknown';
      }
    };

    it('keeps one reminder for a right, an end date and an audience, lets another end date remind again, and never changes or deletes one', async () => {
      const { assignmentId } = await holder(null);
      const organization = (await h.ctx.sql.query<{ id: string }>(`SELECT id FROM organizations LIMIT 1`)).rows[0].id;
      const insert = (end: string, audience = 'HEAD') =>
        sqlState(
          `INSERT INTO assignment_expiry_reminders (id, organization_id, assignment_id, expected_end_date, audience, recipient_employee_id)
           VALUES ($1, $2, $3, $4::date, $5::"ExpiryReminderAudience", $6)`,
          [randomUUID(), organization, assignmentId, end, audience, randomUUID()],
        );

      expect(await insert(h.inDays(5))).toBeNull();
      expect(await insert(h.inDays(5))).toBe('23505');
      expect(await insert(h.inDays(5), 'IT_ADMIN')).toBeNull();
      expect(await insert(h.inDays(9))).toBeNull();
      expect(
        await sqlState(`UPDATE assignment_expiry_reminders SET department_id = $2 WHERE assignment_id = $1`, [
          assignmentId,
          randomUUID(),
        ]),
      ).toBe('55000');
      expect(await sqlState(`DELETE FROM assignment_expiry_reminders WHERE assignment_id = $1`, [assignmentId])).toBe(
        '55000',
      );
    });
  });
});
