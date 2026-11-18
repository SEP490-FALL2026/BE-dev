import type { Person } from '../support/request-harness';
import { type IssueWire, type OptionsWire, SaasIssueHarness } from '../support/saas-issue-harness';

const h = new SaasIssueHarness();

/**
 * E2E smoke: an employee who holds a seat of a SaaS tool reports that they cannot get in; the report goes to the IT Admin in charge
 * of the department, who finds it, takes it up and resolves it; the reporter reads the result, and the hourly pass closes it once
 * the time to reopen has passed. Real HTTP and PostgreSQL; the hourly pass is run once by hand.
 */
describe('a report of an error in a SaaS right, from the employee to the IT Admin (e2e)', () => {
  let member: Person;
  let assignmentId: string;
  let issue: IssueWire;

  beforeAll(async () => {
    await h.start();
    const itAdmin: Person = { employeeId: h.it1.employeeId, account: h.it1 };
    // A department whose IT Admin in charge is IT1, a member of it, and their seat on the subscription the department owns.
    const department = await h.departmentWithUnit('P-DES');
    await h.setItAdminInCharge(department, itAdmin);
    member = await h.staff(department, 'DES-E1');
    const subscriptionId = await h.subscription(20, 'K2', department.id);
    assignmentId = await h.seatOf(member, { subscriptionId });
  }, 180000);

  afterAll(async () => {
    await h.stop();
  });

  it('the employee finds their seat among the rights they may report about', async () => {
    const options = h.dataOf<OptionsWire>(await h.issueOptions(member.account).expect(200));

    expect(options.items.map((item) => item.assignmentId)).toEqual([assignmentId]);
  });

  it('the employee reports that they cannot get in: the report is new and given to the IT Admin in charge', async () => {
    issue = await h.reported(member.account, assignmentId);

    expect(issue).toMatchObject({
      state: 'NEW',
      category: 'NO_ACCESS',
      impact: 'UNUSABLE',
      assignmentId,
      reporter: { employeeId: member.employeeId },
      assignedItAdmin: { employeeId: h.it1.employeeId },
    });
  });

  it('the IT Admin finds it in their list and takes it up', async () => {
    const listed = h.dataOf<{ items: IssueWire[] }>(await h.listIssues(h.it1, '?pageSize=100').expect(200)).items;
    expect(listed.map((row) => [row.id, row.state])).toContainEqual([issue.id, 'NEW']);

    const taken = h.dataOf<IssueWire>(await h.moveIssue(issue.id, { to: 'IN_PROGRESS' }).expect(200));

    expect(taken.state).toBe('IN_PROGRESS');
  });

  it('the IT Admin resolves it with the result, and the reporter reads it', async () => {
    const resolved = h.dataOf<IssueWire>(
      await h.moveIssue(issue.id, { to: 'RESOLVED', resolution: 'The invitation was sent again.' }).expect(200),
    );
    expect(resolved).toMatchObject({ state: 'RESOLVED', resolution: 'The invitation was sent again.' });
    issue = resolved;

    const read = h.dataOf<IssueWire>(await h.readIssue(issue.id, member.account).expect(200));
    expect(read).toMatchObject({ state: 'RESOLVED', resolution: 'The invitation was sent again.' });
    const entries = await h.entriesOf(issue.id, member.account);
    expect(entries.map((entry) => [entry.authorRole, entry.toState])).toEqual([
      ['IT_ADMIN', 'IN_PROGRESS'],
      ['IT_ADMIN', 'RESOLVED'],
    ]);
  });

  it('the hourly pass closes it once the days to reopen it have passed', async () => {
    const afterWindow = new Date(`${issue.reopenUntil}T12:00:00.000Z`);
    afterWindow.setUTCDate(afterWindow.getUTCDate() + 2);

    const pass = await h.sweepIssues(afterWindow);

    expect(pass.closed).toBe(1);
    expect(h.dataOf<IssueWire>(await h.readIssue(issue.id, member.account).expect(200)).state).toBe('CLOSED');
  });
});
