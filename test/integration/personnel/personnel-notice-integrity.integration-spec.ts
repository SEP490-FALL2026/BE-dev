import { NoticeHarness, type NoticeWire } from '../../support/notice-harness';
import type { Department, Person } from '../../support/request-harness';

const h = new NoticeHarness();

/** US-03-10, US-03-11: what the database itself refuses about notices, their verifications and the events that name them. */
describe('what the database refuses about the notices of the heads (integration, real PostgreSQL)', () => {
  let des: Department;
  let h1: Person;
  let sequence = 0;
  const code = (prefix = 'E') => `${prefix}-NI-${(sequence += 1)}`;
  const sqlState = async (sql: string, params: unknown[] = []): Promise<string | null> => {
    try {
      await h.ctx.sql.query(sql, params);

      return null;
    } catch (error) {
      return (error as { code?: string }).code ?? 'unknown';
    }
  };
  const waiting = async (): Promise<{ person: Person; wire: NoticeWire }> => {
    const person = await h.worker(des, code());
    const wire = await h.sentNotice(
      { employeeId: person.employeeId, kind: 'DEPARTURE', proposedOn: h.day(5) },
      h1.account,
    );

    return { person, wire };
  };
  const recorded = async (): Promise<{ person: Person; wire: NoticeWire }> => {
    const made = await waiting();
    await h.recordNotice(made.wire.id, h.recording({ lastWorkingDay: h.day(6) })).expect(201);

    return made;
  };

  beforeAll(async () => {
    await h.start();
    des = { ...(await h.department('I-DES', h.it1.employeeId)), unitId: '' };
    h1 = await h.head(des, 'H1-NI');
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  it('keeps the status whole: a recording names its event and the one who handled it, a rejection its reason', async () => {
    const { wire } = await waiting();
    const update = (set: string) => sqlState(`UPDATE personnel_notices SET ${set} WHERE id = $1`, [wire.id]);

    expect(await update(`status = 'RECORDED', handled_by_app_user_id = gen_random_uuid(), handled_at = now()`)).toBe(
      '23514',
    );
    expect(await update(`status = 'REJECTED', handled_by_app_user_id = gen_random_uuid(), handled_at = now()`)).toBe(
      '23514',
    );
    expect(
      await update(
        `status = 'REJECTED', reject_reason = '  ', handled_by_app_user_id = gen_random_uuid(), handled_at = now()`,
      ),
    ).toBe('23514');
    expect(await update(`reject_reason = 'a reason on a notice that waits'`)).toBe('23514');
    expect(await update(`status = 'WITHDRAWN'`)).toBe('23514');
    expect((await h.noticeRows(wire.employee.id))[0].status).toBe('PENDING_VERIFICATION');
  });

  it('keeps the form of a notice: the code, the note, and a department only for a transfer', async () => {
    const { wire } = await waiting();
    const copy = (over: Record<string, string>) => {
      const row = {
        code: `'BM09-2026-999990'`,
        note: 'NULL',
        target_department_id: 'NULL',
        kind: `'LONG_LEAVE'`,
        ...over,
      };

      return sqlState(
        `INSERT INTO personnel_notices (id, code, organization_id, employee_id, kind, proposed_on, target_department_id, note,
                                        sender_employee_id, sender_department_id, due_on)
         SELECT gen_random_uuid(), ${row.code}, organization_id, employee_id, ${row.kind}::"PersonnelNoticeKind", proposed_on,
                ${row.target_department_id}, ${row.note}, sender_employee_id, sender_department_id, due_on
           FROM personnel_notices WHERE id = $1`,
        [wire.id],
      );
    };

    expect(await copy({ code: `'XX-1'` })).toBe('23514');
    expect(await copy({ code: `'BM09-26-1'` })).toBe('23514');
    expect(await copy({ note: `'${'x'.repeat(501)}'` })).toBe('23514');
    expect(await copy({ note: `'   '` })).toBe('23514');
    expect(await copy({ target_department_id: `sender_department_id` })).toBe('23514');
    expect(await copy({ kind: `'DEPARTMENT_TRANSFER_OUT'` })).toBe('23514');
    expect(await copy({})).toBeNull();
    // The code is unique.
    expect(await copy({})).toBe('23505');
  });

  it('never lets what a notice says change, or a handled notice change again, or a notice be deleted', async () => {
    const { wire } = await recorded();
    const waitingOne = await waiting();

    expect(await sqlState(`UPDATE personnel_notices SET kind = 'LONG_LEAVE' WHERE id = $1`, [waitingOne.wire.id])).toBe(
      '55000',
    );
    expect(await sqlState(`UPDATE personnel_notices SET note = 'changed' WHERE id = $1`, [waitingOne.wire.id])).toBe(
      '55000',
    );
    expect(await sqlState(`UPDATE personnel_notices SET due_on = due_on + 1 WHERE id = $1`, [waitingOne.wire.id])).toBe(
      '55000',
    );
    expect(await sqlState(`UPDATE personnel_notices SET status = 'WITHDRAWN' WHERE id = $1`, [wire.id])).toBe('55000');
    expect(await sqlState(`UPDATE personnel_notices SET overdue_noticed_at = now() WHERE id = $1`, [wire.id])).toBe(
      '55000',
    );
    expect(await sqlState(`DELETE FROM personnel_notices WHERE id = $1`, [wire.id])).toBe('55000');
    expect(await sqlState(`DELETE FROM personnel_notices WHERE id = $1`, [waitingOne.wire.id])).toBe('55000');
  });

  it('writes the verification once and never changes or deletes it, and keeps one for each notice', async () => {
    const { wire } = await recorded();

    expect(
      await sqlState(`UPDATE personnel_notice_verifications SET reference = 'x' WHERE notice_id = $1`, [wire.id]),
    ).toBe('55000');
    expect(await sqlState(`DELETE FROM personnel_notice_verifications WHERE notice_id = $1`, [wire.id])).toBe('55000');
    expect(
      await sqlState(
        `INSERT INTO personnel_notice_verifications (id, notice_id, method, reference, verified_by_app_user_id)
         VALUES (gen_random_uuid(), $1, 'DIRECT_CONTACT', 'second check', gen_random_uuid())`,
        [wire.id],
      ),
    ).toBe('23505');
    expect(
      await sqlState(
        `INSERT INTO personnel_notice_verifications (id, notice_id, method, reference, verified_by_app_user_id)
         SELECT gen_random_uuid(), id, 'DIRECT_CONTACT', '   ', gen_random_uuid() FROM personnel_notices WHERE status = 'PENDING_VERIFICATION' LIMIT 1`,
      ),
    ).toBe('23514');
  });

  it('lets one event carry the notice it came from, and no second event of the same table carry it', async () => {
    const person = await h.worker(des, code());
    const wire = h.dataOf<NoticeWire>(
      await h.sendNotice({ employeeId: person.employeeId, kind: 'LONG_LEAVE', proposedOn: h.day(5) }, h1.account),
    );
    await h.recordNotice(wire.id, h.recording({ startedOn: h.day(-1), approvedReturnOn: h.day(40) })).expect(201);
    const other = await h.worker(des, code());
    await h
      .startLongLeave({
        employeeId: other.employeeId,
        startedOn: h.day(-1),
        approvedReturnOn: h.day(20),
        grounds: h.grounds,
      })
      .expect(201);
    const second = await h.runningLeaveOf(other.employeeId);

    expect(await h.eventsOfNotice(wire.id)).toHaveLength(1);
    expect(await sqlState(`UPDATE employee_leaves SET notice_id = $2 WHERE id = $1`, [second.id, wire.id])).toBe(
      '23505',
    );
    // An event recorded straight from a document names no notice.
    const { rows } = await h.ctx.sql.query<{ notice_id: string | null }>(
      `SELECT notice_id FROM employee_leaves WHERE id = $1`,
      [second.id],
    );
    expect(rows[0].notice_id).toBeNull();
  });

  it('refuses to delete a notice that an event names', async () => {
    const { wire } = await recorded();
    const [origin] = await h.eventsOfNotice(wire.id);

    expect(origin).toMatch(/^case:/);
    expect(await sqlState(`DELETE FROM personnel_notices WHERE id = $1`, [wire.id])).toBe('55000');
  });
});
