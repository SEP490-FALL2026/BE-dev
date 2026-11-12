import request from 'supertest';
import type { ApiAccount } from '../../support/api-accounts';
import { loginAs } from '../../support/api-accounts';
import { DashboardHarness, OVERVIEW_PATHS, type OverviewWire, type SectionWire } from '../../support/dashboard-harness';
import type { Department, Person } from '../../support/request-harness';

const h = new DashboardHarness();

const SECTION_KEYS = {
  employee: ['expiringRights', 'requests', 'saasIssues', 'softwareRights'],
  manager: [
    'approvedBudgetLines',
    'budgetProposals',
    'departmentSoftware',
    'ghostSeats',
    'needApprovals',
    'spendQueue',
    'spending',
    'transferReviews',
  ],
  itAdmin: [
    'cancellationDeadlines',
    'discrepancies',
    'ghostSeats',
    'grantTasks',
    'licenseKeys',
    'offboardingHandovers',
    'revocationTasks',
    'saasIssues',
    'termsToReview',
    'unconfirmedDevices',
  ],
  superAdmin: [
    'accountCandidates',
    'approverConfiguration',
    'backgroundJobs',
    'congestion',
    'departmentsWithoutHead',
    'departmentsWithoutItAdmin',
    'personnelNotices',
    'superAdminRole',
  ],
};

const missing = (reason: string): SectionWire => ({
  state: 'NOT_AVAILABLE',
  count: null,
  sourceOperationId: null,
  reason,
});
const countedAs = (count: number, sourceOperationId: string): SectionWire => ({
  state: 'COUNTED',
  count,
  sourceOperationId,
  reason: null,
});

/**
 * `US-12-15` AC-2, AC-3, AC-4, AC-7: the four role overviews over HTTP on real PostgreSQL. Two departments, P-DES (head H1, IT Admin
 * IT1) and P-ENG (head H2, IT Admin IT2), each with people, seats, reports, open tasks, a departure and a transfer into it. Each overview
 * counts only what is in the caller's scope, each count equals the total of the existing list that shows the rows to the same caller,
 * and a section without a source says so instead of a zero. Each overview answers its own role only.
 */
describe('role overviews (integration, real PostgreSQL)', () => {
  let des: { department: Department; head: Person };
  let eng: { department: Department; head: Person };
  let it1: ApiAccount;
  let it2: Person;
  let e1: Person;
  let e2: Person;
  let e3: Person;
  const seats: Record<string, string> = {};
  let desGrantTask: string;

  const overviewOf = (path: string, account: ApiAccount): Promise<OverviewWire> => h.overviewOf(path, account);

  beforeAll(async () => {
    await h.start();
    it1 = h.it1;
    des = await h.departmentWithHead('P-DES');
    eng = await h.departmentWithHead('P-ENG');
    it2 = await h.staff(eng.department, 'G-IT2', 'IT_ADMIN');
    await h.setItAdminInCharge(des.department, { employeeId: it1.employeeId, account: it1 });
    await h.setItAdminInCharge(eng.department, it2);
    // A department nobody heads and nobody is in charge of.
    await h.departmentWithUnit('P-HR');

    e1 = await h.employeeIn(des.department, 'D-E1');
    e2 = await h.employeeIn(eng.department, 'G-E2');
    e3 = await h.employeeIn(des.department, 'D-E3');
    const figma = await h.subscription(10, 'K2', des.department.id);
    const notion = await h.subscription(10, 'K1', des.department.id);
    const engTool = await h.subscription(10, 'K2', eng.department.id);
    const office = await h.subscription(10, 'K4', des.department.id);
    seats.e1Figma = await h.rightOf(e1, 'D-E1', { subscriptionId: figma });
    seats.e1Notion = await h.rightOf(e1, 'D-E1', { subscriptionId: notion }, h.inDays(5));
    seats.e2Tool = await h.rightOf(e2, 'G-E2', { subscriptionId: engTool });

    // The reports go to the IT Admin in charge of the reporter's department.
    await h.reportOn(e1.account, seats.e1Figma);
    await h.reportOn(e2.account, seats.e2Tool);

    // Open work: a grant and a revocation in IT1's charge, a grant in IT2's.
    const d4 = await h.employeeIn(des.department, 'D-E4', []);
    desGrantTask = await h.openTask(await h.rightOf(d4, 'D-E4', { subscriptionId: figma }), 'GRANT', it1.employeeId);
    await h.openTask(await h.rightOf(d4, 'D-E4', { subscriptionId: notion }), 'REVOKE', it1.employeeId);
    const g4 = await h.employeeIn(eng.department, 'G-E4', []);
    await h.openTask(await h.rightOf(g4, 'G-E4', { subscriptionId: engTool }), 'GRANT', it2.employeeId);

    // A departure handing over in each department.
    await h.recordedCase(await h.employeeIn(des.department, 'D-LV', []));
    await h.recordedCase(await h.employeeIn(eng.department, 'G-LV', []));

    // A transfer into P-DES (opens a review for H1) and one into P-ENG (for H2).
    const toDes = await h.employeeIn(eng.department, 'G-MV', []);
    await h.rightOf(toDes, 'G-MV', { subscriptionId: engTool });
    await h.moveToday(toDes, des.department);
    const toEng = await h.employeeIn(des.department, 'D-MV', []);
    await h.rightOf(toEng, 'D-MV', { subscriptionId: figma });
    await h.moveToday(toEng, eng.department);

    // Keys in the vault of the K4 purchase, and a notice of H1 waiting for the Super Admin.
    await request(h.server())
      .post('/api/v1/license-keys/imports')
      .set(h.as(it1))
      .send({ subscriptionId: office, keys: ['DASH1-AAAAA-BBBBB-CCCCC-11111', 'DASH2-AAAAA-BBBBB-CCCCC-22222'] })
      .expect(201);
    await h.sentNotice({ employeeId: e3.employeeId, kind: 'DEPARTURE', proposedOn: h.day(5) }, des.head.account);
    const k5Plan = await h.plan('K5');
    await h.sent(e1, k5Plan);
    // What the overviews must not count: a request of e1 that was withdrawn, a draft of e1, and a request of the head of P-DES
    // (the spending approver decides it, so it is not a step of the head).
    const withdrawn = await h.sent(e1, await h.plan('K5'));
    await h.withdrawRequest(withdrawn.id, { reason: 'No longer needed' }, e1.account).expect(200);
    await request(h.server())
      .post('/api/v1/access-requests/drafts')
      .set(h.as(e1.account))
      .send({ kind: 'INDIVIDUAL', planId: k5Plan, businessReason: 'Design the new brand' })
      .expect(201);
    await h.sent(des.head, await h.plan('K5'));
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  describe('the Employee overview', () => {
    it('BR-MF1-02/07: counts a request awaiting requester revision as open and removes it only when withdrawn', async () => {
      const person = await h.employeeIn(des.department, 'D-REVISION');
      const sent = await h.sent(person, await h.plan('K5'));
      await h.ctx.sql.query(`UPDATE access_requests SET state = 'AWAITING_REQUESTER_REVISION' WHERE id = $1`, [
        sent.id,
      ]);

      expect((await overviewOf(OVERVIEW_PATHS.employee, person.account)).sections.requests).toEqual(
        countedAs(1, 'meAccessRequestList'),
      );
      expect(await h.totalOf('/api/v1/me/access-requests', person.account, { view: 'open' })).toBe(1);
      await h.withdrawRequest(sent.id, { reason: 'No longer needed' }, person.account).expect(200);
      expect((await overviewOf(OVERVIEW_PATHS.employee, person.account)).sections.requests).toEqual(
        countedAs(0, 'meAccessRequestList'),
      );
    });

    // US-12-15 AC-2: the software held (K1 to K5), the right about to end, the reports and the open requests.
    it('counts the rights and reports of the caller as their own lists show them', async () => {
      const overview = await overviewOf(OVERVIEW_PATHS.employee, e1.account);
      const rights = await h.itemsOf<{ expiringSoon: boolean }>('/api/v1/me/software-rights', e1.account);

      expect(overview.asOf).toBe(h.today());
      expect(Object.keys(overview.sections).sort()).toEqual(SECTION_KEYS.employee);
      expect(overview.sections.softwareRights).toEqual(countedAs(rights.length, 'meSoftwareRightList'));
      expect(rights).toHaveLength(2);
      expect(overview.sections.expiringRights).toEqual(
        countedAs(rights.filter((right) => right.expiringSoon).length, 'meSoftwareRightList'),
      );
      expect(overview.sections.expiringRights.count).toBe(1);
      expect(overview.sections.saasIssues).toEqual(
        countedAs(await h.totalOf('/api/v1/saas-issues', e1.account, { scope: 'mine' }), 'saasIssueList'),
      );
      expect(overview.sections.saasIssues.count).toBe(1);
      expect(overview.sections.requests).toEqual(
        countedAs(await h.totalOf('/api/v1/me/access-requests', e1.account, { view: 'open' }), 'meAccessRequestList'),
      );
      // One is open; the withdrawn request and the draft of e1 are in no count of it.
      expect(overview.sections.requests.count).toBe(1);
      expect(await h.totalOf('/api/v1/me/access-requests', e1.account)).toBe(2);
    });

    it('never counts the rights or reports of another person', async () => {
      const overview = await overviewOf(OVERVIEW_PATHS.employee, e2.account);

      expect(overview.sections.softwareRights.count).toBe(1);
      expect(overview.sections.expiringRights.count).toBe(0);
      expect(overview.sections.saasIssues.count).toBe(1);
    });

    it('answers true zeros for a person with nothing, and zero open requests', async () => {
      const overview = await overviewOf(OVERVIEW_PATHS.employee, e3.account);

      expect(overview.sections.softwareRights).toEqual(countedAs(0, 'meSoftwareRightList'));
      expect(overview.sections.saasIssues).toEqual(countedAs(0, 'saasIssueList'));
      expect(overview.sections.requests).toEqual(
        countedAs(await h.totalOf('/api/v1/me/access-requests', e3.account, { view: 'open' }), 'meAccessRequestList'),
      );
      expect(overview.sections.requests.count).toBe(0);
    });

    it('counts zero open requests for the Super Admin without adding any role', async () => {
      const token = await loginAs(h.ctx.app, h.seed.superAdmin.email, h.seed.superAdmin.password);
      const overview = await overviewOf(OVERVIEW_PATHS.employee, { ...h.sa, accessToken: token });
      expect(overview.sections.requests).toEqual(countedAs(0, 'meAccessRequestList'));
    });
  });

  describe('the head overview', () => {
    // US-12-15 AC-3: the department of the head only; cost and ghost seats say they have no source; the need queue is counted.
    it('reads the department H1 heads, counted as its lists show it to H1', async () => {
      const overview = await overviewOf(OVERVIEW_PATHS.manager, des.head.account);

      expect(overview.department).toEqual({ id: des.department.id, code: 'P-DES', name: 'Department P-DES' });
      expect(Object.keys(overview.sections).sort()).toEqual(SECTION_KEYS.manager);
      expect(overview.sections.departmentSoftware).toEqual(
        countedAs(
          await h.totalOf(`/api/v1/departments/${des.department.id}/tools-in-use`, des.head.account),
          'departmentToolsInUse',
        ),
      );
      expect(overview.sections.transferReviews).toEqual(
        countedAs(
          await h.totalOf('/api/v1/transfer-reviews', des.head.account, { status: 'OPEN' }),
          'transferReviewList',
        ),
      );
      expect(overview.sections.transferReviews.count).toBe(1);
      expect(overview.sections.spending).toEqual(missing('FINANCE_FIGURES_NOT_DELIVERED'));
      expect(overview.sections.ghostSeats).toEqual(countedAs(0, 'ghostSeatQueueList'));
      expect(overview.sections.needApprovals).toEqual(
        countedAs(await h.totalOf('/api/v1/need-decisions', des.head.account), 'needDecisionList'),
      );
      // The request of e1 is the one step of H1; H1's own request is the spending approver's.
      expect(overview.sections.needApprovals.count).toBe(1);
      expect(overview.sections.spendQueue).toEqual({
        state: 'AT_SOURCE',
        count: null,
        sourceOperationId: 'spendQueueList',
        reason: null,
      });
    });

    it('keeps each head to their own department', async () => {
      const ofDes = await overviewOf(OVERVIEW_PATHS.manager, des.head.account);
      const ofEng = await overviewOf(OVERVIEW_PATHS.manager, eng.head.account);

      expect(ofEng.department?.code).toBe('P-ENG');
      expect(ofEng.sections.transferReviews.count).toBe(1);
      expect(ofEng.sections.departmentSoftware.count).toBe(
        await h.totalOf(`/api/v1/departments/${eng.department.id}/tools-in-use`, eng.head.account),
      );
      expect(ofEng.sections.departmentSoftware.count).not.toBe(ofDes.sections.departmentSoftware.count);
      expect(ofEng.sections.needApprovals).toEqual(
        countedAs(await h.totalOf('/api/v1/need-decisions', eng.head.account), 'needDecisionList'),
      );
      expect(ofEng.sections.needApprovals.count).toBe(0);
    });
  });

  describe('the IT Admin overview', () => {
    // US-12-15 AC-4: the work in the IT Admin's charge and the departments in their scope; devices have no source; the discrepancies are the open findings of the vendor usage import.
    it('counts the work of IT1 as the queues show it to IT1', async () => {
      const overview = await overviewOf(OVERVIEW_PATHS.itAdmin, it1);
      const sections = overview.sections;

      expect(Object.keys(sections).sort()).toEqual(SECTION_KEYS.itAdmin);
      expect(overview.scope).toEqual({ departments: await h.totalOf('/api/v1/departments', it1) });
      expect(sections.grantTasks).toEqual(countedAs(1, 'provisioningTaskList'));
      expect(sections.revocationTasks).toEqual(countedAs(1, 'provisioningTaskList'));
      expect((sections.grantTasks.count ?? 0) + (sections.revocationTasks.count ?? 0)).toBe(
        await h.totalOf('/api/v1/provisioning-tasks', it1, { scope: 'MINE', status: 'QUEUED' }),
      );
      expect(sections.saasIssues).toEqual(
        countedAs(await h.totalOf('/api/v1/saas-issues', it1, { scope: 'assigned' }), 'saasIssueList'),
      );
      expect(sections.saasIssues.count).toBe(1);
      expect(sections.offboardingHandovers).toEqual(
        countedAs(await h.totalOf('/api/v1/offboarding-cases', it1, { state: 'HANDING_OVER' }), 'offboardingCaseList'),
      );
      expect(sections.offboardingHandovers.count).toBe(1);
      expect(sections.licenseKeys).toEqual(countedAs(2, 'licenseKeyList'));
      expect(sections.unconfirmedDevices).toEqual(
        countedAs(await h.totalOf('/api/v1/devices', it1, { state: 'AWAITING_ACKNOWLEDGEMENT' }), 'deviceList'),
      );
      expect(sections.discrepancies).toEqual(countedAs(0, 'usageNoAssignmentFindingList'));
      expect(sections.cancellationDeadlines).toMatchObject({
        state: 'AT_SOURCE',
        sourceOperationId: 'subscriptionList',
      });
    });

    it('does not count the work of another department for IT2', async () => {
      const overview = await overviewOf(OVERVIEW_PATHS.itAdmin, it2.account);

      expect(overview.sections.grantTasks.count).toBe(1);
      expect(overview.sections.revocationTasks.count).toBe(0);
      expect(overview.sections.saasIssues.count).toBe(1);
      expect(overview.sections.offboardingHandovers.count).toBe(
        await h.totalOf('/api/v1/offboarding-cases', it2.account, { state: 'HANDING_OVER' }),
      );
    });
  });

  describe('the Super Admin overview', () => {
    // US-12-15 AC-7: operations of the system and the organization only; no seat, approval or spending section.
    it('counts the departments that miss someone and the notices waiting, as their lists show them', async () => {
      const overview = await overviewOf(OVERVIEW_PATHS.superAdmin, h.sa);
      const warnings = await h.itemsOf<{ warning: string }>('/api/v1/department-warnings', h.sa);

      expect(Object.keys(overview.sections).sort()).toEqual(SECTION_KEYS.superAdmin);
      expect(overview.sections.departmentsWithoutHead).toEqual(
        countedAs(warnings.filter((item) => item.warning === 'MISSING_HEAD').length, 'departmentWarningList'),
      );
      expect(overview.sections.departmentsWithoutItAdmin).toEqual(
        countedAs(warnings.filter((item) => item.warning === 'MISSING_IT_ADMIN').length, 'departmentWarningList'),
      );
      expect(overview.sections.departmentsWithoutHead.count).toBeGreaterThanOrEqual(1);
      expect(overview.sections.personnelNotices).toEqual(
        countedAs(
          await h.totalOf('/api/v1/personnel-notices', h.sa, { status: 'PENDING_VERIFICATION' }),
          'personnelNoticeList',
        ),
      );
      expect(overview.sections.personnelNotices.count).toBe(1);
      expect(overview.sections.backgroundJobs).toEqual(missing('NO_DATA_SOURCE'));
    });
  });

  // The role matrix on the real guard and accounts: each overview answers its own role only.
  it('answers each overview to its role only, and nothing without a token', async () => {
    const callers: [string, ApiAccount][] = [
      ['employee', e1.account],
      ['head', des.head.account],
      ['IT Admin', it1],
      ['Super Admin', h.sa],
      ['Finance', h.finance],
      ['no role', h.employee],
    ];
    const allowed: Record<string, string> = {
      employee: OVERVIEW_PATHS.employee,
      head: OVERVIEW_PATHS.manager,
      'IT Admin': OVERVIEW_PATHS.itAdmin,
      'Super Admin': OVERVIEW_PATHS.superAdmin,
    };
    const answers: string[] = [];
    for (const path of Object.values(OVERVIEW_PATHS)) {
      answers.push(`${path} none ${(await h.overview(path, null)).status}`);
      for (const [name, account] of callers)
        answers.push(`${path} ${name} ${(await h.overview(path, account)).status}`);
    }

    const expected = Object.values(OVERVIEW_PATHS).flatMap((path) => [
      `${path} none 401`,
      ...callers.map(
        ([name]) => `${path} ${name} ${path === OVERVIEW_PATHS.employee || allowed[name] === path ? 200 : 403}`,
      ),
    ]);
    expect(answers).toEqual(expected);
  });

  it('names in every section only operations the committed document has', async () => {
    const documented = h.documentedOperationIds();
    const named = [
      await overviewOf(OVERVIEW_PATHS.employee, e1.account),
      await overviewOf(OVERVIEW_PATHS.manager, des.head.account),
      await overviewOf(OVERVIEW_PATHS.itAdmin, it1),
      await overviewOf(OVERVIEW_PATHS.superAdmin, h.sa),
    ].flatMap((overview) => Object.values(overview.sections).flatMap((section) => section.sourceOperationId ?? []));

    expect(named.length).toBeGreaterThan(20);
    expect(named.filter((id) => !documented.has(id))).toEqual([]);
  });

  // US-12-15 AC-4, US-01-11: IT2 takes over a task of P-DES; the audit names both, and the task stays in IT1's overview.
  it('lets IT2 work a task of P-DES, with both people in the audit trail and the task still counted for IT1', async () => {
    await request(h.server())
      .post(`/api/v1/provisioning-tasks/${desGrantTask}/claim`)
      .set(h.as(it2.account))
      .expect(200);

    const { rows } = await h.ctx.sql.query<{
      actor_app_user_id: string;
      after: { defaultResponsibleEmployeeId: string };
    }>(
      `SELECT actor_app_user_id, after FROM audit_events WHERE resource_type = 'ProvisioningTask' AND resource_id = $1`,
      [desGrantTask],
    );
    expect(rows.map((row) => [row.actor_app_user_id, row.after.defaultResponsibleEmployeeId])).toEqual([
      [it2.account.appUserId, it1.employeeId],
    ]);
    expect((await overviewOf(OVERVIEW_PATHS.itAdmin, it1)).sections.grantTasks.count).toBe(1);
    expect((await overviewOf(OVERVIEW_PATHS.itAdmin, it2.account)).sections.grantTasks.count).toBe(1);
  });
});
