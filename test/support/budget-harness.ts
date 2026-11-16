import { Client } from 'pg';
import request from 'supertest';
import { TransactionRunner } from '../../src/infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../src/infrastructure/security/tokens/access-token-verifier.port';
import { BudgetYearEndService } from '../../src/modules/budgets/year-end/year-end.service';
import { OrganizationHistoryApi } from '../../src/modules/organization/public/organization-history.api';
import type { ApiAccount } from './api-accounts';
import { afterPreparing, attachedVersionFile, withProposalFile } from './budget-files';
import { Department, Person, RequestHarness } from './request-harness';

export interface ProposalWire {
  id: string;
  costCenter: { id: string; code: string; name: string };
  year: number;
  state: 'SUBMITTED' | 'WITHDRAWN' | 'RETURNED' | 'REVIEWED' | 'CLOSED_FISCAL_YEAR_ENDED';
  previousProposalId: string | null;
  successorOfProposalId: string | null;
  successorProposalId: string | null;
  total: { amount: string; currency: string };
  submittedBy: { employeeId: string } | null;
  returned: { reason: string } | null;
  withdrawnAt: string | null;
  succeededAt: string | null;
  closedAt: string | null;
}

export interface VersionWire {
  id: string;
  costCenter: { id: string; code: string };
  year: number;
  number: number;
  state: 'DRAFT' | 'SENT' | 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED' | 'EXPIRED';
  proposalId: string | null;
  basedOnVersionId: string | null;
  rejectedPredecessorId: string | null;
  detachedAt: string | null;
  neverCurrent: boolean;
  expiredAt: string | null;
  base: { amount: string };
  reserve: { amount: string };
  total: { amount: string };
  /** The default share of the base the reserve has, in whole percent, and why a reserve that is not that share is what it is. */
  reservePercent: number;
  reserveReason: string | null;
  reason: string | null;
  previousTotal: { amount: string } | null;
  /** Set while the version was sent and nobody who works holds the role of the spending approver. */
  waitingReason: 'NO_SPENDING_APPROVER' | null;
  decision: {
    decision: 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED';
    reason: string | null;
    by: { employeeId: string } | null;
  } | null;
}

export interface HistoryEntryWire {
  seq: number;
  kind: 'FIGURES_UPDATED' | 'LINE_UPDATED' | 'LINES_ADDED' | 'LINES_IMPORTED' | 'WINDOW_MOVED';
  versionState: string;
  position: number | null;
  lines: { fromPosition: number; toPosition: number; count: number } | null;
  changes: { field: string; before: string | null; after: string | null }[];
  currency: string;
  by: { id: string; name: string };
  at: string;
}

export interface Pageable<T> {
  items: T[];
  pagination: { page: number; pageSize: number; totalItems: number; totalPages: number };
}

/** The harness of the budgets: departments with their heads, Finance, and the calls of the proposals and the versions. */
export class BudgetHarness extends RequestHarness {
  /** The year that is running, and the one after it. */
  year = Number(this.today().slice(0, 4));
  next = this.year + 1;
  reporting = 'VND';

  override async start(options: Parameters<RequestHarness['start']>[0] = {}): Promise<void> {
    await super.start(options);
    this.reporting = (
      await this.ctx.sql.query<{ reporting_currency: string }>(`SELECT reporting_currency FROM organizations LIMIT 1`)
    ).rows[0].reporting_currency;
    // A head proposes only once Finance opened the cycle of the year (QĐ-111z): the years the suites use have one, written as a fixture.
    for (let year = this.year; year <= this.year + 3; year += 1) await this.openedCycle(year);
  }

  /**
   * The budget cycle of a year as a fixture: opened, a ceiling no version reaches, no reserve. Idempotent. Both deadlines are the last
   * day of the year: a cycle locks from the day after its submission deadline (`QĐ-111z`), and the fixture must stay writable on every
   * day a suite can run on, not only until the day a real cycle would close (a deadline of 1 December locked every budget of the running
   * year from 2 December on).
   */
  async openedCycle(year: number): Promise<void> {
    await this.ctx.sql.query(
      `INSERT INTO budget_cycles (id, organization_id, year, submission_deadline, decision_deadline, annual_ceiling_minor,
         shared_pool_reserve_minor, currency, opened_by_employee_id, opened_at, updated_at)
       SELECT gen_random_uuid(), o.id, $1, make_date($1, 12, 31), make_date($1, 12, 31), 100000000000000, 0, $2, $3, now(), now()
         FROM organizations o
       ON CONFLICT (organization_id, year) DO NOTHING`,
      [year, this.reporting, this.finance.employeeId],
    );
  }

  /**
   * The cycle of a year as it stands from the day after its submission deadline (`QĐ-111z`): locked, which is what an adjustment of the budget of the year needs (`FIX-AD1`,
   * AD1-01). No route locks a cycle on a day of the test's choosing, so the fixture moves the deadline well back (a cycle of next year is locked as well); the decision deadline keeps its place.
   */
  async lockedCycle(year: number = this.year): Promise<void> {
    await this.ctx.sql.query(`UPDATE budget_cycles SET submission_deadline = make_date($1 - 5, 1, 1) WHERE year = $1`, [
      year,
    ]);
  }

  /** The fixture of `openedCycle` again: both deadlines the last day of the year, as a cycle that is still taking proposals. */
  async reopenedCycle(year: number = this.year): Promise<void> {
    await this.ctx.sql.query(`UPDATE budget_cycles SET submission_deadline = make_date($1, 12, 31) WHERE year = $1`, [
      year,
    ]);
  }

  /** Runs `work` with the cycle of the year locked and leaves it open as the other suites expect it (a proposal is taken only while it is open). */
  async withLockedCycle<T>(work: () => Promise<T>, year: number = this.year): Promise<T> {
    await this.lockedCycle(year);
    try {
      return await work();
    } finally {
      await this.reopenedCycle(year);
    }
  }

  money = (amount: string | number) => ({ amount: String(amount) });

  /** `BM-10` (`QĐ-111ab`): the amount asked for the year (70 million unless the suite says) and anything else the suite adds. */
  bm10 = (amount: number = 70_000_000, extra: Record<string, unknown> = {}) => ({
    requestedAmount: this.money(amount),
    ...extra,
  });

  proposalBody = (_costCenterId: string, amount?: number, year = this.next) => ({ year, ...this.bm10(amount) });

  /** Sends `BM-10`; a body that names no file gets one the head uploaded just before (the form requires one at least). */
  submitProposal = (body: { attachmentIds?: unknown; [field: string]: unknown }, account: ApiAccount) => {
    const payload = { ...body };

    return withProposalFile(
      request(this.server()).post('/api/v1/budget-proposals').set(this.as(account)).send(payload),
      this.ctx.sql,
      account.employeeId,
      payload,
    );
  };
  proposalList = (account: ApiAccount, query: Record<string, string | number> = {}) =>
    request(this.server()).get('/api/v1/budget-proposals').query(query).set(this.as(account));
  proposalOf = (id: string, account: ApiAccount) =>
    request(this.server()).get(`/api/v1/budget-proposals/${id}`).set(this.as(account));
  withdraw = (id: string, account: ApiAccount) =>
    request(this.server()).post(`/api/v1/budget-proposals/${id}/withdrawal`).set(this.as(account));
  giveBack = (id: string, body: object, account: ApiAccount) =>
    request(this.server()).post(`/api/v1/budget-proposals/${id}/return`).set(this.as(account)).send(body);
  /** Sends `BM-10` again; a body that names no file gets one the head uploaded just before. */
  resubmit = (id: string, body: { attachmentIds?: unknown; [field: string]: unknown }, account: ApiAccount) => {
    const payload = { ...body };

    return withProposalFile(
      request(this.server()).post(`/api/v1/budget-proposals/${id}/resubmission`).set(this.as(account)).send(payload),
      this.ctx.sql,
      account.employeeId,
      payload,
    );
  };

  /** The head sends `BM-10` and the proposal is returned, failing on anything but 201. */
  async budgetProposed(head: Person, costCenterId: string, amount?: number, year?: number): Promise<ProposalWire> {
    const response = await this.submitProposal(this.proposalBody(costCenterId, amount, year), head.account);
    if (response.status !== 201) throw new Error(`proposal: ${response.status} ${JSON.stringify(response.body)}`);

    return this.dataOf<{ proposal: ProposalWire }>(response).proposal;
  }

  createVersion = (body: object, account: ApiAccount = this.finance) =>
    request(this.server()).post('/api/v1/budget-versions').set(this.as(account)).send(body);
  versionOf = (id: string, account: ApiAccount = this.finance) =>
    request(this.server()).get(`/api/v1/budget-versions/${id}`).set(this.as(account));
  versionList = (account: ApiAccount = this.finance, query: Record<string, string | number> = {}) =>
    request(this.server()).get('/api/v1/budget-versions').query(query).set(this.as(account));
  /** An edit of a draft; a change of the base carries the reason it needs (`QĐ-100v`) unless the test names one (or none, with `baseReason: undefined`). */
  updateVersion = (id: string, body: object, account: ApiAccount = this.finance) =>
    request(this.server())
      .put(`/api/v1/budget-versions/${id}`)
      .set(this.as(account))
      .send('base' in body && !('baseReason' in body) ? { baseReason: 'Finance moved the base', ...body } : body);
  /** Sends a version; one that can take a file and has none gets one first (a version is sent with one at least, `QĐ-111ac`). */
  sendVersion = (id: string, account: ApiAccount = this.finance) =>
    afterPreparing(request(this.server()).post(`/api/v1/budget-versions/${id}/submission`).set(this.as(account)), () =>
      attachedVersionFile(this.ctx.sql, id, this.finance.employeeId),
    );
  versionHistory = (id: string, account: ApiAccount = this.finance, query: Record<string, string | number> = {}) =>
    request(this.server()).get(`/api/v1/budget-versions/${id}/history`).query(query).set(this.as(account));
  mine = (account: ApiAccount, year: number) =>
    request(this.server()).get('/api/v1/budgets/mine').query({ year }).set(this.as(account));
  table = (account: ApiAccount, query: Record<string, string | number> = {}) =>
    request(this.server()).get('/api/v1/budgets').query(query).set(this.as(account));
  summary = (account: ApiAccount, query: Record<string, string | number> = {}) =>
    request(this.server()).get('/api/v1/budgets/summary').query(query).set(this.as(account));

  /** A first version made from the proposal, failing on anything but 201. */
  async built(proposalId: string, extra: Record<string, unknown> = {}): Promise<VersionWire> {
    const response = await this.createVersion({
      proposalId,
      base: this.money(60_000_000),
      reserve: this.money(20_000_000),
      reserveReason: 'The reserve of the test is not the default share',
      ...extra,
    });
    if (response.status !== 201) throw new Error(`version: ${response.status} ${JSON.stringify(response.body)}`);

    return this.dataOf<{ version: VersionWire }>(response).version;
  }

  /** A first version made from the proposal, sent, and made current as the spending approver would (not built yet). */
  async current(proposalId: string, extra: Record<string, unknown> = {}): Promise<VersionWire> {
    const version = await this.built(proposalId, extra);
    await this.sendVersion(version.id).expect(200);
    await this.makeCurrent(version.id);

    return { ...version, state: 'APPROVED' };
  }

  /**
   * Makes a sent version the current budget, as the decision of the spending approver will do once it exists: the one that
   * was current is replaced. The decision is another part of this work; the tests here need only its result.
   */
  async makeCurrent(versionId: string): Promise<void> {
    await this.ctx.sql.query(
      `UPDATE budget_versions SET state = 'SUPERSEDED'
        WHERE state = 'APPROVED'
          AND (cost_center_id, year) = (SELECT cost_center_id, year FROM budget_versions WHERE id = $1)`,
      [versionId],
    );
    await this.ctx.sql.query(`UPDATE budget_versions SET state = 'APPROVED' WHERE id = $1`, [versionId]);
  }

  /**
   * A sent version the spending approver refused before refusal was taken out of the decision (`QĐ-111ad`: only APPROVE and RETURN are
   * left): what older data holds, the state and the record the refusal wrote. The routes keep reading it, and a proposal can still be
   * followed or built again from it.
   */
  async refusedBefore(versionId: string, by: ApiAccount, reason = 'The reserve is too high'): Promise<void> {
    await this.ctx.sql.query(
      `INSERT INTO budget_version_decisions (id, organization_id, version_id, decision, decided_by_employee_id, reason, total_minor, currency, decided_at)
       SELECT gen_random_uuid(), organization_id, id, 'REJECTED', $2, $3, total_minor, currency, now() FROM budget_versions WHERE id = $1`,
      [versionId, by.employeeId, reason],
    );
    await this.ctx.sql.query(`UPDATE budget_versions SET state = 'REJECTED' WHERE id = $1`, [versionId]);
  }

  decideVersion = (id: string, body: object, account: ApiAccount) =>
    this.decisionPost(`/api/v1/budget-versions/${id}/decision`, account, '4.7', body);

  /** A department with its Unit, a head and a member. */
  async departmentWithHead(code: string): Promise<{ department: Department; head: Person; member: Person }> {
    const department = await this.departmentWithUnit(code);
    const head = await this.staff(department, `${code}-H`);
    const member = await this.staff(department, `${code}-E`);
    await this.makeHead(department, head);

    return { department, head, member };
  }

  private requestTemplate: string | null = null;

  /**
   * The id of a request that exists and is nothing else: a commitment is held for a request, and the database keeps the key. It
   * is a copy of a request made through the routes, with no steps and nobody it is for, so that a test of the budget does not
   * have to walk a request through the chain to hold something against it.
   */
  async fixtureRequestId(): Promise<string> {
    if (this.requestTemplate === null) {
      const unit = await this.departmentWithHead('P-TPL');
      this.requestTemplate = (await this.sent(unit.member, await this.plan('K5'))).id;
    }
    const { rows: columns } = await this.ctx.sql.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'access_requests' AND column_name <> 'id' ORDER BY ordinal_position`,
    );
    const list = columns.map((column) => `"${column.column_name}"`).join(', ');
    const { rows } = await this.ctx.sql.query<{ id: string }>(
      `INSERT INTO access_requests (id, ${list}) SELECT gen_random_uuid(), ${list} FROM access_requests WHERE id = $1 RETURNING id`,
      [this.requestTemplate],
    );

    return rows[0].id;
  }

  /** The principal a call of a service is made as: what the access token would carry. */
  principalOf(account: ApiAccount, roles: string[] = []): AuthenticatedPrincipal {
    return {
      subject: account.appUserId,
      appUserId: account.appUserId,
      sessionId: 'budget-harness-session',
      employeeId: account.employeeId,
      directRoles: roles,
      roles,
    };
  }

  /**
   * Moves the proposals and the versions of a Cost Center from one year to another: how a test makes a year that has ended, which
   * no route does (every route refuses a year that has ended).
   */
  async moveYear(costCenterId: string, from: number, to: number): Promise<void> {
    for (const table of ['budget_proposals', 'budget_versions']) {
      await this.ctx.sql.query(`UPDATE ${table} SET year = $3 WHERE cost_center_id = $1 AND year = $2`, [
        costCenterId,
        from,
        to,
      ]);
    }
  }

  /** The closure of the fiscal years that have ended by `now` (the real clock when none is given). */
  closeYears = (now?: Date) => this.ctx.app.get(BudgetYearEndService, { strict: false }).closeEndedYears(now);

  /** A day in the middle of the year after next: both the year that is running and the one after it have ended by then. */
  inTwoYears = (): Date => new Date(Date.UTC(this.next + 1, 5, 15));

  /**
   * Another connection that holds the row of a proposal or of a version locked until `release`, so that a test can queue
   * requests behind it one by one (`waitForLockWaiters`) and let them run in the order they arrived.
   */
  async holdRow(table: 'budget_proposals' | 'budget_versions', id: string): Promise<{ release(): Promise<void> }> {
    const holder = new Client({ connectionString: this.ctx.database.url });
    await holder.connect();
    await holder.query('BEGIN');
    await holder.query(`SELECT id FROM ${table} WHERE id = $1 FOR UPDATE`, [id]);

    return {
      release: async () => {
        await holder.query('COMMIT');
        await holder.end();
      },
    };
  }

  /** Nobody heads the department any more: a head period removed, the way a test leaves a department without one. */
  async withoutHead(department: Department): Promise<void> {
    await this.ctx.sql.query(`DELETE FROM department_head_periods WHERE department_id = $1`, [department.id]);
  }

  /** The person heads the department from today and nobody else does: the head of a department changed hands. */
  async replaceHead(department: Department, person: Person): Promise<void> {
    await this.withoutHead(department);
    await this.ctx.sql.query(
      `INSERT INTO department_head_periods (id, organization_id, department_id, employee_id, valid_from)
       VALUES (gen_random_uuid(), $1, $2, $3, $4::date)`,
      [this.seed.organizationId, department.id, person.employeeId, this.today()],
    );
  }

  /**
   * The person leaves the company as the offboarding records it: `TERMINATED`, and the listeners of the organization hear
   * `EMPLOYEE_LEFT` in the same transaction, with the employee locked as the caller must.
   */
  async leaveCompany(person: Person): Promise<void> {
    const runner = this.ctx.app.get(TransactionRunner, { strict: false });
    const history = this.ctx.app.get(OrganizationHistoryApi, { strict: false });
    await runner.run(async (tx) => {
      await tx.$queryRaw`SELECT id FROM employees WHERE id = ${person.employeeId}::uuid FOR UPDATE`;
      await history.markEmployeeLeft(tx, person.employeeId, this.today());
    });
  }

  /** The notices of the inbox of the budget loops with this code about this subject, whoever they were given to. */
  budgetNoticesOf = async (code: string, subjectId: string) =>
    (
      await this.ctx.sql.query<{ recipient_employee_id: string; params: Record<string, unknown> }>(
        `SELECT recipient_employee_id, params FROM in_app_notifications WHERE code = $1 AND subject_id = $2 ORDER BY created_at, id`,
        [code, subjectId],
      )
    ).rows;

  budgetRows = async (table: string) =>
    Number((await this.ctx.sql.query<{ count: string }>(`SELECT count(*) FROM ${table}`)).rows[0].count);
}
