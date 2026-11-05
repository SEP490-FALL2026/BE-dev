import { randomUUID } from 'node:crypto';
import type { ApiAccount } from '../../support/api-accounts';
import { ServiceAccountHarness } from '../../support/service-account-harness';
import type { Unit } from '../../support/spend-harness';

const h = new ServiceAccountHarness();
const M = 1_000_000;
const CHECK = '23514';
const FINAL = '55000';
const EXCLUDED = '23P01';
const PURPOSE = 'Build bot of the CI pipeline';
const SHARED_MAILBOX = 'Shared mailbox of three people who sign in';

interface TaskWire {
  id: string;
  status: string;
  beneficiary: { employeeId: string } | null;
}
interface AssignmentRow {
  kind: string;
  source: string;
  employee_id: string;
  reason: string | null;
  cost_center_id: string | null;
  owning_department_id: string | null;
  account_identifier: string;
  normalized_account_identifier: string;
}

/** The SQLSTATE a rejected statement carries: the constraint, not the application, said no. */
async function sqlState(text: string, values: unknown[] = []): Promise<string | null> {
  try {
    await h.ctx.sql.query(text, values);

    return null;
  } catch (error) {
    return (error as { code?: string }).code ?? 'unknown';
  }
}

describe('a request for a service account after the installation over PostgreSQL (US-05-21)', () => {
  let subscriptionId: string;
  let paidPlan: string;
  let fullSubscription: string;
  let fullPlan: string;
  let k4Plan: string;
  let internalPlan: string;
  /** The IT Admins a test made besides the one of the installation, so that a test can lock them all. */
  const otherItAdmins: ApiAccount[] = [];
  let counter = 0;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    // The seats are set up while the baseline is open: three free of ten on one subscription, none free on the other.
    // The accounts of this suite belong to many departments, and a request is priced by the subscription of its own department (F38):
    // the harness gives every department the suite makes a subscription of each plan the seeded department holds (owned-subscriptions.ts).
    subscriptionId = await h.subscription(10, 'K2');
    paidPlan = await h.planOf(subscriptionId);
    fullSubscription = await h.subscription(1, 'K2');
    fullPlan = await h.planOf(fullSubscription);
    await h.person('SA-HOLDER');
    await h.written({ subscriptionId: fullSubscription }, [
      { employee_code: 'SA-HOLDER', account_identifier: 'sa-holder@acme.vn' },
    ]);
    k4Plan = await h.planOf(await h.subscription(5, 'K4'));
    internalPlan = await h.plan('K5');
    for (const plan of [paidPlan, fullPlan]) {
      await h
        .declareTaxProfile((await h.vendorOf(plan)).id, [{ taxType: 'GTGT', ratePercent: '10', deductible: true }])
        .expect(200);
    }
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  /** A department with a head and a member, and a budget of 100 million with 20 held and 40 spent. */
  const example = async (): Promise<Unit> => {
    counter += 1;
    const u = await h.departmentWithHead(`P-S${counter}`);
    await h.budgetFor(u, { total: 100 * M, held: 20 * M, spent: 40 * M });

    return u;
  };
  const taskOf = async (requestId: string) =>
    (
      await h.ctx.sql.query<{ id: string; status: string }>(
        `SELECT id, status FROM provisioning_tasks WHERE request_id = $1`,
        [requestId],
      )
    ).rows[0];
  const assignmentOf = async (requestId: string) =>
    (
      await h.ctx.sql.query<AssignmentRow>(
        `SELECT a.kind::text, a.source::text, a.employee_id, a.reason, a.cost_center_id, a.owning_department_id,
                a.account_identifier, a.normalized_account_identifier
           FROM license_assignments a JOIN provisioning_tasks t ON t.assignment_id = a.id WHERE t.request_id = $1`,
        [requestId],
      )
    ).rows[0];
  const commitmentOf = async (requestId: string) =>
    (
      await h.ctx.sql.query<{ state: string; amount_minor: string; released_minor: string; cost_center_id: string }>(
        `SELECT state::text, amount_minor::text, released_minor::text, cost_center_id FROM budget_commitments WHERE request_id = $1`,
        [requestId],
      )
    ).rows[0];
  const ledgerOf = async (requestId: string) =>
    (
      await h.ctx.sql.query<{ reason: string; amount_minor: string }>(
        `SELECT r.reason::text, r.amount_minor::text
           FROM budget_commitment_releases r JOIN budget_commitments c ON c.id = r.commitment_id
          WHERE c.request_id = $1`,
        [requestId],
      )
    ).rows;
  const events = async (action: string, requestId: string) =>
    (
      await h.ctx.sql.query<{ after: Record<string, unknown> }>(
        `SELECT after FROM audit_events WHERE action = $1 AND (resource_id = $2 OR after ->> 'requestId' = $2)`,
        [action, requestId],
      )
    ).rows;
  const boundaryOf = async (requestId: string) =>
    (
      await h.ctx.sql.query<{
        boundary_state: string;
        boundary_reason: string | null;
        boundary_decided_by_employee_id: string | null;
        boundary_self_executed: boolean;
      }>(
        `SELECT boundary_state::text, boundary_reason, boundary_decided_by_employee_id, boundary_self_executed
           FROM access_request_service_accounts WHERE request_id = $1`,
        [requestId],
      )
    ).rows[0];
  const granted = async (requestId: string, identifier: string, extra: object = {}, account?: ApiAccount) =>
    h.dataOf<{ task: TaskWire }>(
      await h.grant({ requestId, subscriptionId, accountIdentifier: identifier, ...extra }, account).expect(201),
    ).task;
  const codeOf = (response: Parameters<typeof h.codeOf>[0]) => h.codeOf(response);

  describe('what may be sent (AC-1, AC-2)', () => {
    it('is refused while the seat baseline of the installation is open, and writes nothing (FR-9.4)', async () => {
      const u = await h.departmentWithHead('P-S0');
      const before = await h.requestRows();
      const details = await h.count('access_request_service_accounts');

      const refused = await h.submitService(h.serviceForm(paidPlan), u.member.account).expect(409);

      expect(codeOf(refused)).toBe('SERVICE_ACCOUNT_REQUEST.BASELINE_NOT_CLOSED');
      expect(await h.requestRows()).toBe(before);
      expect(await h.count('access_request_service_accounts')).toBe(details);
      await h.closeBaseline().expect(200);
    });

    it('needs the purpose and the identifier the sender expects, and writes nothing without them', async () => {
      const u = await h.departmentWithHead('P-S0B');
      const before = await h.requestRows();

      for (const body of [
        { ...h.serviceForm(paidPlan), purpose: undefined },
        { ...h.serviceForm(paidPlan), expectedIdentifier: undefined },
        h.serviceForm(paidPlan, { purpose: '   ' }),
        h.serviceForm(paidPlan, { expectedIdentifier: '' }),
        h.serviceForm(paidPlan, { responsibleEmployeeId: u.head.employeeId }),
      ]) {
        const refused = await h.submitService(body, u.member.account).expect(422);
        expect(codeOf(refused)).toBe('VALIDATION_ERROR');
      }
      expect(await h.requestRows()).toBe(before);
    });

    it('refuses a plan granted by a key tied to a device, a plan that does not exist, retired software and a sender with no department', async () => {
      const u = await h.departmentWithHead('P-S0C');
      const before = await h.requestRows();

      expect(codeOf(await h.submitService(h.serviceForm(k4Plan), u.member.account).expect(422))).toBe(
        'SERVICE_ACCOUNT_REQUEST.PLAN_NOT_SUPPORTED',
      );
      expect(codeOf(await h.submitService(h.serviceForm(randomUUID()), u.member.account).expect(404))).toBe(
        'ACCESS_REQUEST.PLAN_NOT_FOUND',
      );
      const retired = await h.plan('K5');
      await h.ctx.sql.query(
        `UPDATE applications SET catalog_status = 'RETIRED', retired_at = now()
          WHERE id = (SELECT application_id FROM plans WHERE id = $1)`,
        [retired],
      );
      expect(codeOf(await h.submitService(h.serviceForm(retired), u.member.account).expect(409))).toBe(
        'ACCESS_REQUEST.APPLICATION_RETIRED',
      );
      const lonely = await h.unplacedStaff('SA-LONELY');

      // D-S21: a sender with no department is refused as a party of the request (422 REQUEST_PARTY.INELIGIBLE, UNPLACED).
      const unplaced = await h.submitService(h.serviceForm(paidPlan), lonely.account).expect(422);
      expect(codeOf(unplaced)).toBe('REQUEST_PARTY.INELIGIBLE');
      expect((unplaced.body as { error: { details: { reason: string } } }).error.details.reason).toBe('UNPLACED');
      expect(await h.requestRows()).toBe(before);
    });

    it('keeps the account of a non-human subject for the sender, charged to the Unit of their department (AC-1)', async () => {
      const u = await example();

      const sent = await h.sentService(u.member, paidPlan, { termMonths: 12 });

      expect(sent).toMatchObject({
        type: 'SERVICE_ACCOUNT',
        branch: 'PAID_IN_CATALOG',
        state: 'PENDING',
        department: { id: u.department.id },
        costCenter: { id: u.department.unitId },
        requester: { employeeId: u.member.employeeId },
        beneficiary: { employeeId: u.member.employeeId },
        policy: { hasSpendStep: true },
        pricing: { status: 'PRICED', amount: { currency: 'VND' } },
        needStep: { state: 'PENDING', routingRow: 1, assignee: { employeeId: u.head.employeeId } },
        serviceAccount: {
          purpose: PURPOSE,
          expectedIdentifier: 'ci-bot-2',
          responsible: { employeeId: u.member.employeeId },
          boundary: { state: 'PENDING', reason: null, decidedBy: null, decidedAt: null, selfExecuted: false },
        },
      });
      // The price of the plan for the term, for one subject: 1 million a month, twelve months, once.
      expect(Number(sent.pricing.amount?.amount)).toBe(12 * M);
      const submitted = await events('ACCESS_REQUEST.SUBMITTED', sent.id);
      expect(submitted).toMatchObject([{ after: { type: 'SERVICE_ACCOUNT' } }]);
      expect((await events('ACCESS_REQUEST.NEED_STEP_ROUTED', sent.id)).length).toBe(1);
      const fetched = await h.fetchService(sent.id, u.member.account);
      expect(fetched.serviceAccount?.purpose).toBe(PURPOSE);
    });

    it('is the paid branch with its spend step whether the subscription has seats left or none, and waits in the queue of the head (AC-2)', async () => {
      const u = await example();

      for (const plan of [paidPlan, fullPlan]) {
        const sent = await h.sentService(u.member, plan);
        await h.decide(sent.id, { decision: 'APPROVE', spend: { offPlan: true } }, u.head.account).expect(200);

        expect(sent).toMatchObject({ branch: 'PAID_IN_CATALOG', policy: { hasSpendStep: true } });
        expect(await h.state(sent.id)).toBe('AWAITING_SPEND_SUBMISSION');
        const queue = h.dataOf<{ items: { requestId: string }[] }>(
          await h.spendQueue(u.head.account, { pageSize: 100 }).expect(200),
        ).items;
        expect(queue.map((item) => item.requestId)).toContain(sent.id);
      }
    });

    it('finds no active budget only when the Unit of the department has no budget of the year (AC-2)', async () => {
      const funded = await example();
      const bare = await h.departmentWithHead('P-S-BARE');

      const withBudget = await h.approvedService(funded, funded.member, paidPlan, 10 * M);
      const sent = await h.sentService(bare.member, paidPlan);
      await h.decide(sent.id, { decision: 'APPROVE', spend: { offPlan: true } }, bare.head.account).expect(200);
      await h.setPayments(sent.id, { amount: 10 * M });
      await h.sendOn([sent.id], bare.head.account).expect(201);

      expect(await h.state(withBudget)).toBe('AWAITING_EXECUTION');
      expect(await h.state(sent.id)).toBe('AWAITING_FINANCE_REVIEW');
      const years = h.dataOf<{ items: { code: string }[] }>(await h.checkYears(sent.id).expect(200)).items;
      expect(years.map((year) => year.code)).toEqual(['NO_ACTIVE_BUDGET']);
    });

    it('has no kind for an account shared by people, whether of a request or of an assignment (QĐ-75)', async () => {
      const values = async (type: string) =>
        (
          await h.ctx.sql.query<{ label: string }>(
            `SELECT e.enumlabel AS label FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
              WHERE t.typname = $1 ORDER BY e.enumsortorder`,
            [type],
          )
        ).rows.map((row) => row.label);

      expect(await values('AccessRequestType')).toEqual(['GRANT', 'SERVICE_ACCOUNT', 'RENEWAL', 'GROUP_GRANT']);
      expect(await values('AssignmentKind')).toEqual(['PERSONAL', 'SERVICE']);
    });
  });

  describe('the boundary the IT Admin decides, and the grant that follows (AC-3, AC-4)', () => {
    it('keeps the grant shut until the boundary is accepted, then takes only an identifier the IT Admin enters, and makes a service seat of it (AC-1, AC-3, AC-4)', async () => {
      const u = await example();
      const id = await h.approvedService(u, u.member, paidPlan, 15 * M);
      expect(await h.state(id)).toBe('AWAITING_EXECUTION');
      // The commitment went into the Unit of the department of the request when the approver decided.
      expect(await commitmentOf(id)).toMatchObject({
        state: 'HELD',
        amount_minor: String(15 * M),
        cost_center_id: u.department.unitId,
      });
      const assignments = await h.count('license_assignments');

      const shut = await h.grant({ requestId: id, subscriptionId, accountIdentifier: 'github-ci-bot' }).expect(409);
      expect(codeOf(shut)).toBe('PROVISIONING.REQUEST_BOUNDARY_NOT_CHECKED');
      expect(await h.state(id)).toBe('AWAITING_EXECUTION');

      const reviewed = h.dataOf<{
        request: { state: string; serviceAccount: { boundary: { decidedBy: object | null } } };
      }>(await h.reviewService(id, { decision: 'ACCEPT' }).expect(200)).request;
      expect(reviewed).toMatchObject({
        state: 'AWAITING_EXECUTION',
        serviceAccount: { boundary: { state: 'ACCEPTED', reason: null, selfExecuted: false } },
      });
      expect(reviewed.serviceAccount.boundary.decidedBy).not.toBeNull();

      // The identifier is the IT Admin's: missing, empty and spaces alone are refused, and the request is still to be carried out.
      for (const body of [
        { requestId: id, subscriptionId },
        { requestId: id, subscriptionId, accountIdentifier: '' },
        { requestId: id, subscriptionId, accountIdentifier: '    ' },
      ]) {
        expect(codeOf(await h.grant(body).expect(422))).toBe('PROVISIONING.ACCOUNT_IDENTIFIER_REQUIRED');
      }
      expect(await h.state(id)).toBe('AWAITING_EXECUTION');
      expect(await taskOf(id)).toBeUndefined();
      expect(await h.count('license_assignments')).toBe(assignments);

      const task = await granted(id, '  github-ci-bot  ');

      expect(await h.state(id)).toBe('EXECUTING');
      expect(task.beneficiary?.employeeId).toBe(u.member.employeeId);
      expect(await assignmentOf(id)).toEqual({
        kind: 'SERVICE',
        source: 'REQUEST',
        employee_id: u.member.employeeId,
        reason: PURPOSE,
        cost_center_id: u.department.unitId,
        owning_department_id: u.department.id,
        account_identifier: 'github-ci-bot',
        normalized_account_identifier: 'github-ci-bot',
      });
      expect(await commitmentOf(id)).toMatchObject({ state: 'HELD', released_minor: '0' });
      const created = await events('LICENSE_ASSIGNMENT.CREATED', id);
      expect(created).toMatchObject([
        { after: { kind: 'SERVICE', owningDepartmentId: u.department.id, requestId: id } },
      ]);
    });

    it('keeps the identifier and the purpose out of the audit trail, whoever wrote the event', async () => {
      const text = (
        await h.ctx.sql.query<{ text: string }>(
          `SELECT coalesce(string_agg(coalesce(before::text, '') || coalesce(after::text, ''), ' '), '') AS text FROM audit_events`,
        )
      ).rows[0].text;

      for (const secret of ['github-ci-bot', 'ci-bot-2', PURPOSE]) expect(text).not.toContain(secret);
    });

    it('refuses the shared mailbox of three people: the request ends as refused, what was held goes back, nothing is granted (AC-3)', async () => {
      const u = await example();
      const sent = await h.sentService(u.member, paidPlan, { purpose: SHARED_MAILBOX });
      await h.decide(sent.id, { decision: 'APPROVE', spend: { offPlan: true } }, u.head.account).expect(200);
      await h.setPayments(sent.id, { amount: 15 * M });
      await h.sendOn([sent.id], u.head.account).expect(201);
      await h.decideSpend(sent.id, { decision: 'APPROVE' }, h.boss.account).expect(200);
      expect(await commitmentOf(sent.id)).toMatchObject({ state: 'HELD' });
      const assignments = await h.count('license_assignments');
      const tasks = await h.count('provisioning_tasks');

      const response = await h
        .reviewService(sent.id, { decision: 'REJECT', reason: 'A mailbox shared by people is not a service account' })
        .expect(200);

      expect(h.dataOf<{ request: object }>(response).request).toMatchObject({
        state: 'IT_REJECTED',
        serviceAccount: {
          boundary: { state: 'REJECTED', reason: 'A mailbox shared by people is not a service account' },
        },
      });
      expect(await commitmentOf(sent.id)).toMatchObject({ state: 'RELEASED', released_minor: String(15 * M) });
      expect(await ledgerOf(sent.id)).toEqual([{ reason: 'REQUEST_CANCELLED', amount_minor: String(15 * M) }]);
      expect(await taskOf(sent.id)).toBeUndefined();
      expect(await h.count('license_assignments')).toBe(assignments);
      expect(await h.count('provisioning_tasks')).toBe(tasks);
      expect(await events('ACCESS_REQUEST.SERVICE_ACCOUNT_BOUNDARY_REJECTED', sent.id)).toMatchObject([
        { after: { requestState: 'IT_REJECTED', released: true, selfExecuted: false } },
      ]);
      // A request that ended is not granted and its verdict is not given twice.
      expect(
        codeOf(await h.grant({ requestId: sent.id, subscriptionId, accountIdentifier: 'x-bot' }).expect(409)),
      ).toBe('PROVISIONING.REQUEST_ENDED');
      expect(codeOf(await h.reviewService(sent.id, { decision: 'ACCEPT' }).expect(409))).toBe(
        'SERVICE_ACCOUNT_REQUEST.BOUNDARY_ALREADY_DECIDED',
      );
    });

    it('refuses a service account of internal software, which holds nothing to give back (AC-3)', async () => {
      const u = await example();
      const id = await h.approvedInternalService(u, u.member, internalPlan);
      expect(await h.state(id)).toBe('AWAITING_EXECUTION');
      const ledger = await h.count('budget_commitment_releases');

      await h.reviewService(id, { decision: 'REJECT', reason: SHARED_MAILBOX }).expect(200);

      expect(await h.state(id)).toBe('IT_REJECTED');
      expect(await commitmentOf(id)).toBeUndefined();
      expect(await h.count('budget_commitment_releases')).toBe(ledger);
      expect(await events('ACCESS_REQUEST.SERVICE_ACCOUNT_BOUNDARY_REJECTED', id)).toMatchObject([
        { after: { released: false } },
      ]);
    });

    it('grants a service account of internal software with no subscription, under an identifier of the IT Admin (AC-4)', async () => {
      const u = await example();
      const id = await h.approvedInternalService(u, u.member, internalPlan);
      await h.reviewService(id, { decision: 'ACCEPT' }).expect(200);

      await h.grant({ requestId: id, accountIdentifier: 'internal-svc' }).expect(201);

      expect(await assignmentOf(id)).toMatchObject({
        kind: 'SERVICE',
        owning_department_id: u.department.id,
        cost_center_id: u.department.unitId,
      });
    });

    it('refuses what is not a verdict: no reason for a refusal, a reason for an acceptance, a caller who is not an IT Admin, a request that is not one of these', async () => {
      const u = await example();
      const id = await h.approvedService(u, u.member, paidPlan, 15 * M);

      for (const body of [
        { decision: 'REJECT' },
        { decision: 'REJECT', reason: '  ' },
        { decision: 'ACCEPT', reason: 'x' },
      ]) {
        expect(codeOf(await h.reviewService(id, body).expect(422))).toBe('VALIDATION_ERROR');
      }
      await h.reviewService(id, { decision: 'ACCEPT' }, u.head.account).expect(403);
      await h.reviewService(id, { decision: 'ACCEPT' }, u.member.account).expect(403);
      expect(codeOf(await h.reviewService(randomUUID(), { decision: 'ACCEPT' }).expect(404))).toBe(
        'ACCESS_REQUEST.NOT_FOUND',
      );
      const ordinary = await h.sent(u.member, internalPlan);
      await h.decide(ordinary.id, { decision: 'APPROVE' }, u.head.account).expect(200);
      expect(codeOf(await h.reviewService(ordinary.id, { decision: 'ACCEPT' }).expect(409))).toBe(
        'SERVICE_ACCOUNT_REQUEST.NOT_REVIEWABLE',
      );
      expect((await boundaryOf(id)).boundary_state).toBe('PENDING');
      expect(await h.state(id)).toBe('AWAITING_EXECUTION');
    });

    it('is given once, after an acceptance too, and not before the request is approved in full', async () => {
      const u = await example();
      const waiting = await h.sentService(u.member, paidPlan);
      const id = await h.approvedService(u, u.member, paidPlan, 15 * M);

      expect(codeOf(await h.reviewService(waiting.id, { decision: 'ACCEPT' }).expect(409))).toBe(
        'SERVICE_ACCOUNT_REQUEST.NOT_REVIEWABLE',
      );
      await h.reviewService(id, { decision: 'ACCEPT' }).expect(200);
      const again = await h.reviewService(id, { decision: 'REJECT', reason: 'Changed my mind' }).expect(409);

      expect(codeOf(again)).toBe('SERVICE_ACCOUNT_REQUEST.BOUNDARY_ALREADY_DECIDED');
      expect(await boundaryOf(id)).toMatchObject({ boundary_state: 'ACCEPTED', boundary_reason: null });
      expect(await h.state(id)).toBe('AWAITING_EXECUTION');
      expect(await commitmentOf(id)).toMatchObject({ state: 'HELD', released_minor: '0' });
    });

    it('shows the IT Admin the type of what waits and whether its boundary is checked', async () => {
      const u = await example();
      const pending = await h.approvedService(u, u.member, paidPlan, 5 * M);
      const checked = await h.approvedService(u, u.member, paidPlan, 5 * M);
      await h.reviewService(checked, { decision: 'ACCEPT' }).expect(200);
      const plain = await h.sent(u.member, internalPlan);
      await h.decide(plain.id, { decision: 'APPROVE' }, u.head.account).expect(200);

      const items = h.dataOf<{ items: { requestId: string; type: string; boundaryState: string | null }[] }>(
        await h.grantQueue(h.it1, { beneficiaryEmployeeId: u.member.employeeId, pageSize: 100 }).expect(200),
      ).items;

      const byId = (id: string) => items.find((item) => item.requestId === id);
      expect(byId(pending)).toMatchObject({ type: 'SERVICE_ACCOUNT', boundaryState: 'PENDING' });
      expect(byId(checked)).toMatchObject({ type: 'SERVICE_ACCOUNT', boundaryState: 'ACCEPTED' });
      expect(byId(plain.id)).toMatchObject({ type: 'GRANT', boundaryState: null });
    });
  });

  describe('one identifier on one subscription (AC-5)', () => {
    it('lets two IT Admins grant the same identifier at once to one request only, whatever its case and spaces', async () => {
      const second = await h.staff(await h.departmentWithUnit('P-S-IT2'), 'SA-IT2', 'IT_ADMIN');
      otherItAdmins.push(second.account);
      // An identifier is one under one subscription, and a request is granted on the subscription of its own department (F20): the
      // two requests are of one department, so that they meet on one subscription.
      const first = await example();
      const colleague = await h.staff(first.department, `SA-IT2-M${counter}`);
      const a = await h.approvedService(first, first.member, paidPlan, 5 * M);
      const b = await h.approvedService(first, colleague, paidPlan, 5 * M);
      await h.reviewService(a, { decision: 'ACCEPT' }).expect(200);
      await h.reviewService(b, { decision: 'ACCEPT' }).expect(200);

      const [one, two] = await Promise.all([
        h.grant({ requestId: a, subscriptionId, accountIdentifier: 'ci-bot' }, h.it1),
        h.grant({ requestId: b, subscriptionId, accountIdentifier: '  CI-Bot ' }, second.account),
      ]);

      const statuses = [one.status, two.status].sort();
      expect(statuses).toEqual([201, 422]);
      const lost = one.status === 422 ? { response: one, id: a } : { response: two, id: b };
      const won = one.status === 201 ? a : b;
      expect(codeOf(lost.response)).toBe('LICENSE_ASSIGNMENT.IDENTIFIER_IN_USE');
      expect(await h.state(lost.id)).toBe('AWAITING_EXECUTION');
      expect(await taskOf(lost.id)).toBeUndefined();
      expect(await h.state(won)).toBe('EXECUTING');
      // The database says no as well, whoever writes: the same identifier under the same subscription.
      const copy = await sqlState(
        `INSERT INTO license_assignments (id, organization_id, kind, source, plan_id, subscription_id, employee_id, account_identifier,
           normalized_account_identifier, reason, cost_center_id, owning_department_id, valid_from, valid_from_basis, created_by_app_user_id)
         SELECT gen_random_uuid(), organization_id, kind, source, plan_id, subscription_id, employee_id, 'CI-BOT',
           normalized_account_identifier, reason, cost_center_id, owning_department_id, valid_from, valid_from_basis, created_by_app_user_id
           FROM license_assignments WHERE id = (SELECT assignment_id FROM provisioning_tasks WHERE request_id = $1)`,
        [won],
      );
      expect(copy).toBe(EXCLUDED);
    });
  });

  describe('an IT Admin who answers for the account (AC-6)', () => {
    it('leaves both the verdict and the grant to another IT Admin while one can act, then does them alone and says so', async () => {
      const unit = await example();
      const a1 = await h.staff(unit.department, 'SA-A1', 'IT_ADMIN');
      const itAdmins = [h.it1, ...otherItAdmins];
      const requests: string[] = [];
      for (let index = 0; index < 2; index += 1) {
        const sent = await h.sentService(a1, paidPlan);
        await h.decide(sent.id, { decision: 'APPROVE', spend: { offPlan: true } }, unit.head.account).expect(200);
        await h.setPayments(sent.id, { amount: 5 * M });
        await h.sendOn([sent.id], unit.head.account).expect(201);
        await h.decideSpend(sent.id, { decision: 'APPROVE' }, h.boss.account).expect(200);
        requests.push(sent.id);
      }
      const [first, second] = requests;

      // Another IT Admin can act: A1 does not decide or grant for themselves, and the other does both.
      expect(codeOf(await h.reviewService(first, { decision: 'ACCEPT' }, a1.account).expect(403))).toBe(
        'PROVISIONING.ANOTHER_IT_ADMIN_NEEDED',
      );
      expect((await boundaryOf(first)).boundary_state).toBe('PENDING');
      await h.reviewService(first, { decision: 'ACCEPT' }, h.it1).expect(200);
      expect(
        codeOf(
          await h.grant({ requestId: first, subscriptionId, accountIdentifier: 'a1-bot' }, a1.account).expect(403),
        ),
      ).toBe('PROVISIONING.ANOTHER_IT_ADMIN_NEEDED');
      expect(await h.state(first)).toBe('AWAITING_EXECUTION');
      await granted(first, 'a1-bot', {}, h.it1);
      expect((await boundaryOf(first)).boundary_self_executed).toBe(false);

      // Nobody else can act: A1 may, and each act says that it was done for themselves.
      for (const admin of itAdmins) {
        await h.ctx.sql.query(`UPDATE app_users SET status = 'LOCKED' WHERE id = $1`, [admin.appUserId]);
      }
      try {
        const reviewed = await h.reviewService(second, { decision: 'ACCEPT' }, a1.account).expect(200);
        expect(
          h.dataOf<{ request: { serviceAccount: { boundary: { selfExecuted: boolean } } } }>(reviewed).request
            .serviceAccount.boundary.selfExecuted,
        ).toBe(true);
        await granted(second, 'a1-bot-2', {}, a1.account);
      } finally {
        for (const admin of itAdmins) {
          await h.ctx.sql.query(`UPDATE app_users SET status = 'ACTIVE' WHERE id = $1`, [admin.appUserId]);
        }
      }
      expect(await boundaryOf(second)).toMatchObject({ boundary_state: 'ACCEPTED', boundary_self_executed: true });
      expect(await events('ACCESS_REQUEST.SERVICE_ACCOUNT_BOUNDARY_ACCEPTED', second)).toMatchObject([
        { after: { selfExecuted: true } },
      ]);
      const task = await h.ctx.sql.query<{ id: string }>(`SELECT id FROM provisioning_tasks WHERE request_id = $1`, [
        second,
      ]);
      expect((await h.auditEvents('ProvisioningTask', task.rows[0].id))[0].after).toMatchObject({ selfExecuted: true });
    });
  });

  describe('the person who answers for it, when they move while the request is open (QĐ-86c)', () => {
    it('is named again by the IT Admin from the department, and the account stays with the department and its Unit', async () => {
      const u = await example();
      const elsewhere = await h.departmentWithHead('P-S-ELSE');
      const colleague = await h.staff(u.department, 'SA-COLL');
      const id = await h.approvedService(u, u.member, paidPlan, 10 * M);
      await h.reviewService(id, { decision: 'ACCEPT' }).expect(200);
      await h.ctx.sql.query(
        `UPDATE employee_placements SET valid_from = '2026-10-01', valid_to = $2::date WHERE employee_id = $1`,
        [u.member.employeeId, h.today()],
      );
      await h.ctx.sql.query(
        `INSERT INTO employee_placements (id, organization_id, employee_id, department_id, valid_from)
         SELECT gen_random_uuid(), organization_id, employee_id, $2, $3::date
           FROM employee_placements WHERE employee_id = $1 ORDER BY valid_from LIMIT 1`,
        [u.member.employeeId, elsewhere.department.id, h.today()],
      );

      const stale = await h.grant({ requestId: id, subscriptionId, accountIdentifier: 'moved-bot' }).expect(409);
      expect(codeOf(stale)).toBe('PROVISIONING.RESPONSIBLE_NOT_IN_DEPARTMENT');
      expect(await h.state(id)).toBe('AWAITING_EXECUTION');
      for (const named of [elsewhere.head.employeeId, randomUUID()]) {
        const refused = await h
          .grant({ requestId: id, subscriptionId, accountIdentifier: 'moved-bot', responsibleEmployeeId: named })
          .expect(422);
        expect(codeOf(refused)).toBe('PROVISIONING.RESPONSIBLE_INVALID');
      }
      await h.ctx.sql.query(`UPDATE employees SET status = 'TERMINATED' WHERE id = $1`, [colleague.employeeId]);
      const gone = await h
        .grant({
          requestId: id,
          subscriptionId,
          accountIdentifier: 'moved-bot',
          responsibleEmployeeId: colleague.employeeId,
        })
        .expect(422);
      expect(codeOf(gone)).toBe('PROVISIONING.RESPONSIBLE_INVALID');
      expect(await h.state(id)).toBe('AWAITING_EXECUTION');

      await granted(id, 'moved-bot', { responsibleEmployeeId: u.head.employeeId });

      expect(await assignmentOf(id)).toMatchObject({
        employee_id: u.head.employeeId,
        owning_department_id: u.department.id,
        cost_center_id: u.department.unitId,
      });
    });

    it('is not named for a request of a person, which has no one to name', async () => {
      const u = await example();
      const sent = await h.sent(u.member, internalPlan);
      await h.decide(sent.id, { decision: 'APPROVE' }, u.head.account).expect(200);

      const refused = await h.grant({ requestId: sent.id, responsibleEmployeeId: u.head.employeeId }).expect(422);

      expect(codeOf(refused)).toBe('PROVISIONING.RESPONSIBLE_INVALID');
      expect(await h.state(sent.id)).toBe('AWAITING_EXECUTION');
    });
  });

  describe('withdrawing it before it is granted', () => {
    it('ends as withdrawn at every wait, giving back what was held, and grants nothing', async () => {
      const u = await example();
      const assignments = await h.count('license_assignments');
      const needing = await h.sentService(u.member, paidPlan);
      const spending = await h.sentService(u.member, paidPlan);
      await h.decide(spending.id, { decision: 'APPROVE', spend: { offPlan: true } }, u.head.account).expect(200);
      await h.setPayments(spending.id, { amount: 10 * M });
      await h.sendOn([spending.id], u.head.account).expect(201);
      const accepted = await h.approvedService(u, u.member, paidPlan, 15 * M);
      await h.reviewService(accepted, { decision: 'ACCEPT' }).expect(200);

      for (const id of [needing.id, spending.id, accepted]) {
        await h.withdrawRequest(id, { reason: 'No longer needed' }, u.member.account).expect(200);
        expect(await h.state(id)).toBe('WITHDRAWN');
        expect(await taskOf(id)).toBeUndefined();
      }

      expect(await commitmentOf(accepted)).toMatchObject({ state: 'RELEASED', released_minor: String(15 * M) });
      expect(await h.count('license_assignments')).toBe(assignments);
    });
  });

  describe('what the database refuses', () => {
    let detailed: string;
    let decided: string;

    beforeAll(async () => {
      const u = await example();
      detailed = (await h.sentService(u.member, paidPlan)).id;
      decided = await h.approvedInternalService(u, u.member, internalPlan);
      await h.reviewService(decided, { decision: 'ACCEPT' }).expect(200);
    });

    it('keeps the verdict and the columns that record it saying the same thing', async () => {
      for (const set of [
        `boundary_state = 'ACCEPTED'`,
        `boundary_state = 'REJECTED', boundary_decided_by_employee_id = responsible_employee_id, boundary_decided_at = now()`,
        `boundary_reason = 'a reason before any verdict'`,
      ]) {
        expect(
          await sqlState(`UPDATE access_request_service_accounts SET ${set} WHERE request_id = $1`, [detailed]),
        ).toBe(CHECK);
      }
      expect((await boundaryOf(detailed)).boundary_state).toBe('PENDING');
    });

    it('keeps a text that says something, whoever inserts it', async () => {
      const ordinary = await h.sent((await h.departmentWithHead(`P-S-TX${(counter += 1)}`)).member, internalPlan);

      for (const [purpose, identifier] of [
        ['', 'an-identifier'],
        ['a purpose', '   '],
      ]) {
        expect(
          await sqlState(
            `INSERT INTO access_request_service_accounts (request_id, purpose, expected_identifier, responsible_employee_id)
             SELECT id, $2, $3, requester_employee_id FROM access_requests WHERE id = $1`,
            [ordinary.id, purpose, identifier],
          ),
        ).toBe(CHECK);
      }
    });

    it('never changes what was asked for, never changes a verdict that was written, and never deletes the detail', async () => {
      expect(
        await sqlState(`UPDATE access_request_service_accounts SET purpose = 'another' WHERE request_id = $1`, [
          detailed,
        ]),
      ).toBe(FINAL);
      expect(
        await sqlState(
          `UPDATE access_request_service_accounts SET responsible_employee_id = (SELECT id FROM employees WHERE id <> responsible_employee_id LIMIT 1) WHERE request_id = $1`,
          [detailed],
        ),
      ).toBe(FINAL);
      expect(
        await sqlState(
          `UPDATE access_request_service_accounts SET boundary_state = 'REJECTED', boundary_reason = 'late' WHERE request_id = $1`,
          [decided],
        ),
      ).toBe(FINAL);
      expect(await sqlState(`DELETE FROM access_request_service_accounts WHERE request_id = $1`, [detailed])).toBe(
        FINAL,
      );
      expect((await boundaryOf(decided)).boundary_state).toBe('ACCEPTED');
    });

    /** Runs the statements in one transaction and returns the SQLSTATE of the commit, which is where the deferred rule speaks. */
    const committed = async (statements: Array<[string, unknown[]]>): Promise<string | null> => {
      await h.ctx.sql.query('BEGIN');
      try {
        for (const [text, values] of statements) await h.ctx.sql.query(text, values);
        await h.ctx.sql.query('COMMIT');

        return null;
      } catch (error) {
        await h.ctx.sql.query('ROLLBACK');

        return (error as { code?: string }).code ?? 'unknown';
      }
    };
    const COLUMNS = `organization_id, type, branch, state, plan_id, requester_employee_id, department_id, cost_center_id, business_reason, term_months, policy, created_by_app_user_id`;
    const COLUMNS_FROM = `organization_id, $2::"AccessRequestType", branch, state, plan_id, requester_employee_id, department_id, cost_center_id, business_reason, term_months, policy, created_by_app_user_id`;

    const copyOf = (requestId: string, type: string): [string, unknown[]] => [
      `INSERT INTO access_requests (id, ${COLUMNS}) SELECT gen_random_uuid(), ${COLUMNS_FROM} FROM access_requests WHERE id = $1`,
      [requestId, type],
    ];

    it('requires the detail of a request of this kind at the commit, and gives none to any other', async () => {
      const ordinary = await h.sent((await h.departmentWithHead(`P-S-DB${(counter += 1)}`)).member, internalPlan);

      expect(await committed([copyOf(ordinary.id, 'SERVICE_ACCOUNT')])).toBe(CHECK);
      expect(
        await committed([[`UPDATE access_requests SET type = 'SERVICE_ACCOUNT' WHERE id = $1`, [ordinary.id]]]),
      ).toBe(CHECK);
      expect(
        await committed([
          [
            `INSERT INTO access_request_service_accounts (request_id, purpose, expected_identifier, responsible_employee_id)
             SELECT id, 'a purpose', 'an-identifier', requester_employee_id FROM access_requests WHERE id = $1`,
            [ordinary.id],
          ],
        ]),
      ).toBe(CHECK);
      expect(
        (await h.ctx.sql.query(`SELECT 1 FROM access_requests WHERE id = $1 AND type = 'GRANT'`, [ordinary.id]))
          .rowCount,
      ).toBe(1);
    });

    it('holds a service assignment to the Unit of its owning department', async () => {
      const u = await example();
      const id = await h.approvedService(u, u.member, paidPlan, 5 * M);
      await h.reviewService(id, { decision: 'ACCEPT' }).expect(200);
      await granted(id, 'unit-checked-bot');
      const other = await h.departmentWithUnit('P-S-UNIT');

      const refused = await sqlState(
        `INSERT INTO license_assignments (id, organization_id, kind, source, plan_id, subscription_id, employee_id, account_identifier,
           normalized_account_identifier, reason, cost_center_id, owning_department_id, valid_from, valid_from_basis, created_by_app_user_id)
         SELECT gen_random_uuid(), organization_id, kind, source, plan_id, subscription_id, employee_id, 'another-bot',
           'another-bot', reason, $2, owning_department_id, valid_from, valid_from_basis, created_by_app_user_id
           FROM license_assignments WHERE id = (SELECT assignment_id FROM provisioning_tasks WHERE request_id = $1)`,
        [id, other.unitId],
      );

      expect(refused).toBe(CHECK);
    });
  });
});
