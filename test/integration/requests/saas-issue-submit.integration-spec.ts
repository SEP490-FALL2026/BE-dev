import { randomUUID } from 'node:crypto';
import { PgRelay } from '../../support/pg-relay';
import { dataStatements, QueryCounter } from '../../support/query-count';
import type { Person } from '../../support/request-harness';
import { MONDAY, SaasIssueHarness, type IssueWire, type OptionsWire } from '../../support/saas-issue-harness';

const h = new SaasIssueHarness();

/**
 * US-07-10 AC-1 to AC-4, AC-8: a person reports an error in a right that is granted to them, over HTTP on real PostgreSQL. The report
 * is given to exactly one IT Admin, its day to be taken up by is fixed when it is made, only the reporter and an IT Admin read it, and
 * nothing about the right or its grant changes.
 */
describe('reporting an error in a SaaS right (integration, real PostgreSQL)', () => {
  let relay: PgRelay;
  let counter: QueryCounter;
  let figma: { subscriptionId: string };
  let miro: { subscriptionId: string };
  let it1: Person;
  let seq = 0;
  let restoreToday: (() => void) | undefined;

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
    figma = { subscriptionId: await h.subscription(80, 'K2') };
    miro = { subscriptionId: await h.subscription(40, 'K2') };
    it1 = { employeeId: h.it1.employeeId, account: h.it1 };
  }, 300000);

  afterEach(() => {
    restoreToday?.();
    restoreToday = undefined;
  });

  afterAll(async () => {
    await h.stop();
    await relay?.stop();
  });

  /** A member of a new department, IT Admin in charge `it1`, who holds a seat on Figma. */
  const reporter = async (inCharge: Person | null = it1) => {
    seq += 1;

    return h.reporterIn(`P-SI${seq}`, inCharge, figma);
  };

  it('gives the report of E1 to the IT Admin in charge, fixes the day, and lists it for E1 and the IT Admin (AC-1)', async () => {
    restoreToday = h.pretendToday(MONDAY);
    const { member, assignmentId } = await reporter();
    const seatBefore = await h.seatRow(assignmentId);
    const tasksBefore = await h.count('provisioning_tasks');

    const issue = await h.reported(member.account, assignmentId);

    expect(issue).toMatchObject({
      state: 'NEW',
      category: 'NO_ACCESS',
      impact: 'UNUSABLE',
      assignmentId,
      reporter: { employeeId: member.employeeId },
      assignedItAdmin: { employeeId: it1.employeeId },
      assignedByFallback: false,
      responseDueOn: '2026-12-08',
      overdue: false,
      grantTaskId: null,
      resolution: null,
      vendorTicketRef: null,
      reopenCount: 0,
    });
    expect(issue.code).toMatch(/^BM11-\d{4}-\d{6}$/);
    expect(issue.plan.applicationName.length).toBeGreaterThan(0);

    const mine = h.dataOf<{ items: IssueWire[] }>(await h.listIssues(member.account).expect(200)).items;
    expect(mine.map((row) => row.id)).toEqual([issue.id]);
    const assigned = h.dataOf<{ items: IssueWire[] }>(await h.listIssues(h.it1, '?pageSize=100').expect(200)).items;
    expect(assigned.map((row) => row.id)).toContain(issue.id);

    // The audit event names who reported and the right it is about, and does not keep what was written.
    const events = await h.issueEvents('SAAS_ISSUE.SUBMITTED', issue.id);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ actor_kind: 'USER', actor_app_user_id: member.account.appUserId });
    expect(events[0].after).toMatchObject({
      code: issue.code,
      reporterEmployeeId: member.employeeId,
      assignmentId,
      assignedItAdminEmployeeId: it1.employeeId,
      responseDueOn: '2026-12-08',
    });
    expect(JSON.stringify(events[0].after)).not.toContain('workspace');
    // Nothing about the right, its grant or any request changed.
    expect(await h.seatRow(assignmentId)).toEqual(seatBefore);
    expect(await h.count('provisioning_tasks')).toBe(tasksBefore);
    expect(await h.entriesOf(issue.id, member.account)).toEqual([]);
  });

  it('reports on an invitation that is not activated as a right whose grant is not finished (AC-2)', async () => {
    const { member, assignmentId } = await reporter();
    const taskId = await h.openGrantTask(assignmentId);

    const options = h.dataOf<OptionsWire>(await h.issueOptions(member.account).expect(200));
    expect(options.items).toEqual([expect.objectContaining({ assignmentId, grantTaskId: taskId })]);

    const issue = await h.reported(member.account, assignmentId, { category: 'INVITATION_OR_ACTIVATION' });

    expect(issue).toMatchObject({
      category: 'INVITATION_OR_ACTIVATION',
      grantTaskId: taskId,
      assignedItAdmin: { employeeId: it1.employeeId },
    });
    expect((await h.issueRow(issue.id)).grant_task_id).toBe(taskId);
  });

  it('offers no way to report on a software that is not granted to the person, and refuses the right of another (AC-3)', async () => {
    const { member: e1, assignmentId: figmaOfE1 } = await reporter();
    const { member: e2, assignmentId: figmaOfE2 } = await reporter();
    const miroOfE2 = await h.seatOf(e2, miro);
    const before = await h.issueCount();

    const options = h.dataOf<OptionsWire>(await h.issueOptions(e1.account).expect(200));
    expect(options.items.map((item) => item.assignmentId)).toEqual([figmaOfE1]);
    expect(options.items.map((item) => item.assignmentId)).not.toContain(miroOfE2);

    for (const assignmentId of [figmaOfE2, miroOfE2, randomUUID()]) {
      const response = await h.submitIssue(h.issueBody(assignmentId), e1.account);
      expect({ status: response.status, code: h.codeOf(response) }).toEqual({
        status: 403,
        code: 'SAAS_ISSUE.ASSIGNMENT_NOT_YOURS',
      });
    }
    expect(await h.issueCount()).toBe(before);
  });

  it('refuses a right that has ended (AC-3)', async () => {
    restoreToday = h.pretendToday(MONDAY);
    const { member, assignmentId } = await reporter();
    await h.ctx.sql.query(`UPDATE license_assignments SET valid_until = '2026-11-01' WHERE id = $1`, [assignmentId]);

    const response = await h.submitIssue(h.issueBody(assignmentId), member.account);

    expect({ status: response.status, code: h.codeOf(response) }).toEqual({
      status: 409,
      code: 'SAAS_ISSUE.ASSIGNMENT_NOT_OPEN',
    });
    const options = h.dataOf<OptionsWire>(await h.issueOptions(member.account).expect(200));
    expect(options.items).toEqual([]);
  });

  it('shows the warning not to write a secret, the kinds and the impacts, and takes a report without a file (AC-4)', async () => {
    const { member, assignmentId } = await reporter();

    const options = h.dataOf<OptionsWire>(await h.issueOptions(member.account).expect(200));

    expect(options.secretWarning.code).toBe('SAAS_ISSUE.NO_SECRETS');
    expect(options.secretWarning.message).toMatch(/password|token|secret/i);
    expect(Object.keys(options.categories)).toEqual([
      'NO_ACCESS',
      'INVITATION_OR_ACTIVATION',
      'MISSING_PLAN_FEATURE',
      'PROVIDER_OUTAGE',
      'OTHER',
    ]);
    expect(Object.keys(options.impacts)).toEqual(['UNUSABLE', 'PARTIAL', 'QUESTION_OR_OTHER']);
    expect(options.descriptionMaxLength).toBe(2000);
    const issue = await h.reported(member.account, assignmentId, { description: 'x'.repeat(2000) });
    expect(issue.description).toHaveLength(2000);
  });

  it('refuses a moment of the error in the future, a blank description and a file nobody can attach', async () => {
    const { member, assignmentId } = await reporter();
    const before = await h.issueCount();

    const future = await h.submitIssue(
      h.issueBody(assignmentId, { occurredAt: new Date(Date.now() + 3_600_000).toISOString() }),
      member.account,
    );
    expect({ status: future.status, code: h.codeOf(future) }).toEqual({
      status: 422,
      code: 'SAAS_ISSUE.OCCURRED_IN_FUTURE',
    });
    for (const extra of [{ description: '   ' }, { description: 'x'.repeat(2001) }, { attachment: 'a.png' }]) {
      const response = await h.submitIssue(h.issueBody(assignmentId, extra), member.account);
      expect({ status: response.status, code: h.codeOf(response) }).toEqual({ status: 422, code: 'VALIDATION_ERROR' });
    }
    expect(await h.issueCount()).toBe(before);
  });

  describe('who a report is given to', () => {
    const expectedFallback = async (): Promise<string> =>
      (
        await h.ctx.sql.query<{ id: string }>(
          `SELECT e.id FROM employees e
             JOIN app_users u ON u.employee_id = e.id AND u.status = 'ACTIVE' AND u.activation_state = 'ACTIVATED'
             JOIN role_grants g ON g.app_user_id = u.id AND g.role = 'IT_ADMIN' AND g.revoked_at IS NULL
            ORDER BY e.employee_code LIMIT 1`,
        )
      ).rows[0].id;

    it('gives it to the first IT Admin who can act when the department has none in charge', async () => {
      await h.staff(await h.departmentWithUnit('P-SIX'), 'E-AAA-IT', ['IT_ADMIN']);
      const { member, assignmentId } = await reporter(null);

      const issue = await h.reported(member.account, assignmentId);

      expect(issue.assignedByFallback).toBe(true);
      expect(issue.assignedItAdmin.employeeId).toBe(await expectedFallback());
      expect(issue.assignedItAdmin.employeeCode).toBe('E-AAA-IT');
      expect((await h.issueRow(issue.id)).assigned_by_fallback).toBe(true);
    });

    it('gives it to the first who can act when the one in charge cannot', async () => {
      const retired = await h.staff(await h.departmentWithUnit('P-SIY'), 'E-ZZZ-OLD');
      const { member, assignmentId } = await reporter(retired);

      const issue = await h.reported(member.account, assignmentId);

      expect(issue).toMatchObject({ assignedByFallback: true });
      expect(issue.assignedItAdmin.employeeId).toBe(await expectedFallback());
    });

    it('refuses the report when no IT Admin can act, and writes nothing', async () => {
      const { member, assignmentId } = await reporter(null);
      const grants = (
        await h.ctx.sql.query<{ id: string }>(
          `UPDATE role_grants SET revoked_at = now() WHERE role = 'IT_ADMIN' AND revoked_at IS NULL RETURNING id`,
        )
      ).rows.map((row) => row.id);
      const before = await h.issueCount();
      try {
        const response = await h.submitIssue(h.issueBody(assignmentId), member.account);

        expect({ status: response.status, code: h.codeOf(response) }).toEqual({
          status: 409,
          code: 'SAAS_ISSUE.NO_IT_ADMIN',
        });
        expect(await h.issueCount()).toBe(before);
      } finally {
        await h.ctx.sql.query(`UPDATE role_grants SET revoked_at = NULL WHERE id = ANY($1::uuid[])`, [grants]);
      }
    });
  });

  describe('who reads a report (AC-8)', () => {
    it('shows it to the reporter and an IT Admin, and as if it did not exist to everybody else', async () => {
      const { department, member, assignmentId } = await reporter();
      const head = await h.staff(department, `P-HEAD-${(seq += 1)}`);
      await h.makeHead(department, head);
      const other = await h.staff(department, `P-OTHER-${seq}`);
      const issue = await h.reported(member.account, assignmentId, { description: 'The note says: contact support' });

      for (const account of [member.account, h.it1]) {
        const read = await h.readIssue(issue.id, account).expect(200);
        expect(h.dataOf<IssueWire>(read).description).toBe('The note says: contact support');
        await h.issueEntries(issue.id, account).expect(200);
      }
      for (const account of [head.account, other.account, h.finance]) {
        for (const response of [await h.readIssue(issue.id, account), await h.issueEntries(issue.id, account)]) {
          expect({ status: response.status, code: h.codeOf(response) }).toEqual({
            status: 404,
            code: 'SAAS_ISSUE.NOT_FOUND',
          });
          expect(JSON.stringify(response.body)).not.toContain('contact support');
        }
        const own = h.dataOf<{ items: IssueWire[] }>(await h.listIssues(account).expect(200)).items;
        expect(own.map((row) => row.id)).not.toContain(issue.id);
      }
      const missing = await h.readIssue(randomUUID(), member.account);
      expect({ status: missing.status, code: h.codeOf(missing) }).toEqual({
        status: 404,
        code: 'SAAS_ISSUE.NOT_FOUND',
      });
    });

    it('lists the reports of others only for an IT Admin, who narrows by state, overdue and reporter', async () => {
      const { member, assignmentId } = await reporter();
      const issue = await h.reported(member.account, assignmentId);

      for (const scope of ['assigned', 'all']) {
        const response = await h.listIssues(member.account, `?scope=${scope}`).expect(403);
        expect(h.codeOf(response)).toBe('SAAS_ISSUE.SCOPE_FORBIDDEN');
      }
      const byReporter = h.dataOf<{ items: IssueWire[] }>(
        await h.listIssues(h.it1, `?scope=all&reporterEmployeeId=${member.employeeId}`).expect(200),
      ).items;
      expect(byReporter.map((row) => row.id)).toEqual([issue.id]);
      const resolved = h.dataOf<{ items: IssueWire[] }>(
        await h.listIssues(h.it1, `?scope=all&state=RESOLVED&reporterEmployeeId=${member.employeeId}`).expect(200),
      ).items;
      expect(resolved).toEqual([]);
      const others = h.dataOf<{ items: IssueWire[] }>(
        await h.listIssues(member.account, `?reporterEmployeeId=${randomUUID()}`).expect(200),
      ).items;
      expect(others).toEqual([]);
    });
  });

  describe('how many statements a read takes', () => {
    it('answers a list and the form with the same number of statements whatever the size of the page', async () => {
      const { member, assignmentId } = await reporter();
      await h.reported(member.account, assignmentId);
      const readList = async () => {
        const run = await counter.run(() => h.listIssues(h.it1, '?scope=all&pageSize=100').expect(200));

        return {
          rows: h.dataOf<{ items: IssueWire[] }>(run.result).items,
          statements: dataStatements(run.statements).length,
        };
      };
      const small = await readList();

      for (let index = 0; index < 3; index += 1) {
        const next = await reporter();
        await h.reported(next.member.account, next.assignmentId);
      }
      const large = await readList();

      expect(large.rows.length).toBeGreaterThan(small.rows.length);
      expect(large.statements).toBe(small.statements);
      const ids = large.rows.map((row) => row.id);
      expect(new Set(ids).size).toBe(ids.length);
      // The newest first, and the same order on every read.
      const stamps = large.rows.map((row) => row.createdAt);
      expect(stamps).toEqual([...stamps].sort().reverse());
      expect((await readList()).rows.map((row) => row.id)).toEqual(ids);
    });

    it('answers the exchange of a report with the same number of statements for two sizes', async () => {
      const { member, assignmentId } = await reporter();
      const issue = await h.reported(member.account, assignmentId);
      const read = async () => {
        const run = await counter.run(() => h.issueEntries(issue.id, h.it1, '?pageSize=100').expect(200));

        return {
          rows: h.dataOf<{ items: { id: string }[] }>(run.result).items,
          statements: dataStatements(run.statements).length,
        };
      };
      await h.addIssueMessage(issue.id, { body: 'First' }, member.account).expect(201);
      const small = await read();
      for (let index = 0; index < 4; index += 1) {
        await h.addIssueMessage(issue.id, { body: `More ${index}` }, member.account).expect(201);
      }
      const large = await read();

      expect(large.rows.length).toBeGreaterThan(small.rows.length);
      expect(large.statements).toBe(small.statements);
    });
  });

  describe('the code of a report is numbered again every year (F48, spec K)', () => {
    /** Reports one more right on `day` (a day of its own year, so no other test of the suite shares the counter). */
    const reportedOn = async (day: string) => {
      restoreToday?.();
      restoreToday = h.pretendToday(day);
      const { member, assignmentId } = await reporter();

      return h.reported(member.account, assignmentId);
    };
    const counterOf = async (year: number): Promise<number | null> =>
      (
        await h.ctx.sql.query<{ last_value: number }>(`SELECT last_value FROM saas_issue_counters WHERE year = $1`, [
          year,
        ])
      ).rows[0]?.last_value ?? null;
    const sequence = async (): Promise<number> =>
      Number(
        (
          await h.ctx.sql.query<{ n: string }>(
            `SELECT (CASE WHEN is_called THEN last_value ELSE last_value - 1 END)::text AS n FROM saas_issue_seq`,
          )
        ).rows[0].n,
      );

    it('starts at 1 in a new year and keeps the counter of each year apart', async () => {
      const first = await reportedOn('2027-02-01');
      const second = await reportedOn('2027-02-02');
      const next = await reportedOn('2028-02-01');

      expect([first.code, second.code]).toEqual(['BM11-2027-000001', 'BM11-2027-000002']);
      expect(next.code).toBe('BM11-2028-000001');
      expect([await counterOf(2027), await counterOf(2028)]).toEqual([2, 1]);
    });

    it('never issues again a number that is already in a code of its year, even when the counter does not know it (the compatibility image drew it)', async () => {
      const first = await reportedOn('2029-02-01');
      expect(first.code).toBe('BM11-2029-000001');
      // The image before this one draws its numbers from the old sequence and knows nothing of the counter: the counter is behind the codes.
      await h.ctx.sql.query(`UPDATE saas_issue_counters SET last_value = 0 WHERE year = 2029`);

      const again = await reportedOn('2029-02-02');

      expect(again.code).toBe('BM11-2029-000002');
      expect(await counterOf(2029)).toBe(2);
    });

    it('lifts the old sequence to the number it issued and never lowers it, so the compatibility image never draws a number the counter issued', async () => {
      const issued = await reportedOn('2030-02-01');
      expect(issued.code).toBe('BM11-2030-000001');
      expect(await sequence()).toBeGreaterThanOrEqual(1);

      // A sequence that is already far ahead stays where it is when a small number is issued.
      await h.ctx.sql.query(`SELECT setval('saas_issue_seq', 5000, true)`);
      const later = await reportedOn('2030-02-02');

      expect(later.code).toBe('BM11-2030-000002');
      expect(await sequence()).toBe(5000);
      // And a counter that gets ahead of the sequence lifts it: the next draw of the old image is above every issued number.
      await h.ctx.sql.query(`SELECT setval('saas_issue_seq', 1, false)`);
      await h.ctx.sql.query(`UPDATE saas_issue_counters SET last_value = 41 WHERE year = 2030`);
      const lifted = await reportedOn('2030-02-03');

      expect(lifted.code).toBe('BM11-2030-000042');
      expect(await sequence()).toBeGreaterThanOrEqual(42);
    });
  });
});
