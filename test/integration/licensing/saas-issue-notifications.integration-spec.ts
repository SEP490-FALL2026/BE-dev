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
 * made the report when they are the IT Admin it is given to. A notice says what the report is about by id and code, never what was written.
 */
describe('the notices of the reports of SaaS errors, over PostgreSQL (FX-T4a)', () => {
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
});
