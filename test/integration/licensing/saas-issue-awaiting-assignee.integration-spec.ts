import { randomUUID } from 'node:crypto';
import type { Person } from '../../support/request-harness';
import { MONDAY, SaasIssueHarness, type IssueWire } from '../../support/saas-issue-harness';

const h = new SaasIssueHarness();
const WEDNESDAY = '2026-12-09';

/**
 * W2-27 H6 (criterion h, y) & W2-Q10: submitting a SaaS issue report when the reporter's department has no acting IT Admin
 * creates an unassigned NEW report, notifies the Super Admin once with `SAAS_ISSUE_AWAITING_ASSIGNEE`, routes overdue reminders
 * to the Super Admin while still unassigned, and assigns the report once an acting IT Admin (or substitute) is appointed and
 * the hourly sweep runs. Also verifies migration 4 database constraints (`saas_issues_assignee_when_handled` and `saas_issue_guard`).
 */
describe('SaaS issue awaiting assignee and sweep assignment (integration, real PostgreSQL)', () => {
  let figma: { subscriptionId: string };
  let it1: Person;
  let seq = 0;
  let restoreToday: (() => void) | undefined;

  const noticesAbout = async (issueId: string, code: string) =>
    (
      await h.ctx.sql.query<{ recipient_employee_id: string; event_key: string; params: Record<string, unknown> }>(
        `SELECT recipient_employee_id, event_key, params
           FROM in_app_notifications WHERE subject_id = $1 AND code = $2 ORDER BY created_at, id`,
        [issueId, code],
      )
    ).rows;

  const reporter = async (inCharge: Person | null) => {
    seq += 1;

    return h.reporterIn(`P-SAW${seq}`, inCharge, figma);
  };

  beforeAll(async () => {
    await h.start();
    figma = { subscriptionId: await h.subscription(80, 'K2') };
    it1 = { employeeId: h.it1.employeeId, account: h.it1 };
  }, 300000);

  afterEach(() => {
    restoreToday?.();
    restoreToday = undefined;
  });

  afterAll(async () => {
    await h.stop();
  });

  it('assigns to substitute over in-charge on submit with assignedByFallback true (W2-27 h)', async () => {
    restoreToday = h.pretendToday(MONDAY);
    const sub = await h.staff(await h.departmentWithUnit('P-SAWSUB1'), 'E-SAW-SUB1', 'IT_ADMIN');
    const { department, member, assignmentId } = await reporter(it1);
    await h.ctx.sql.query(
      `INSERT INTO department_it_substitutes (id, department_id, substitute_employee_id, reason, appointed_by_app_user_id)
       VALUES (gen_random_uuid(), $1, $2, 'Temporary cover', $3)`,
      [department.id, sub.employeeId, h.it1.appUserId],
    );

    const issue = await h.reported(member.account, assignmentId);

    expect(issue).toMatchObject({
      state: 'NEW',
      assignedItAdmin: { employeeId: sub.employeeId },
      assignedByFallback: true,
    });
    const notices = await noticesAbout(issue.id, 'SAAS_ISSUE_SUBMITTED');
    expect(notices.map((row) => row.recipient_employee_id)).toEqual([sub.employeeId]);
  });

  it('creates an unassigned NEW issue, tells Super Admin once, then assigns on sweep when substitute is appointed (W2-27 y)', async () => {
    restoreToday = h.pretendToday(MONDAY);
    const { department, member, assignmentId } = await reporter(null);
    const sub = await h.staff(await h.departmentWithUnit('P-SAWSUB2'), 'E-SAW-SUB2', 'IT_ADMIN');
    const superAdminId = (
      await h.ctx.sql.query<{ employee_id: string }>(
        `SELECT u.employee_id FROM app_users u
           JOIN role_grants g ON g.app_user_id = u.id AND g.role = 'SUPER_ADMIN' AND g.revoked_at IS NULL
          WHERE u.status = 'ACTIVE' AND u.activation_state = 'ACTIVATED' LIMIT 1`,
      )
    ).rows[0].employee_id;

    const created = await h.reported(member.account, assignmentId);

    expect(created).toMatchObject({
      state: 'NEW',
      assignedItAdmin: null,
      assignedByFallback: false,
    });
    const awaitingNotices = await noticesAbout(created.id, 'SAAS_ISSUE_AWAITING_ASSIGNEE');
    expect(awaitingNotices).toHaveLength(1);
    expect(awaitingNotices[0]).toMatchObject({
      recipient_employee_id: superAdminId,
      event_key: `saasIssueAwaitingAssignee:${created.id}`,
    });
    expect(awaitingNotices[0].params).toMatchObject({
      issueId: created.id,
      issueCode: created.code,
      departmentId: department.id,
    });

    // Sweep before any IT Admin acts for the department assigns nothing.
    expect((await h.sweepIssues()).assigned).toBe(0);

    // Appoint substitute, then run sweep -> assigned once, audit SAAS_ISSUE.ASSIGNED, SAAS_ISSUE_SUBMITTED sent to substitute.
    await h.ctx.sql.query(
      `INSERT INTO department_it_substitutes (id, department_id, substitute_employee_id, reason, appointed_by_app_user_id)
       VALUES (gen_random_uuid(), $1, $2, 'Cover', $3)`,
      [department.id, sub.employeeId, h.it1.appUserId],
    );
    const pass = await h.sweepIssues();
    expect(pass.assigned).toBeGreaterThanOrEqual(1);

    const read = h.dataOf<IssueWire>(await h.readIssue(created.id, member.account).expect(200));
    expect(read).toMatchObject({
      state: 'NEW',
      assignedItAdmin: { employeeId: sub.employeeId },
      assignedByFallback: true,
    });
    const assignedEvents = await h.issueEvents('SAAS_ISSUE.ASSIGNED', created.id);
    expect(assignedEvents).toHaveLength(1);
    expect(assignedEvents[0]).toMatchObject({
      actor_kind: 'SYSTEM',
      before: { assignedItAdminEmployeeId: null, assignedByFallback: false },
      after: { code: created.code, assignedItAdminEmployeeId: sub.employeeId, assignedByFallback: true },
    });
    const submittedNotices = await noticesAbout(created.id, 'SAAS_ISSUE_SUBMITTED');
    expect(submittedNotices.map((row) => row.recipient_employee_id)).toEqual([sub.employeeId]);

    // Second sweep does not reassign or duplicate notifications.
    expect((await h.sweepIssues()).assigned).toBe(0);
    expect(await h.issueEvents('SAAS_ISSUE.ASSIGNED', created.id)).toHaveLength(1);
  });

  it('sends overdue response reminder to Super Admin while unassigned, and enforces migration 4 DB constraints', async () => {
    restoreToday = h.pretendToday(MONDAY);
    const { member, assignmentId } = await reporter(null);
    const superAdminId = (
      await h.ctx.sql.query<{ employee_id: string }>(
        `SELECT u.employee_id FROM app_users u
           JOIN role_grants g ON g.app_user_id = u.id AND g.role = 'SUPER_ADMIN' AND g.revoked_at IS NULL
          WHERE u.status = 'ACTIVE' AND u.activation_state = 'ACTIVATED' LIMIT 1`,
      )
    ).rows[0].employee_id;
    const issue = await h.reported(member.account, assignmentId);

    // Moving an unassigned row out of NEW fails CHECK constraint (23514).
    await expect(
      h.ctx.sql.query(`UPDATE saas_issues SET state = 'IN_PROGRESS' WHERE id = $1`, [issue.id]),
    ).rejects.toMatchObject({ code: '23514' });

    // Overdue sweep notifies Super Admin.
    restoreToday();
    restoreToday = h.pretendToday(WEDNESDAY);
    await h.sweepIssues();
    const overdueNotices = await noticesAbout(issue.id, 'SAAS_ISSUE_RESPONSE_OVERDUE');
    expect(overdueNotices.map((row) => row.recipient_employee_id)).toEqual([superAdminId]);

    // Assigning once from NULL to non-NULL succeeds, then changing it again fails trigger guard (55000).
    await h.ctx.sql.query(
      `UPDATE saas_issues SET assigned_it_admin_employee_id = $2, assigned_by_fallback = true WHERE id = $1`,
      [issue.id, it1.employeeId],
    );
    await expect(
      h.ctx.sql.query(`UPDATE saas_issues SET assigned_it_admin_employee_id = $2 WHERE id = $1`, [
        issue.id,
        randomUUID(),
      ]),
    ).rejects.toMatchObject({ code: '55000' });
  });
});
