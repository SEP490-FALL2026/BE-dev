import { Client } from 'pg';
import request from 'supertest';
import type { AuthenticatedPrincipal } from '../../src/infrastructure/security/tokens/access-token-verifier.port';
import { TransactionRunner } from '../../src/infrastructure/database/transaction-runner';
import { AccessRequestRepo } from '../../src/modules/requests/access-request/access-request.repo';
import { FrozenAmounts } from './frozen-amounts';
import type { CheckTrigger } from '../../src/modules/requests/spend/budget-check.repo';
import { SpendRoutingService, type RoutingOutcome } from '../../src/modules/requests/spend/spend-routing.service';
import type { ApiAccount } from './api-accounts';
import { BudgetHarness, type VersionWire } from './budget-harness';
import { approvedBudget } from './builders/budget.builder';
import { waitForLockWaiters } from './lock-wait';
import type { Department, Person } from './request-harness';

/** A department with its head and a member, as `departmentWithHead` makes them. */
export interface Unit {
  department: Department;
  head: Person;
  member: Person;
}

/** What a request that costs money says of its amount, written over the request the real routes made (one amount for one year, `QĐ-109`). */
export interface PaidSpec {
  /** The amount of the request, in minor units. */
  amount?: number;
  /** The year the amount is counted in. */
  year?: number;
  currency?: string;
}

export interface BudgetSpec {
  total: number;
  year?: number;
  /** The lines of the plan; one line of the last month of the year when not given. */
  lines?: object[];
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
  /** The head of the executive department: the spending approver is a member of it, never its head (QĐ-93b). */
  executiveHead!: Person;
  /** Somebody of another department who holds no role: what a test uses for a person who must be refused (nobody decides in the place of the approver, `QĐ-93c`). */
  bystander!: Person;

  /** The principal a call of the service is made as: what the access token would carry. */
  principal(account: ApiAccount, roles: string[] = []): AuthenticatedPrincipal {
    return {
      subject: account.appUserId,
      appUserId: account.appUserId,
      sessionId: 'spend-harness-session',
      employeeId: account.employeeId,
      directRoles: roles,
      roles,
    };
  }

  /** The spending approver of the installation, a member (not the head) of a department of their own. */
  async withApprover(): Promise<void> {
    const executive = await this.departmentWithUnit('P-EXE');
    this.boss = await this.staff(executive, 'EXE-C1');
    this.executiveHead = await this.staff(executive, 'EXE-H1');
    await this.makeHead(executive, this.executiveHead);
    await this.setRole('SPENDING_APPROVER', this.boss);
    this.bystander = await this.staff(await this.departmentWithUnit('P-SBS'), 'SBS-S1');
  }

  /** The person who decides the budget of any unit: the spending approver, who heads no unit (QĐ-93b; US-06-08 is retired, QĐ-93d). */
  deciderOf(): ApiAccount {
    return this.boss.account;
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

  /**
   * Writes the amount of a request over what the real routes made of it, and keeps it: every check of the budget works the amount out
   * again for its day (`QĐ-109e`), which a suite about the check cannot have, since it says what the amount is. The repricing has
   * its own suite (`request-amount-term.integration-spec.ts`); `thawAmounts` gives it back to a test that wants it.
   */
  async setPayments(requestId: string, spec: PaidSpec): Promise<void> {
    const year = spec.year ?? this.year;
    await this.ctx.sql.query(
      `UPDATE access_requests
          SET amount_minor = $2, amount_currency = $3, budget_year = $4,
              pricing_status = 'PRICED', price_missing_reason = NULL,
              unit_price_minor = COALESCE(unit_price_minor, 1000000), billing_cycle = COALESCE(billing_cycle, 'MONTHLY')
        WHERE id = $1`,
      [requestId, spec.amount ?? 1_000_000, spec.currency ?? this.reporting, year],
    );
    this.frozen.freeze(this.ctx.app, requestId);
  }

  private readonly frozen = new FrozenAmounts();

  /** The requests whose amount a test wrote are priced by the real rule again from now on. */
  thawAmounts(): void {
    this.frozen.thaw();
  }

  /**
   * The current budget of the department for the year, approved through the real decision, with what is held and spent. The
   * proposal, the version, its sending and the decision go through their services, not HTTP (T2.2): no suite that stands on
   * this proves those routes.
   */
  async budgetFor(unit: Unit, spec: BudgetSpec): Promise<VersionWire> {
    const year = spec.year ?? this.year;
    const version = await approvedBudget<VersionWire>(this.ctx, {
      headToken: unit.head.account.accessToken,
      financeToken: this.finance.accessToken,
      deciderToken: this.deciderOf().accessToken,
      proposal: this.proposalBody(unit.department.unitId, spec.lines ?? [this.line()], year),
      version: {
        base: this.money(spec.total),
        reserve: this.money(0),
        reserveReason: 'The budget of the test keeps no reserve',
      },
    });
    if (spec.held) await this.commit(unit, version.id, year, spec.held, 'HELD');
    if (spec.spent) await this.commit(unit, version.id, year, spec.spent, 'EXPENSED');

    return { ...version, state: 'APPROVED' };
  }

  /**
   * A commitment of a request that is not in the table of requests, attached to the version. An `EXPENSED` one is what an invoice
   * made of it: all of it applied, and the invoice that cost it, so that what is spent is read from the invoice as in the
   * application.
   */
  async commit(unit: Unit, versionId: string, year: number, amount: number, state: 'HELD' | 'EXPENSED'): Promise<void> {
    const { rows } = await this.ctx.sql.query<{ id: string }>(
      `INSERT INTO budget_commitments
         (id, organization_id, request_id, cost_center_id, year, amount_minor, currency, state, attached_version_id, attached_at, applied_minor)
       VALUES (gen_random_uuid(), $1, $8, $2, $3, $4, $5, $6::"CommitmentState", $7, now(), $9) RETURNING id`,
      [
        this.seed.organizationId,
        unit.department.unitId,
        year,
        amount,
        this.reporting,
        state,
        versionId,
        await this.fixtureRequestId(),
        state === 'EXPENSED' ? amount : 0,
      ],
    );
    if (state === 'EXPENSED') await this.invoiceOf(rows[0].id, amount);
  }

  /** An invoice for the whole of a commitment, as the application would have written it. */
  async invoiceOf(commitmentId: string, amount: number, number = `HARNESS-${commitmentId}`): Promise<void> {
    const vendors = await this.ctx.sql.query<{ id: string }>(
      `SELECT id FROM vendors WHERE organization_id = $1 ORDER BY id LIMIT 1`,
      [this.seed.organizationId],
    );
    const vendorId =
      vendors.rows[0]?.id ??
      (
        await this.ctx.sql.query<{ id: string }>(
          `INSERT INTO vendors (id, organization_id, name, normalized_name)
           VALUES (gen_random_uuid(), $1, 'Harness vendor', 'harness vendor') RETURNING id`,
          [this.seed.organizationId],
        )
      ).rows[0].id;
    await this.ctx.sql.query(
      `INSERT INTO invoices (id, organization_id, commitment_id, vendor_id, number, issued_on, currency, net_minor,
          deductible_tax_minor, non_deductible_tax_minor, actual_cost_minor, applied_minor, match_result, recorded_by_employee_id, recorded_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, current_date, $5, $6, 0, 0, $6, $6, 'MATCHED', $7, now())`,
      [this.seed.organizationId, commitmentId, vendorId, number, this.reporting, amount, this.finance.employeeId],
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
  batchList = (account: ApiAccount, query: Record<string, string | number> = {}) =>
    request(this.server()).get('/api/v1/spend-batches').query(query).set(this.as(account));
  batchOf = (id: string, account: ApiAccount) =>
    request(this.server()).get(`/api/v1/spend-batches/${id}`).set(this.as(account));
  batchItems = (id: string, account: ApiAccount, query: Record<string, string | number> = {}) =>
    request(this.server()).get(`/api/v1/spend-batches/${id}/items`).query(query).set(this.as(account));
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
  /**
   * The request for a group of people, two at least, as the account sends it: the one way left to send a request for others, since
   * the route that sent one request for each person is gone (`QĐ-96`). The people start today, as the group of a request needs.
   */
  async submitForPeople(
    planId: string,
    people: readonly Person[],
    account: ApiAccount,
    extra: Record<string, unknown> = {},
  ): Promise<request.Response> {
    await this.ctx.sql.query(`UPDATE employees SET hire_date = current_date WHERE id = ANY($1::uuid[])`, [
      people.map((person) => person.employeeId),
    ]);

    return request(this.server())
      .post('/api/v1/group-requests')
      .set(this.as(account))
      .send({
        planId,
        lines: people.map((person) => ({ employeeId: person.employeeId })),
        businessReason: 'The new designers need the tool',
        ...this.endDated({ termMonths: 1, ...extra }),
      });
  }

  /** The id of the request for a group that `submitForPeople` made, failing on anything but 201. */
  async sentForPeople(
    planId: string,
    people: readonly Person[],
    account: ApiAccount,
    extra: Record<string, unknown> = {},
  ): Promise<string> {
    const response = await this.submitForPeople(planId, people, account, extra);
    if (response.status !== 201) throw new Error(`group submit: ${response.status} ${JSON.stringify(response.body)}`);

    return this.dataOf<{ request: { id: string } }>(response).request.id;
  }
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
  /**
   * Holds the row of the request in another connection and sends the calls one by one: each is waiting for the lock before the next is
   * sent (`waitForLockWaiters`), the lock then goes to them in the order they queued, so the answer of each is the answer of its place.
   * The lock is always released, and the calls are always settled, even when one of them fails the test.
   */
  async queuedOnRequest(requestId: string, sends: Array<() => request.Test>): Promise<request.Response[]> {
    const holder = new Client({ connectionString: this.ctx.database.url });
    const pending: Array<Promise<request.Response>> = [];
    await holder.connect();
    try {
      await holder.query('BEGIN');
      await holder.query('SELECT id FROM access_requests WHERE id = $1 FOR UPDATE', [requestId]);
      for (const send of sends) {
        pending.push(send().then((response) => response));
        await waitForLockWaiters(this.ctx.sql, pending.length);
      }
      await holder.query('COMMIT');
      const answers: request.Response[] = [];
      for (const answer of pending) answers.push(await answer);

      return answers;
    } finally {
      await holder.query('ROLLBACK').catch(() => undefined);
      await holder.end();
      await Promise.allSettled(pending);
    }
  }

  completeReview = (id: string, body: object, account: ApiAccount = this.finance) =>
    request(this.server()).post(`/api/v1/access-requests/${id}/finance-review`).set(this.as(account)).send(body);
  checkOf = (id: string, account: ApiAccount = this.finance) =>
    request(this.server()).get(`/api/v1/access-requests/${id}/budget-check`).set(this.as(account));
  checkYears = (id: string, account: ApiAccount = this.finance, query: Record<string, string | number> = {}) =>
    request(this.server()).get(`/api/v1/access-requests/${id}/budget-check/years`).query(query).set(this.as(account));
}
