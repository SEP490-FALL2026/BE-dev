import { randomUUID } from 'node:crypto';
import type { ApiAccount } from '../../support/api-accounts';
import type { Person } from '../../support/request-harness';
import { MONDAY, SaasIssueHarness, type IssueWire } from '../../support/saas-issue-harness';

const h = new SaasIssueHarness();

const WEDNESDAY = '2026-12-09';

/**
 * US-07-11 AC-1 to AC-9 and US-07-10 AC-5 to AC-7: the IT Admin takes a report up, asks, waits for the vendor, resolves it or marks
 * it a duplicate, and the reporter answers and reopens it in time, over HTTP and the hourly pass on real PostgreSQL. Nothing is sent to
 * the vendor and no other work is opened.
 */
describe('handling a report of an error in a SaaS right (integration, real PostgreSQL)', () => {
  let figma: { subscriptionId: string };
  let it1: Person;
  let it2: Person;
  let seq = 0;
  let restoreToday: (() => void) | undefined;

  beforeAll(async () => {
    await h.start();
    figma = { subscriptionId: await h.subscription(80, 'K2') };
    it1 = { employeeId: h.it1.employeeId, account: h.it1 };
    // The second IT Admin works in another department: they are not the one in charge of the people below.
    it2 = await h.staff(await h.departmentWithUnit('P-IT2'), 'E-IT2', ['IT_ADMIN']);
  }, 300000);

  afterEach(() => {
    restoreToday?.();
    restoreToday = undefined;
  });

  afterAll(async () => {
    await h.stop();
  });

  /** A reporter in a department whose IT Admin in charge is IT1, and the report they sent. */
  const fresh = async (extra: Record<string, unknown> = {}) => {
    seq += 1;
    const { department, member, assignmentId } = await h.reporterIn(`P-SH${seq}`, it1, figma);
    const issue = await h.reported(member.account, assignmentId, extra);

    return { department, member, assignmentId, issue };
  };
  const moved = async (id: string, body: object, account: ApiAccount = h.it1): Promise<IssueWire> =>
    h.dataOf<IssueWire>(await h.moveIssue(id, body, account).expect(200));
  const refused = (response: { status: number }, status: number, code: string): void => {
    expect({ status: response.status, code: h.codeOf(response as never) }).toEqual({ status, code });
  };

  it('takes a report from new to resolved, the reporter reads the result, and every step is recorded (US-07-11 AC-1, US-07-10 AC-5)', async () => {
    restoreToday = h.pretendToday(MONDAY);
    const { member, issue } = await fresh();

    const taken = await moved(issue.id, { to: 'IN_PROGRESS' });
    const resolved = await moved(issue.id, { to: 'RESOLVED', resolution: 'The invitation was sent again.' });

    expect(taken.state).toBe('IN_PROGRESS');
    expect(resolved).toMatchObject({
      state: 'RESOLVED',
      resolution: 'The invitation was sent again.',
      reopenUntil: '2026-12-14',
      reopenCount: 0,
    });
    const read = h.dataOf<IssueWire>(await h.readIssue(issue.id, member.account).expect(200));
    expect(read).toMatchObject({ state: 'RESOLVED', resolution: 'The invitation was sent again.' });
    expect(read.resolvedAt).not.toBeNull();

    const transitions = await h.issueEvents('SAAS_ISSUE.TRANSITIONED', issue.id);
    expect(transitions.map((event) => [event.actor_app_user_id, event.before, event.after.state])).toEqual([
      [h.it1.appUserId, { state: 'NEW' }, 'IN_PROGRESS'],
      [h.it1.appUserId, { state: 'IN_PROGRESS' }, 'RESOLVED'],
    ]);
    const told = await h.issueEvents('SAAS_ISSUE.RESOLVED', issue.id);
    expect(told).toHaveLength(1);
    expect(told[0].after).toMatchObject({ notifyEmployeeId: member.employeeId, reopenUntil: '2026-12-14' });
    expect(JSON.stringify(told)).not.toContain('invitation');

    const entries = await h.entriesOf(issue.id, member.account);
    expect(entries.map((entry) => [entry.kind, entry.authorRole, entry.fromState, entry.toState])).toEqual([
      ['TRANSITION', 'IT_ADMIN', 'NEW', 'IN_PROGRESS'],
      ['TRANSITION', 'IT_ADMIN', 'IN_PROGRESS', 'RESOLVED'],
    ]);
    expect(entries[1].body).toBe('The invitation was sent again.');
  });

  it('refuses to resolve without a result and saves nothing (US-07-11 AC-2)', async () => {
    const { issue } = await fresh();
    await moved(issue.id, { to: 'IN_PROGRESS' });
    const entriesBefore = await h.count('saas_issue_entries');

    for (const body of [{ to: 'RESOLVED' }, { to: 'RESOLVED', resolution: '   ' }]) {
      refused(await h.moveIssue(issue.id, body), 422, 'SAAS_ISSUE.RESOLUTION_REQUIRED');
    }

    expect(await h.issueRow(issue.id)).toMatchObject({ state: 'IN_PROGRESS', resolution: null, reopen_until: null });
    expect(await h.count('saas_issue_entries')).toBe(entriesBefore);
    expect(await h.issueEvents('SAAS_ISSUE.RESOLVED', issue.id)).toEqual([]);
  });

  it('keeps the vendor ticket as it was typed, with no sign that anything was sent (US-07-11 AC-3)', async () => {
    const { issue } = await fresh();
    await moved(issue.id, { to: 'IN_PROGRESS' });

    const waiting = await moved(issue.id, { to: 'WAITING_PROVIDER', vendorTicketRef: '  FIG-12345 ' });

    expect(waiting).toMatchObject({ state: 'WAITING_PROVIDER', vendorTicketRef: 'FIG-12345' });
    expect((await h.issueRow(issue.id)).vendor_ticket_ref).toBe('FIG-12345');
    expect(Object.keys(waiting).filter((key) => /sent|submitted|vendorTicket/i.test(key))).toEqual(['vendorTicketRef']);
    const tooLong = await h.moveIssue(issue.id, { to: 'IN_PROGRESS', vendorTicketRef: 'x'.repeat(101) });
    refused(tooLong, 422, 'VALIDATION_ERROR');
    expect((await moved(issue.id, { to: 'IN_PROGRESS' })).vendorTicketRef).toBe('FIG-12345');
  });

  it('asks the reporter, who answers, and the report goes back to the IT Admin (US-07-11 AC-4)', async () => {
    const { member, issue } = await fresh();
    await moved(issue.id, { to: 'IN_PROGRESS' });

    refused(await h.moveIssue(issue.id, { to: 'WAITING_REPORTER' }), 422, 'SAAS_ISSUE.MESSAGE_REQUIRED');
    const asked = await moved(issue.id, { to: 'WAITING_REPORTER', message: 'Which account did you sign in with?' });
    expect(asked.state).toBe('WAITING_REPORTER');
    const seen = await h.entriesOf(issue.id, member.account);
    expect(seen.at(-1)).toMatchObject({ toState: 'WAITING_REPORTER', body: 'Which account did you sign in with?' });

    const answered = h.dataOf<IssueWire>(
      await h.addIssueMessage(issue.id, { body: 'The one at acme.vn.' }, member.account).expect(201),
    );

    expect(answered.state).toBe('IN_PROGRESS');
    const events = await h.issueEvents('SAAS_ISSUE.MESSAGE_ADDED', issue.id);
    expect(events).toHaveLength(1);
    expect(events[0].after).toMatchObject({
      authorRole: 'REPORTER',
      resumed: true,
      notifyEmployeeId: it1.employeeId,
    });
    const back = (await h.issueEvents('SAAS_ISSUE.TRANSITIONED', issue.id)).at(-1);
    expect(back?.after).toMatchObject({
      state: 'IN_PROGRESS',
      trigger: 'REPORTER_REPLY',
      notifyEmployeeId: it1.employeeId,
    });

    // In any other state the message is only added; the IT Admin may say something too.
    const more = h.dataOf<IssueWire>(
      await h.addIssueMessage(issue.id, { body: 'Thanks.' }, member.account).expect(201),
    );
    expect(more.state).toBe('IN_PROGRESS');
    await h.addIssueMessage(issue.id, { body: 'Working on it.' }, h.it1).expect(201);
    const entries = await h.entriesOf(issue.id, member.account);
    expect(entries.slice(-2).map((entry) => [entry.kind, entry.authorRole])).toEqual([
      ['MESSAGE', 'REPORTER'],
      ['MESSAGE', 'IT_ADMIN'],
    ]);
    refused(await h.addIssueMessage(issue.id, { body: '  ' }, member.account), 422, 'SAAS_ISSUE.MESSAGE_REQUIRED');
  });

  it('moves only along the graph and never out of a report that is a duplicate', async () => {
    const { issue } = await fresh();

    refused(await h.moveIssue(issue.id, { to: 'RESOLVED', resolution: 'ok' }), 409, 'SAAS_ISSUE.INVALID_TRANSITION');
    refused(await h.moveIssue(issue.id, { to: 'NEW' }), 409, 'SAAS_ISSUE.INVALID_TRANSITION');
    refused(await h.moveIssue(issue.id, { to: 'CLOSED' }), 409, 'SAAS_ISSUE.INVALID_TRANSITION');
    refused(await h.moveIssue(issue.id, { to: 'DUPLICATE' }), 409, 'SAAS_ISSUE.INVALID_TRANSITION');
    await moved(issue.id, { to: 'IN_PROGRESS' });
    await moved(issue.id, { to: 'RESOLVED', resolution: 'Done' });
    // The reporter reopens; the IT Admin does not by a transition.
    refused(await h.moveIssue(issue.id, { to: 'IN_PROGRESS' }), 409, 'SAAS_ISSUE.INVALID_TRANSITION');
    expect((await h.issueRow(issue.id)).state).toBe('RESOLVED');
  });

  it('marks a duplicate with the other report and the reason, and the reporter sees both (US-07-10 AC-7, US-07-11 AC-5)', async () => {
    const { issue: p1 } = await fresh();
    const { member, issue: p2 } = await fresh();
    const entriesBefore = await h.count('saas_issue_entries');

    refused(await h.duplicateIssue(p2.id, { ofIssueId: p1.id }), 422, 'VALIDATION_ERROR');
    refused(await h.duplicateIssue(p2.id, { reason: 'Same sign-in error' }), 422, 'VALIDATION_ERROR');
    refused(await h.duplicateIssue(p2.id, { ofIssueId: p1.id, reason: '  ' }), 422, 'SAAS_ISSUE.REASON_REQUIRED');
    refused(
      await h.duplicateIssue(p2.id, { ofIssueId: p2.id, reason: 'Itself' }),
      422,
      'SAAS_ISSUE.DUPLICATE_TARGET_INVALID',
    );
    refused(
      await h.duplicateIssue(p2.id, { ofIssueId: randomUUID(), reason: 'Unknown' }),
      422,
      'SAAS_ISSUE.DUPLICATE_TARGET_INVALID',
    );
    expect(await h.issueRow(p2.id)).toMatchObject({ state: 'NEW', duplicate_of_id: null });
    expect(await h.count('saas_issue_entries')).toBe(entriesBefore);

    const marked = h.dataOf<IssueWire>(
      await h.duplicateIssue(p2.id, { ofIssueId: p1.id, reason: 'Same sign-in error' }).expect(200),
    );

    expect(marked).toMatchObject({
      state: 'DUPLICATE',
      duplicateOf: { id: p1.id, code: p1.code },
      duplicateReason: 'Same sign-in error',
    });
    const read = h.dataOf<IssueWire>(await h.readIssue(p2.id, member.account).expect(200));
    expect(read).toMatchObject({
      state: 'DUPLICATE',
      duplicateOf: { code: p1.code },
      duplicateReason: 'Same sign-in error',
    });
    expect(await h.issueEvents('SAAS_ISSUE.DUPLICATED', p2.id)).toHaveLength(1);
    // A duplicate is final and cannot be the original of another.
    refused(await h.moveIssue(p2.id, { to: 'IN_PROGRESS' }), 409, 'SAAS_ISSUE.INVALID_TRANSITION');
    refused(await h.addIssueMessage(p2.id, { body: 'Hello?' }, member.account), 409, 'SAAS_ISSUE.CLOSED');
    const { issue: p3 } = await fresh();
    refused(
      await h.duplicateIssue(p3.id, { ofIssueId: p2.id, reason: 'Same' }),
      422,
      'SAAS_ISSUE.DUPLICATE_TARGET_INVALID',
    );
  });

  it('lets an IT Admin who is not in charge handle it, and the record names who did and for whom (US-07-11 AC-7)', async () => {
    const { issue } = await fresh();

    const taken = await moved(issue.id, { to: 'IN_PROGRESS' }, it2.account);

    expect(taken.assignedItAdmin.employeeId).toBe(it1.employeeId);
    const [event] = await h.issueEvents('SAAS_ISSUE.TRANSITIONED', issue.id);
    expect(event).toMatchObject({ actor_app_user_id: it2.account.appUserId });
    expect(event.after).toMatchObject({ onBehalfOf: it1.employeeId });
    const [entry] = await h.entriesOf(issue.id, h.it1);
    expect(entry).toMatchObject({ author: { employeeId: it2.employeeId }, onBehalfOf: { employeeId: it1.employeeId } });
    // The one in charge acts for themselves.
    await moved(issue.id, { to: 'WAITING_PROVIDER' });
    expect((await h.issueEvents('SAAS_ISSUE.TRANSITIONED', issue.id)).at(-1)?.after).toMatchObject({
      onBehalfOf: null,
    });
  });

  it('keeps pointers to other work and opens none of it (US-07-11 AC-8)', async () => {
    const { assignmentId, issue } = await fresh();
    await moved(issue.id, { to: 'IN_PROGRESS' });
    const taskId = await h.openGrantTask(assignmentId);
    const counts = async () => [
      await h.count('provisioning_tasks'),
      await h.count('return_requests'),
      await h.count('access_requests'),
    ];
    const before = await counts();
    const requestId = randomUUID();

    refused(
      await h.moveIssue(issue.id, {
        to: 'RESOLVED',
        resolution: 'Retry the grant',
        linkedWork: { grantTaskId: randomUUID() },
      }),
      422,
      'SAAS_ISSUE.LINKED_WORK_INVALID',
    );
    expect((await h.issueRow(issue.id)).state).toBe('IN_PROGRESS');

    const resolved = await moved(issue.id, {
      to: 'RESOLVED',
      resolution: 'The grant has to be tried again.',
      linkedWork: { grantTaskId: taskId, requestId },
    });

    expect(resolved.linkedWork).toEqual({ grantTaskId: taskId, discrepancyId: null, returnId: null, requestId });
    expect((await h.issueRow(issue.id)).linked_work).toEqual({ grantTaskId: taskId, requestId });
    expect(await counts()).toEqual(before);
  });

  it('refuses Finance, the Super Admin, the head of a department and the spending approver to handle, and an employee too (US-07-11 AC-9)', async () => {
    const { department, member, issue } = await fresh();
    const head = await h.staff(department, `P-HEAD-H${(seq += 1)}`);
    await h.makeHead(department, head);
    const approver = await h.staff(department, `P-APPR-H${seq}`);
    await h.setRole('SPENDING_APPROVER', approver);
    const superAdmin = { accessToken: h.admin } as ApiAccount;

    for (const account of [h.finance, superAdmin, head.account, approver.account, member.account, h.employee]) {
      refused(await h.moveIssue(issue.id, { to: 'IN_PROGRESS' }, account), 403, 'AUTHORIZATION.FORBIDDEN');
      refused(
        await h.duplicateIssue(issue.id, { ofIssueId: randomUUID(), reason: 'Same' }, account),
        403,
        'AUTHORIZATION.FORBIDDEN',
      );
    }
    expect(await h.issueRow(issue.id)).toMatchObject({ state: 'NEW' });
    // The head reads nothing of it.
    refused(await h.readIssue(issue.id, head.account), 404, 'SAAS_ISSUE.NOT_FOUND');
  });

  describe('the days the reporter may reopen and the IT Admin should answer (US-07-10 AC-6, US-07-11 AC-6)', () => {
    it('reopens in time for the IT Admin it was given to, and counts it', async () => {
      restoreToday = h.pretendToday(MONDAY);
      const { member, issue } = await fresh();
      await moved(issue.id, { to: 'IN_PROGRESS' });
      await moved(issue.id, { to: 'RESOLVED', resolution: 'Resent' });
      restoreToday();
      restoreToday = h.pretendToday(WEDNESDAY);

      refused(await h.reopenIssue(issue.id, { reason: '  ' }, member.account), 422, 'SAAS_ISSUE.REASON_REQUIRED');
      refused(await h.reopenIssue(issue.id, { reason: 'Still broken' }, h.it1), 404, 'SAAS_ISSUE.NOT_FOUND');
      const reopened = h.dataOf<IssueWire>(
        await h.reopenIssue(issue.id, { reason: 'Still broken' }, member.account).expect(200),
      );

      expect(reopened).toMatchObject({
        state: 'IN_PROGRESS',
        reopenCount: 1,
        assignedItAdmin: { employeeId: it1.employeeId },
      });
      const events = await h.issueEvents('SAAS_ISSUE.REOPENED', issue.id);
      expect(events).toHaveLength(1);
      expect(events[0].after).toMatchObject({ notifyEmployeeId: it1.employeeId, reopenCount: 1 });
      const entries = await h.entriesOf(issue.id, member.account);
      expect(entries.at(-1)).toMatchObject({
        authorRole: 'REPORTER',
        fromState: 'RESOLVED',
        toState: 'IN_PROGRESS',
        body: 'Still broken',
      });
      refused(await h.reopenIssue(issue.id, { reason: 'Again' }, member.account), 409, 'SAAS_ISSUE.NOT_RESOLVED');
    });

    it('refuses to reopen after the last day, closes the report on the pass, and takes only a new report after that', async () => {
      restoreToday = h.pretendToday(MONDAY);
      const { member, assignmentId, issue } = await fresh();
      await moved(issue.id, { to: 'IN_PROGRESS' });
      await moved(issue.id, { to: 'RESOLVED', resolution: 'Resent' });
      restoreToday();
      restoreToday = h.pretendToday('2026-12-14');
      await h.reopenIssue(issue.id, { reason: 'Last day' }, member.account).expect(200);
      restoreToday();
      restoreToday = h.pretendToday('2026-12-14');
      await moved(issue.id, { to: 'RESOLVED', resolution: 'Resent again' });
      expect((await h.issueRow(issue.id)).reopen_until).toBe('2026-12-21');
      restoreToday();
      restoreToday = h.pretendToday('2026-12-22');

      refused(
        await h.reopenIssue(issue.id, { reason: 'Too late' }, member.account),
        409,
        'SAAS_ISSUE.REOPEN_WINDOW_ENDED',
      );
      expect((await h.issueRow(issue.id)).state).toBe('RESOLVED');
      const first = await h.sweepIssues();
      expect(first.closed).toBeGreaterThanOrEqual(1);
      expect(await h.issueRow(issue.id)).toMatchObject({ state: 'CLOSED' });
      expect((await h.sweepIssues()).closed).toBe(0);

      const closed = await h.issueEvents('SAAS_ISSUE.CLOSED', issue.id);
      expect(closed).toHaveLength(1);
      expect(closed[0]).toMatchObject({ actor_kind: 'SYSTEM', before: { state: 'RESOLVED' } });
      const entries = await h.entriesOf(issue.id, member.account);
      expect(entries.at(-1)).toMatchObject({
        authorRole: 'SYSTEM',
        author: null,
        fromState: 'RESOLVED',
        toState: 'CLOSED',
      });
      refused(
        await h.reopenIssue(issue.id, { reason: 'Too late' }, member.account),
        409,
        'SAAS_ISSUE.REOPEN_WINDOW_ENDED',
      );
      refused(await h.addIssueMessage(issue.id, { body: 'Hello?' }, member.account), 409, 'SAAS_ISSUE.CLOSED');
      refused(await h.moveIssue(issue.id, { to: 'IN_PROGRESS' }), 409, 'SAAS_ISSUE.INVALID_TRANSITION');
      // A new report can still be sent for the same right.
      await h.reported(member.account, assignmentId);
    });

    it('does not close a report that is still being handled, however old', async () => {
      restoreToday = h.pretendToday(MONDAY);
      const { issue } = await fresh();
      await moved(issue.id, { to: 'IN_PROGRESS' });
      restoreToday();
      restoreToday = h.pretendToday('2027-03-01');

      await h.sweepIssues();

      expect((await h.issueRow(issue.id)).state).toBe('IN_PROGRESS');
    });

    it('reminds once that a new report was not taken up in time, and changes nothing (US-07-11 AC-6)', async () => {
      restoreToday = h.pretendToday(MONDAY);
      const { issue } = await fresh();
      expect(issue.responseDueOn).toBe('2026-12-08');
      const taken = await fresh();
      await moved(taken.issue.id, { to: 'IN_PROGRESS' });
      restoreToday();
      restoreToday = h.pretendToday('2026-12-08');
      await h.sweepIssues();
      expect(await h.issueEvents('SAAS_ISSUE.RESPONSE_OVERDUE', issue.id)).toEqual([]);
      expect(h.dataOf<IssueWire>(await h.readIssue(issue.id, h.it1).expect(200)).overdue).toBe(false);
      restoreToday();
      restoreToday = h.pretendToday(WEDNESDAY);

      const first = await h.sweepIssues();
      const second = await h.sweepIssues();

      expect(first.told).toBeGreaterThanOrEqual(1);
      expect(second.told).toBe(0);
      const events = await h.issueEvents('SAAS_ISSUE.RESPONSE_OVERDUE', issue.id);
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ actor_kind: 'SYSTEM' });
      expect(events[0].after).toMatchObject({ notifyEmployeeId: it1.employeeId, responseDueOn: '2026-12-08' });
      expect(await h.issueEvents('SAAS_ISSUE.RESPONSE_OVERDUE', taken.issue.id)).toEqual([]);
      expect(await h.issueRow(issue.id)).toMatchObject({
        state: 'NEW',
        assigned_it_admin_employee_id: it1.employeeId,
        assigned_by_fallback: false,
      });
      expect((await h.issueRow(issue.id)).response_overdue_noticed_at).not.toBeNull();
      const read = h.dataOf<IssueWire>(await h.readIssue(issue.id, h.it1).expect(200));
      expect(read).toMatchObject({ state: 'NEW', overdue: true });
      const overdue = h.dataOf<{ items: IssueWire[] }>(
        await h.listIssues(h.it1, '?overdue=true&pageSize=100').expect(200),
      ).items;
      expect(overdue.map((row) => row.id)).toContain(issue.id);
      expect(overdue.map((row) => row.id)).not.toContain(taken.issue.id);
    });
  });
});
