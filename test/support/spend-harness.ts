import request from 'supertest';
import type { AuthenticatedPrincipal } from '../../src/infrastructure/security/tokens/access-token-verifier.port';
import { TransactionRunner } from '../../src/infrastructure/database/transaction-runner';
import { AccessRequestRepo } from '../../src/modules/requests/access-request/access-request.repo';
import type { CheckTrigger } from '../../src/modules/requests/spend/budget-check.repo';
import { SpendRoutingService, type RoutingOutcome } from '../../src/modules/requests/spend/spend-routing.service';
import type { ApiAccount } from './api-accounts';
import { BudgetHarness, type VersionWire } from './budget-harness';
import type { Department, Person } from './request-harness';

/** A department with its head and a member, as `departmentWithHead` makes them. */
export interface Unit {
  department: Department;
  head: Person;
  member: Person;
}

/** What a request that costs money says of its payments, written over the request the real routes made. */
export interface PaidSpec {
  /** One payment in this year, on `dueOn` or on the 15th of June. Ignored when `schedule` is given. */
  amount?: number;
  year?: number;
  dueOn?: string;
  /** Every payment of the request, and whether it binds the company. */
  schedule?: Array<{ dueOn: string; amount: number; year: number; binding?: boolean }>;
  currency?: string;
}

export interface BudgetSpec {
  total: number;
  year?: number;
  /** The lines of the plan; one line of the last month of the year when not given. */
  lines?: object[];
  /** Whole percent of what is left above which a request is high value. */
  percent?: number;
  /** An amount above which a request is high value, whatever is left. */
  amountThreshold?: number;
  /** What the attached commitments hold, and what has become an expense. */
  held?: number;
  spent?: number;
}

/** A step as the database keeps it. */
export interface StepRow {
  state: string;
  assignee_employee_id: string | null;
  waiting_reason: string | null;
  same_person_as_spend: boolean;
  no_independent_review: boolean;
}

export interface Page<T> {
  items: T[];
  pagination: { totalItems: number };
}

/**
 * The harness of the check of the budget and the review of Finance: requests that cost money made through the real routes
 * and then given the payments a test needs, budgets approved through the real decision, and the check run as the submission
 * will run it (the lock, the transaction, the routing). No assertion lives here: the specs make them.
 */
export class SpendHarness extends BudgetHarness {
  boss!: Person;
  /** The substitute `withApprover` names; a test may name another. */
  substitute!: Person;
  private readonly known = new Map<string, ApiAccount>();

  /** A person of the department with an account, remembered so that a test can act as whoever holds a role. */
  override async staff(department: Department, code: string, roles: string[] = []): Promise<Person> {
    const person = await super.staff(department, code, roles);
    this.known.set(person.employeeId, person.account);

    return person;
  }

  /** The principal a call of the service is made as: what the access token would carry. */
  principal(account: ApiAccount, roles: string[] = []): AuthenticatedPrincipal {
    return {
      subject: account.appUserId,
      appUserId: account.appUserId,
      sessionId: 'spend-harness-session',
      employeeId: account.employeeId,
      directRoles: roles,
      derivedRoles: [],
      roles,
    };
  }

  /** The spending approver of the installation, in a department of their own. */
  async withApprover(): Promise<void> {
    const executive = await this.departmentWithUnit('P-EXE');
    this.boss = await this.staff(executive, 'EXE-C1');
    await this.makeHead(executive, this.boss);
    await this.setRole('SPENDING_APPROVER', this.boss);
    // Somebody decides in the place of the approver when they are a party; a test that is about it names its own.
    this.substitute = await this.staff(await this.departmentWithUnit('P-SBS'), 'SBS-S1');
    await this.setRole('CONFLICT_SUBSTITUTE', this.substitute);
  }

  /** The person who decides the budget of the unit: the spending approver, or the substitute when they head it (US-06-08 AC-11). */
  async deciderOf(unit: Unit): Promise<ApiAccount> {
    if (unit.head.employeeId !== this.boss.employeeId) return this.boss.account;
    const { rows } = await this.ctx.sql.query<{ employee_id: string }>(
      `SELECT employee_id FROM approval_role_holders WHERE role = 'CONFLICT_SUBSTITUTE'::"ApprovalRole" AND held_until IS NULL`,
    );
    const account = rows[0] ? this.known.get(rows[0].employee_id) : undefined;
    if (!account) throw new Error('The approver heads the unit and nobody the test knows is the substitute.');

    return account;
  }

  /** Checks the request the way the submission will: locked, in one transaction, routed where the check says. */
  async route(
    requestId: string,
    actor: ApiAccount,
    roles: string[] = ['MANAGER'],
    trigger: CheckTrigger = 'SUBMISSION',
  ): Promise<RoutingOutcome> {
    const runner = this.ctx.app.get(TransactionRunner, { strict: false });
    const repo = this.ctx.app.get(AccessRequestRepo, { strict: false });
    const routing = this.ctx.app.get(SpendRoutingService, { strict: false });

    return runner.run(async (tx) => {
      const locked = await repo.lockById(tx, requestId);
      if (!locked) throw new Error(`The request ${requestId} does not exist.`);

      return routing.route(tx, this.principal(actor, roles), locked, trigger, new Date());
    });
  }

  /**
   * A request for the plan sent by the member and approved by the head, so that it waits to be sent on as spend, with the
   * payments the spec gives it. Everything but the payments is what the real routes made.
   */
  async paidRequest(unit: Unit, planId: string, spec: PaidSpec = {}): Promise<string> {
    const sent = await this.sent(unit.member, planId, { termMonths: 1 });
    await this.decide(sent.id, { decision: 'APPROVE' }, unit.head.account).expect(200);
    await this.setPayments(sent.id, spec);

    return sent.id;
  }

  /** Writes the payments of a request over what the real routes made of it. */
  async setPayments(requestId: string, spec: PaidSpec): Promise<void> {
    const year = spec.year ?? this.year;
    const schedule = spec.schedule ?? [
      { dueOn: spec.dueOn ?? `${year}-06-15`, amount: spec.amount ?? 1_000_000, year, binding: true },
    ];
    const periods = schedule.map((period) => ({
      dueOn: period.dueOn,
      amountMinor: String(period.amount),
      budgetYear: period.year,
      binding: period.binding ?? true,
    }));
    const total = schedule.reduce((sum, period) => sum + period.amount, 0);
    await this.ctx.sql.query(
      `UPDATE access_requests
          SET amount_minor = $2, amount_currency = $3, payment_schedule = $4::jsonb, budget_year = $5, expected_spend_on = $6,
              pricing_status = 'PRICED', price_missing_reason = NULL,
              unit_price_minor = COALESCE(unit_price_minor, 1000000), billing_cycle = COALESCE(billing_cycle, 'MONTHLY')
        WHERE id = $1`,
      [requestId, total, spec.currency ?? this.reporting, JSON.stringify(periods), schedule[0].year, schedule[0].dueOn],
    );
  }

  /** The current budget of the department for the year, approved through the real decision, with what is held and spent. */
  async budgetFor(unit: Unit, spec: BudgetSpec): Promise<VersionWire> {
    const year = spec.year ?? this.year;
    const window = { windowFrom: `${year}-12-01`, windowTo: `${year}-12-31`, quoteValidUntil: undefined };
    const proposal = await this.budgetProposed(
      unit.head,
      unit.department.unitId,
      spec.lines ?? [this.line(window)],
      year,
    );
    const version = await this.built(proposal.id, {
      base: this.money(spec.total),
      reserve: this.money(0),
      highValuePercent: spec.percent ?? 50,
      ...(spec.amountThreshold ? { highValueAmount: this.money(spec.amountThreshold) } : {}),
    });
    await this.sendVersion(version.id).expect(200);
    await this.decideVersion(version.id, { decision: 'APPROVE' }, await this.deciderOf(unit)).expect(200);
    if (spec.held) await this.commit(unit, version.id, year, spec.held, 'HELD');
    if (spec.spent) await this.commit(unit, version.id, year, spec.spent, 'EXPENSED');

    return { ...version, state: 'APPROVED' };
  }

  /** A commitment of a request that is not in the table of requests, attached to the version. */
  async commit(unit: Unit, versionId: string, year: number, amount: number, state: 'HELD' | 'EXPENSED'): Promise<void> {
    await this.ctx.sql.query(
      `INSERT INTO budget_commitments
         (id, organization_id, request_id, cost_center_id, year, amount_minor, currency, state, attached_version_id, attached_at)
       VALUES (gen_random_uuid(), $1, $8, $2, $3, $4, $5, $6::"CommitmentState", $7, now())`,
      [
        this.seed.organizationId,
        unit.department.unitId,
        year,
        amount,
        this.reporting,
        state,
        versionId,
        await this.fixtureRequestId(),
      ],
    );
  }

  /**
   * A proposal of software that is not in the catalog, approved by the head and assessed by the IT Admin, whose quote is no
   * longer in force: it waits to be sent on with a price it cannot be sent on with (US-06-12 AC-8).
   */
  async staleRequest(unit: Unit, amount = 10_000_000): Promise<string> {
    await this.setItAdminInCharge(unit.department, { employeeId: this.it1.employeeId, account: this.it1 });
    const proposed = await this.proposed(unit.member);
    await this.decide(proposed.id, { decision: 'APPROVE' }, unit.head.account).expect(200);
    await this.saveAssessment(proposed.id, this.assessmentBody(), this.it1).expect(200);
    await this.completeAssessment(proposed.id, this.it1).expect(200);
    await this.setPayments(proposed.id, { amount });
    await this.ctx.sql.query(
      `UPDATE access_request_assessments SET quote_valid_until = current_date - 1 WHERE request_id = $1`,
      [proposed.id],
    );

    return proposed.id;
  }

  /** Attaches the request to a line of the plan of the budget, as the head will. */
  async attachLine(requestId: string, versionId: string, position: number): Promise<void> {
    await this.ctx.sql.query(
      `UPDATE access_requests
          SET plan_line_version_id = $2, plan_line_position = $3, plan_line_confirmed = true, off_plan = false
        WHERE id = $1`,
      [requestId, versionId, position],
    );
  }

  async state(requestId: string): Promise<string> {
    return (await this.ctx.sql.query<{ state: string }>(`SELECT state FROM access_requests WHERE id = $1`, [requestId]))
      .rows[0].state;
  }

  async steps(requestId: string, kind: string): Promise<StepRow[]> {
    return (
      await this.ctx.sql.query<StepRow>(
        `SELECT state, assignee_employee_id, waiting_reason, same_person_as_spend, no_independent_review
           FROM access_request_steps WHERE request_id = $1 AND kind = $2::"AccessRequestStepKind" ORDER BY sequence`,
        [requestId, kind],
      )
    ).rows;
  }

  spendQueue = (account: ApiAccount, query: Record<string, string | number> = {}) =>
    request(this.server()).get('/api/v1/spend-queue').query(query).set(this.as(account));
  sendOn = (requestIds: string[], account: ApiAccount) =>
    request(this.server()).post('/api/v1/spend-batches').set(this.as(account)).send({ requestIds });
  batchOf = (id: string, account: ApiAccount) =>
    request(this.server()).get(`/api/v1/spend-batches/${id}`).set(this.as(account));
  batchItems = (id: string, account: ApiAccount, query: Record<string, string | number> = {}) =>
    request(this.server()).get(`/api/v1/spend-batches/${id}/items`).query(query).set(this.as(account));
  setPlanLine = (id: string, body: object, account: ApiAccount) =>
    request(this.server()).put(`/api/v1/access-requests/${id}/plan-line`).set(this.as(account)).send(body);
  suggestions = (id: string, account: ApiAccount, query: Record<string, string | number> = {}) =>
    request(this.server())
      .get(`/api/v1/access-requests/${id}/plan-line-suggestions`)
      .query(query)
      .set(this.as(account));
  addSupplement = (id: string, body: object, account: ApiAccount) =>
    request(this.server()).post(`/api/v1/access-requests/${id}/supplements`).set(this.as(account)).send(body);
  supplements = (id: string, account: ApiAccount, query: Record<string, string | number> = {}) =>
    request(this.server()).get(`/api/v1/access-requests/${id}/supplements`).query(query).set(this.as(account));

  approvals = (account: ApiAccount, query: Record<string, string | number> = {}) =>
    request(this.server()).get('/api/v1/spend-approvals').query(query).set(this.as(account));
  approvalOf = (id: string, account: ApiAccount) =>
    request(this.server()).get(`/api/v1/access-requests/${id}/spend-approval`).set(this.as(account));
  decideSpend = (id: string, body: object, account: ApiAccount) =>
    request(this.server()).post(`/api/v1/access-requests/${id}/spend-approval`).set(this.as(account)).send(body);
  withdrawRequest = (id: string, body: object, account: ApiAccount) =>
    request(this.server()).post(`/api/v1/access-requests/${id}/withdraw`).set(this.as(account)).send(body);
  sendDelegated = (body: object, account: ApiAccount) =>
    request(this.server()).post('/api/v1/delegated-requests').set(this.as(account)).send(body);
  grantQueue = (account: ApiAccount, query: Record<string, string | number> = {}) =>
    request(this.server()).get('/api/v1/grant-queue').query(query).set(this.as(account));
  departmentEmployees = (departmentId: string, account: ApiAccount) =>
    request(this.server()).get(`/api/v1/departments/${departmentId}/employees`).set(this.as(account));
  releaseCommitment = (id: string, body: object, account: ApiAccount) =>
    request(this.server()).post(`/api/v1/budget-commitments/${id}/release`).set(this.as(account)).send(body);
  commitmentReleases = (id: string, account: ApiAccount) =>
    request(this.server()).get(`/api/v1/budget-commitments/${id}/releases`).set(this.as(account));
  askFinance = (id: string, body: object, account: ApiAccount) =>
    request(this.server())
      .post(`/api/v1/access-requests/${id}/budget-information-requests`)
      .set(this.as(account))
      .send(body);
  questionsOf = (id: string, account: ApiAccount, query: Record<string, string | number> = {}) =>
    request(this.server())
      .get(`/api/v1/access-requests/${id}/budget-information-requests`)
      .query(query)
      .set(this.as(account));
  questions = (account: ApiAccount, query: Record<string, string | number> = {}) =>
    request(this.server()).get('/api/v1/budget-information-requests').query(query).set(this.as(account));
  answerQuestion = (id: string, body: object, account: ApiAccount) =>
    request(this.server()).post(`/api/v1/budget-information-requests/${id}/answer`).set(this.as(account)).send(body);
  decideBatch = (batchId: string, body: object, account: ApiAccount) =>
    request(this.server()).post(`/api/v1/spend-batches/${batchId}/decisions`).set(this.as(account)).send(body);

  /** A request sent on, so that its spend step waits for the approver: made, attached as the head approved it, and sent. */
  async waitingForApprover(unit: Unit, planId: string, spec: PaidSpec = {}): Promise<string> {
    const id = await this.paidRequest(unit, planId, spec);
    await this.sendOn([id], unit.head.account).expect(201);

    return id;
  }

  commitmentList = (account: ApiAccount, query: Record<string, string | number> = {}) =>
    request(this.server()).get('/api/v1/budget-commitments').query(query).set(this.as(account));
  reviewQueue = (account: ApiAccount, query: Record<string, string | number> = {}) =>
    request(this.server()).get('/api/v1/finance-reviews').query(query).set(this.as(account));
  reviewOf = (id: string, account: ApiAccount) =>
    request(this.server()).get(`/api/v1/access-requests/${id}/finance-review`).set(this.as(account));
  completeReview = (id: string, body: object, account: ApiAccount = this.finance) =>
    request(this.server()).post(`/api/v1/access-requests/${id}/finance-review`).set(this.as(account)).send(body);
  checkOf = (id: string, account: ApiAccount = this.finance) =>
    request(this.server()).get(`/api/v1/access-requests/${id}/budget-check`).set(this.as(account));
  checkYears = (id: string, account: ApiAccount = this.finance, query: Record<string, string | number> = {}) =>
    request(this.server()).get(`/api/v1/access-requests/${id}/budget-check/years`).query(query).set(this.as(account));
}
