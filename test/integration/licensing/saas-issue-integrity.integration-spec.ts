import { randomUUID } from 'node:crypto';
import { SaasIssueHarness } from '../../support/saas-issue-harness';

const h = new SaasIssueHarness();

/**
 * What the database itself refuses about the reports of errors in SaaS rights, apart from the code in front of it (23514, 55000): a
 * state without the columns it needs, a duplicate of itself, a closed report that changes, what was reported being rewritten, a
 * report or an entry being deleted or altered.
 */
describe('what the database refuses about SaaS issues (integration, real PostgreSQL)', () => {
  let issueId: string;
  let assignmentId: string;
  let organizationId: string;
  let reporterId: string;
  let itAdminId: string;
  let seq = 0;

  beforeAll(async () => {
    await h.start();
    const target = { subscriptionId: await h.subscription(20, 'K2') };
    const { member, assignmentId: seat } = await h.reporterIn('P-SIN', null, target);
    assignmentId = seat;
    reporterId = member.employeeId;
    itAdminId = h.it1.employeeId;
    organizationId = h.seed.organizationId;
    issueId = (await h.reported(member.account, seat)).id;
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  const sqlState = async (sql: string, params: unknown[] = []): Promise<string | null> => {
    try {
      await h.ctx.sql.query(sql, params);

      return null;
    } catch (error) {
      return (error as { code?: string }).code ?? 'unknown';
    }
  };

  /** Inserts a report with the given columns over a valid base; returns the SQL state of the refusal, or null. */
  const insertIssue = async (columns: Record<string, string | null>): Promise<string | null> => {
    seq += 1;
    const base: Record<string, string | null> = {
      id: randomUUID(),
      code: `BM11-2026-9${String(seq).padStart(5, '0')}`,
      organization_id: organizationId,
      reporter_employee_id: reporterId,
      assignment_id: assignmentId,
      category: 'NO_ACCESS',
      impact: 'UNUSABLE',
      description: 'It does not open',
      occurred_at: '2026-10-20T08:00:00Z',
      assigned_it_admin_employee_id: itAdminId,
      response_due_on: '2026-10-21',
      ...columns,
    };
    const names = Object.keys(base);

    return sqlState(
      `INSERT INTO saas_issues (${names.join(', ')}) VALUES (${names.map((_, index) => `$${index + 1}`).join(', ')})`,
      names.map((name) => base[name]),
    );
  };

  it.each([
    [
      'a resolved report with no result',
      { state: 'RESOLVED', resolved_at: '2026-10-22T08:00:00Z', reopen_until: '2026-10-29' },
    ],
    ['a resolved report with no moment', { state: 'RESOLVED', resolution: 'Done', reopen_until: '2026-10-29' }],
    [
      'a resolved report with no last day to reopen',
      { state: 'RESOLVED', resolution: 'Done', resolved_at: '2026-10-22T08:00:00Z' },
    ],
    ['a duplicate that names no other report', { state: 'DUPLICATE', duplicate_reason: 'Same' }],
    ['a duplicate with no reason', { state: 'DUPLICATE', duplicate_of_id: '%issue%', duplicate_reason: '  ' }],
    ['a closed report with no moment', { state: 'CLOSED', resolution: 'Done', resolved_at: '2026-10-22T08:00:00Z' }],
    ['a blank description', { description: '   ' }],
    ['a description over 2000 characters', { description: 'x'.repeat(2001) }],
    ['a vendor ticket over 100 characters', { vendor_ticket_ref: 'x'.repeat(101) }],
    ['linked work that is not an object', { linked_work: '[1]' }],
    ['a code of another form', { code: 'SI-1' }],
  ])('refuses %s with 23514', async (_name, columns) => {
    const resolved = Object.fromEntries(
      Object.entries(columns).map(([name, value]) => [name, value === '%issue%' ? issueId : value]),
    );

    expect(await insertIssue(resolved)).toBe('23514');
  });

  it('refuses a report that is a duplicate of itself with 23514, and two reports with one code with 23505', async () => {
    const id = randomUUID();
    expect(await insertIssue({ id, state: 'DUPLICATE', duplicate_of_id: id, duplicate_reason: 'Itself' })).toBe(
      '23514',
    );
    const code = (await h.ctx.sql.query<{ code: string }>(`SELECT code FROM saas_issues WHERE id = $1`, [issueId]))
      .rows[0].code;

    expect(await insertIssue({ code })).toBe('23505');
  });

  it('refuses to move a report into a state without the columns of that state (23514)', async () => {
    expect(await sqlState(`UPDATE saas_issues SET state = 'RESOLVED' WHERE id = $1`, [issueId])).toBe('23514');
    expect(
      await sqlState(
        `UPDATE saas_issues SET state = 'DUPLICATE', duplicate_of_id = id, duplicate_reason = 'x' WHERE id = $1`,
        [issueId],
      ),
    ).toBe('23514');
    expect(await sqlState(`UPDATE saas_issues SET state = 'CLOSED' WHERE id = $1`, [issueId])).toBe('23514');
  });

  it('refuses to rewrite what was reported or who it was given to, and to delete a report (55000)', async () => {
    for (const change of [
      `description = 'Something else'`,
      `category = 'OTHER'`,
      `impact = 'PARTIAL'`,
      `reporter_employee_id = '${itAdminId}'`,
      `assigned_it_admin_employee_id = '${reporterId}'`,
      `assigned_by_fallback = NOT assigned_by_fallback`,
      `response_due_on = '2030-01-01'`,
      `occurred_at = now()`,
      `code = 'BM11-2026-999999'`,
    ]) {
      expect({ change, state: await sqlState(`UPDATE saas_issues SET ${change} WHERE id = $1`, [issueId]) }).toEqual({
        change,
        state: '55000',
      });
    }
    expect(await sqlState(`DELETE FROM saas_issues WHERE id = $1`, [issueId])).toBe('55000');
    // What may move still moves.
    expect(await sqlState(`UPDATE saas_issues SET state = 'IN_PROGRESS' WHERE id = $1`, [issueId])).toBeNull();
  });

  it('never changes a report that is closed or a duplicate again (55000)', async () => {
    const closedId = randomUUID();
    expect(
      await insertIssue({
        id: closedId,
        state: 'CLOSED',
        resolution: 'Done',
        resolved_at: '2026-10-22T08:00:00Z',
        reopen_until: '2026-10-29',
        closed_at: '2026-10-30T08:00:00Z',
      }),
    ).toBeNull();
    const duplicateId = randomUUID();
    expect(
      await insertIssue({ id: duplicateId, state: 'DUPLICATE', duplicate_of_id: issueId, duplicate_reason: 'Same' }),
    ).toBeNull();

    for (const id of [closedId, duplicateId]) {
      expect(await sqlState(`UPDATE saas_issues SET state = 'IN_PROGRESS' WHERE id = $1`, [id])).toBe('55000');
      expect(await sqlState(`UPDATE saas_issues SET vendor_ticket_ref = 'X-1' WHERE id = $1`, [id])).toBe('55000');
    }
  });

  it('keeps the exchange as it was written (23514, 55000)', async () => {
    const insert = (columns: string, values: string) =>
      sqlState(`INSERT INTO saas_issue_entries (id, issue_id, ${columns}) VALUES (gen_random_uuid(), $1, ${values})`, [
        issueId,
      ]);
    expect(
      await insert('kind, author_role, author_employee_id, body', `'MESSAGE', 'REPORTER', '${reporterId}', 'Hello'`),
    ).toBeNull();
    // A message needs its text, a transition its target, and the author and the role must agree.
    expect(await insert('kind, author_role, author_employee_id', `'MESSAGE', 'REPORTER', '${reporterId}'`)).toBe(
      '23514',
    );
    expect(
      await insert('kind, author_role, author_employee_id, body', `'MESSAGE', 'REPORTER', '${reporterId}', '  '`),
    ).toBe('23514');
    expect(await insert('kind, author_role, author_employee_id', `'TRANSITION', 'IT_ADMIN', '${itAdminId}'`)).toBe(
      '23514',
    );
    expect(await insert('kind, author_role, body', `'MESSAGE', 'IT_ADMIN', 'No author'`)).toBe('23514');
    expect(
      await insert('kind, author_role, author_employee_id, body', `'MESSAGE', 'SYSTEM', '${itAdminId}', 'Has one'`),
    ).toBe('23514');
    expect(await insert('kind, author_role, to_state', `'TRANSITION', 'SYSTEM', 'CLOSED'`)).toBeNull();

    expect(await sqlState(`UPDATE saas_issue_entries SET body = 'Changed' WHERE issue_id = $1`, [issueId])).toBe(
      '55000',
    );
    expect(await sqlState(`DELETE FROM saas_issue_entries WHERE issue_id = $1`, [issueId])).toBe('55000');
  });
});
