import type { Person } from '../../support/request-harness';
import { MONDAY, SaasIssueHarness } from '../../support/saas-issue-harness';

const h = new SaasIssueHarness();
const WEDNESDAY = '2026-12-09';

interface Notice {
  recipient_employee_id: string;
  subject_type: string | null;
  subject_id: string | null;
  event_key: string;
  params: Record<string, unknown>;
}

/**
 * The IT Admin a report of an error in a SaaS right is given to is told when it is sent and, once, when its day to be taken up passed
 * (`FR-2.15`, `QĐ-108f`). Nobody else is: not the head of the department, who does not read what the report says, and not the person who
 * made the report when they are the IT Admin it is given to. A change of state is told to the other party (the reporter when an IT Admin moved the report or the pass closed it, the IT Admin when the reporter answered or reopened) and never to who made it. A notice says what the report is about by id and code, never what was written.
 */
describe('the notices of the reports of SaaS errors, over PostgreSQL (FX-T4a, FX-T4b)', () => {
  let it1: Person;
  let restoreToday: (() => void) | undefined;
  let seq = 0;
  let figma: { subscriptionId: string };

  const noticesAbout = async (issueId: string, code: string): Promise<Notice[]> =>
    (
      await h.ctx.sql.query<Notice>(
        `SELECT recipient_employee_id, subject_type, subject_id::text, event_key, params
           FROM in_app_notifications WHERE subject_id = $1 AND code = $2 ORDER BY created_at, id`,
        [issueId, code],
      )
    ).rows;

  const applicationOf = async (assignmentId: string): Promise<string> =>
    (
      await h.ctx.sql.query<{ application_id: string }>(
        `SELECT p.application_id FROM license_assignments a JOIN plans p ON p.id = a.plan_id WHERE a.id = $1`,
        [assignmentId],
      )
    ).rows[0].application_id;

  const reporter = async (inCharge: Person | null = it1) => {
    seq += 1;

    return h.reporterIn(`P-SN${seq}`, inCharge, figma);
  };

  beforeAll(async () => {
    await h.start();
    it1 = { employeeId: h.it1.employeeId, account: h.it1 };
    figma = { subscriptionId: await h.subscription(80, 'K2') };
  }, 300000);

  afterEach(() => {
    restoreToday?.();
    restoreToday = undefined;
  });

  afterAll(async () => {
    await h.stop();
  });

  describe('SAAS_ISSUE_SUBMITTED', () => {
    it('tells the IT Admin it is given to once, with the ids and kinds of the report and nothing it says', async () => {
      restoreToday = h.pretendToday(MONDAY);
      const { member, assignmentId } = await reporter();

      const issue = await h.reported(member.account, assignmentId, { description: 'Secret hunter2 is in this text' });

      const notices = await noticesAbout(issue.id, 'SAAS_ISSUE_SUBMITTED');
      expect(notices).toHaveLength(1);
      expect(notices[0]).toMatchObject({
        recipient_employee_id: it1.employeeId,
        subject_type: 'SAAS_ISSUE',
        event_key: `SAAS_ISSUE_SUBMITTED:${issue.id}`,
        params: {
          issueId: issue.id,
          issueCode: issue.code,
          category: 'NO_ACCESS',
          impact: 'UNUSABLE',
          applicationId: await applicationOf(assignmentId),
        },
      });
      expect(Object.keys(notices[0].params).sort()).toEqual(
        ['applicationId', 'category', 'impact', 'issueCode', 'issueId'].sort(),
      );
      expect(JSON.stringify(notices[0].params)).not.toContain('hunter2');
    });

    it('tells nobody else: not the head of the department, not the reporter', async () => {
      restoreToday = h.pretendToday(MONDAY);
      const { member, assignmentId } = await reporter();

      const issue = await h.reported(member.account, assignmentId);

      expect((await noticesAbout(issue.id, 'SAAS_ISSUE_SUBMITTED')).map((row) => row.recipient_employee_id)).toEqual([
        it1.employeeId,
      ]);
    });

    it('does not tell an IT Admin who reports for themselves, and the report is still made', async () => {
      restoreToday = h.pretendToday(MONDAY);
      seq += 1;
      const department = await h.departmentWithUnit(`P-SN${seq}`);
      const self = await h.staff(department, `SN-IT${seq}`, 'IT_ADMIN');
      await h.setItAdminInCharge(department, self);
      const assignmentId = await h.seatOf(self, figma);

      const issue = await h.reported(self.account, assignmentId);

      expect(issue.assignedItAdmin.employeeId).toBe(self.employeeId);
      expect(await noticesAbout(issue.id, 'SAAS_ISSUE_SUBMITTED')).toEqual([]);
    });

    it('tells the IT Admin it fell to by the fallback when nobody is in charge', async () => {
      restoreToday = h.pretendToday(MONDAY);
      const { member, assignmentId } = await reporter(null);

      const issue = await h.reported(member.account, assignmentId);

      expect(issue.assignedByFallback).toBe(true);
      const notices = await noticesAbout(issue.id, 'SAAS_ISSUE_SUBMITTED');
      expect(notices.map((row) => row.recipient_employee_id)).toEqual([issue.assignedItAdmin.employeeId]);
    });
  });

  describe('SAAS_ISSUE_RESPONSE_OVERDUE', () => {
    it('tells the IT Admin it is given to once when the day to take it up passed, and not again', async () => {
      restoreToday = h.pretendToday(MONDAY);
      const { member, assignmentId } = await reporter();
      const issue = await h.reported(member.account, assignmentId);
      restoreToday();
      restoreToday = h.pretendToday(WEDNESDAY);

      await h.sweepIssues();
      await h.sweepIssues();

      const notices = await noticesAbout(issue.id, 'SAAS_ISSUE_RESPONSE_OVERDUE');
      expect(notices).toHaveLength(1);
      expect(notices[0]).toMatchObject({
        recipient_employee_id: it1.employeeId,
        subject_type: 'SAAS_ISSUE',
        event_key: `SAAS_ISSUE_RESPONSE_OVERDUE:${issue.id}`,
        params: { issueId: issue.id, issueCode: issue.code, responseDueOn: '2026-12-08' },
      });
      expect(Object.keys(notices[0].params).sort()).toEqual(['issueCode', 'issueId', 'responseDueOn']);
    });

    it('tells nobody of a report that was taken up in time', async () => {
      restoreToday = h.pretendToday(MONDAY);
      const { member, assignmentId } = await reporter();
      const issue = await h.reported(member.account, assignmentId);
      await h.moveIssue(issue.id, { to: 'IN_PROGRESS' }).expect(200);
      restoreToday();
      restoreToday = h.pretendToday(WEDNESDAY);

      await h.sweepIssues();

      expect(await noticesAbout(issue.id, 'SAAS_ISSUE_RESPONSE_OVERDUE')).toEqual([]);
    });
  });

  describe('SAAS_ISSUE_STATE_CHANGED', () => {
    const lastEntryId = async (issueId: string): Promise<string> =>
      (
        await h.ctx.sql.query<{ id: string }>(
          `SELECT id FROM saas_issue_entries WHERE issue_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1`,
          [issueId],
        )
      ).rows[0].id;

    const changes = (issueId: string) => noticesAbout(issueId, 'SAAS_ISSUE_STATE_CHANGED');

    it('tells the reporter, once and with the states, when the IT Admin takes the report up, asks them or resolves it', async () => {
      restoreToday = h.pretendToday(MONDAY);
      const { member, assignmentId } = await reporter();
      const issue = await h.reported(member.account, assignmentId);
      await h.moveIssue(issue.id, { to: 'IN_PROGRESS' }).expect(200);
      await h.moveIssue(issue.id, { to: 'WAITING_REPORTER', message: 'Which account?' }).expect(200);
      const askedEntry = await lastEntryId(issue.id);
      await h.addIssueMessage(issue.id, { body: 'This one' }, member.account).expect(201);
      await h.moveIssue(issue.id, { to: 'RESOLVED', resolution: 'Invitation sent again' }).expect(200);
      const resolvedEntry = await lastEntryId(issue.id);

      const notices = (await changes(issue.id)).filter((row) => row.params.trigger === 'IT_ACTION');

      expect(notices.map((row) => [row.params.fromState, row.params.toState])).toEqual([
        ['NEW', 'IN_PROGRESS'],
        ['IN_PROGRESS', 'WAITING_REPORTER'],
        ['IN_PROGRESS', 'RESOLVED'],
      ]);
      expect(notices.every((row) => row.recipient_employee_id === member.employeeId)).toBe(true);
      expect(notices[1]).toMatchObject({
        subject_type: 'SAAS_ISSUE',
        event_key: `SAAS_ISSUE_STATE_CHANGED:${askedEntry}`,
        params: {
          issueId: issue.id,
          issueCode: issue.code,
          fromState: 'IN_PROGRESS',
          toState: 'WAITING_REPORTER',
          trigger: 'IT_ACTION',
        },
      });
      expect(notices[2].event_key).toBe(`SAAS_ISSUE_STATE_CHANGED:${resolvedEntry}`);
      expect(Object.keys(notices[1].params).sort()).toEqual(
        ['fromState', 'issueCode', 'issueId', 'toState', 'trigger'].sort(),
      );
      expect(JSON.stringify(notices)).not.toContain('Invitation sent again');
    });

    it('tells the reporter when the report is marked a duplicate of another', async () => {
      restoreToday = h.pretendToday(MONDAY);
      const first = await reporter();
      const second = await reporter();
      const original = await h.reported(first.member.account, first.assignmentId);
      const issue = await h.reported(second.member.account, second.assignmentId);

      await h.duplicateIssue(issue.id, { ofIssueId: original.id, reason: 'Same sign-in error' }).expect(200);

      const notices = await changes(issue.id);
      expect(notices).toHaveLength(1);
      expect(notices[0]).toMatchObject({
        recipient_employee_id: second.member.employeeId,
        event_key: `SAAS_ISSUE_STATE_CHANGED:${await lastEntryId(issue.id)}`,
        params: { fromState: 'NEW', toState: 'DUPLICATE', trigger: 'IT_ACTION' },
      });
      expect(await changes(original.id)).toEqual([]);
    });

    it('tells the IT Admin it is given to when the reporter answers a question, and when they reopen the report', async () => {
      restoreToday = h.pretendToday(MONDAY);
      const { member, assignmentId } = await reporter();
      const issue = await h.reported(member.account, assignmentId);
      await h.moveIssue(issue.id, { to: 'IN_PROGRESS' }).expect(200);
      await h.moveIssue(issue.id, { to: 'WAITING_REPORTER', message: 'Which account?' }).expect(200);

      await h.addIssueMessage(issue.id, { body: 'This one' }, member.account).expect(201);
      const answeredEntry = await lastEntryId(issue.id);
      await h.addIssueMessage(issue.id, { body: 'And one more thing' }, member.account).expect(201);
      await h.moveIssue(issue.id, { to: 'RESOLVED', resolution: 'Done' }).expect(200);
      await h.reopenIssue(issue.id, { reason: 'Still broken' }, member.account).expect(200);
      const reopenedEntry = await lastEntryId(issue.id);

      const toIt = (await changes(issue.id)).filter((row) => row.recipient_employee_id === it1.employeeId);
      expect(toIt).toHaveLength(2);
      expect(toIt[0]).toMatchObject({
        subject_type: 'SAAS_ISSUE',
        event_key: `SAAS_ISSUE_STATE_CHANGED:${answeredEntry}`,
        params: {
          issueId: issue.id,
          issueCode: issue.code,
          fromState: 'WAITING_REPORTER',
          toState: 'IN_PROGRESS',
          trigger: 'REPORTER_REPLY',
        },
      });
      expect(toIt[1]).toMatchObject({
        event_key: `SAAS_ISSUE_STATE_CHANGED:${reopenedEntry}`,
        params: { fromState: 'RESOLVED', toState: 'IN_PROGRESS', trigger: 'REPORTER_REOPEN' },
      });
      expect(JSON.stringify(toIt)).not.toContain('Still broken');
    });

    it('tells the IT Admin a report fell to by the fallback when the reporter answers', async () => {
      restoreToday = h.pretendToday(MONDAY);
      const { member, assignmentId } = await reporter(null);
      const issue = await h.reported(member.account, assignmentId);
      expect(issue.assignedByFallback).toBe(true);
      await h.moveIssue(issue.id, { to: 'IN_PROGRESS' }, h.it1).expect(200);
      await h.moveIssue(issue.id, { to: 'WAITING_REPORTER', message: 'Which?' }, h.it1).expect(200);

      await h.addIssueMessage(issue.id, { body: 'This' }, member.account).expect(201);

      const replies = (await changes(issue.id)).filter((row) => row.params.trigger === 'REPORTER_REPLY');
      expect(replies.map((row) => row.recipient_employee_id)).toEqual([issue.assignedItAdmin.employeeId]);
    });

    it('tells the reporter once when the pass closes a report after the last day to reopen it, and not again', async () => {
      restoreToday = h.pretendToday(MONDAY);
      const { member, assignmentId } = await reporter();
      const issue = await h.reported(member.account, assignmentId);
      await h.moveIssue(issue.id, { to: 'IN_PROGRESS' }).expect(200);
      await h.moveIssue(issue.id, { to: 'RESOLVED', resolution: 'Done' }).expect(200);
      restoreToday();
      restoreToday = h.pretendToday('2026-12-22');

      await h.sweepIssues();
      await h.sweepIssues();

      const lapsed = (await changes(issue.id)).filter((row) => row.params.trigger === 'REOPEN_WINDOW_LAPSED');
      expect(lapsed).toHaveLength(1);
      expect(lapsed[0]).toMatchObject({
        recipient_employee_id: member.employeeId,
        subject_type: 'SAAS_ISSUE',
        event_key: `SAAS_ISSUE_STATE_CHANGED:${issue.id}:CLOSED`,
        params: { issueId: issue.id, issueCode: issue.code, fromState: 'RESOLVED', toState: 'CLOSED' },
      });
    });

    it('does not tell of a message that changes no state, nor the IT Admin of what they did to their own report', async () => {
      restoreToday = h.pretendToday(MONDAY);
      const { member, assignmentId } = await reporter();
      const issue = await h.reported(member.account, assignmentId);
      await h.addIssueMessage(issue.id, { body: 'Any news?' }, member.account).expect(201);
      await h.addIssueMessage(issue.id, { body: 'Looking' }, h.it1).expect(201);
      expect(await changes(issue.id)).toEqual([]);

      seq += 1;
      const department = await h.departmentWithUnit(`P-SN${seq}`);
      const self = await h.staff(department, `SN-IT${seq}`, 'IT_ADMIN');
      await h.setItAdminInCharge(department, self);
      const own = await h.reported(self.account, await h.seatOf(self, figma));
      await h.moveIssue(own.id, { to: 'IN_PROGRESS' }, self.account).expect(200);
      await h.moveIssue(own.id, { to: 'WAITING_REPORTER', message: 'Me again' }, self.account).expect(200);
      await h.addIssueMessage(own.id, { body: 'Myself' }, self.account).expect(201);
      await h.moveIssue(own.id, { to: 'RESOLVED', resolution: 'Fixed by me' }, self.account).expect(200);
      await h.reopenIssue(own.id, { reason: 'Not fixed' }, self.account).expect(200);

      expect(await changes(own.id)).toEqual([]);
    });

    it('tells a reporter who is an IT Admin when another IT Admin handles their report', async () => {
      restoreToday = h.pretendToday(MONDAY);
      seq += 1;
      const department = await h.departmentWithUnit(`P-SN${seq}`);
      const self = await h.staff(department, `SN-IT${seq}`, 'IT_ADMIN');
      await h.setItAdminInCharge(department, self);
      const own = await h.reported(self.account, await h.seatOf(self, figma));

      await h.moveIssue(own.id, { to: 'IN_PROGRESS' }, h.it1).expect(200);

      const notices = await changes(own.id);
      expect(notices.map((row) => row.recipient_employee_id)).toEqual([self.employeeId]);
    });
  });
});
