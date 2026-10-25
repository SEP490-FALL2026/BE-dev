import { Injectable } from '@nestjs/common';
import { Page, pageOf } from '../../../core/application/pagination';
import { formatAmount } from '../../../core/money/money';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { FinanceService } from '../../finance/finance.service';
import { OrganizationService } from '../../organization/organization.service';
import { AccessRequestRepo } from '../access-request/access-request.repo';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import { codesOf, type YearResult } from './budget-check.policy';
import { BudgetCheckService } from './budget-check.service';
import { BudgetCheckRepo, type CheckRecord } from './budget-check.repo';
import { FinanceReviewRepo } from './finance-review.repo';
import { SpendDecisionRepo } from './spend-decision.repo';
import { SpendNotFinanceError, SpendReviewNotFoundError } from './spend.errors';
import { SpendStepRepo, type SpendStepRecord } from './spend-step.repo';
import type { CheckWire, ReviewDetailWire, ReviewSummaryWire, YearWire } from './spend.dto';

type Money = { amount: string; currency: string };

/**
 * What Finance and the spending approver read of the check of a request and of the review that follows it (`US-06-12`,
 * `US-06-13`). Nobody else reads it: the head, the requester and the IT Admin see where the request stands, never the
 * figures of the budget (`QĐ-82m` `INF-06`). A reader with no part in the check is answered as if there were none.
 */
@Injectable()
export class SpendViewService {
  constructor(
    private readonly requests: AccessRequestRepo,
    private readonly checks: BudgetCheckRepo,
    private readonly steps: SpendStepRepo,
    private readonly reviews: FinanceReviewRepo,
    private readonly decisions: SpendDecisionRepo,
    private readonly runner: TransactionRunner,
    private readonly compute: BudgetCheckService,
    private readonly organization: OrganizationService,
    private readonly finance: FinanceService,
  ) {}

  /** Throws SpendNotFinanceError. */
  requireFinance(actor: AuthenticatedPrincipal): void {
    if (!actor.roles.includes('FINANCE')) throw new SpendNotFinanceError();
  }

  /** The queue of Finance: the open reviews, the oldest first. */
  async queue(
    actor: AuthenticatedPrincipal,
    query: { state?: 'PENDING' | 'WAITING'; page: number; pageSize: number },
  ): Promise<Page<ReviewSummaryWire>> {
    this.requireFinance(actor);
    const { rows, total } = await this.steps.pageOpenReviews(
      (query.page - 1) * query.pageSize,
      query.pageSize,
      query.state,
    );
    const [latest, people, centers] = await Promise.all([
      this.checks.latestOf(rows.map((row) => row.requestId)),
      this.people(rows.map((row) => row.request.requesterEmployeeId)),
      this.organization.costCentersByIds([...new Set(rows.map((row) => row.request.costCenterId))]),
    ]);
    const units = new Map<string, number>();
    for (const row of rows) {
      const code = row.request.amountCurrency;
      if (code && !units.has(code)) units.set(code, (await this.finance.findCurrency(code))?.minorUnit ?? 2);
    }
    const items = rows.map((row): ReviewSummaryWire => {
      const check = latest.get(row.requestId);
      const center = centers.find((candidate) => candidate.id === row.request.costCenterId);
      const requester = people.get(row.request.requesterEmployeeId);
      if (!center || !requester) throw new Error(`The review ${row.id} points at a missing record.`);
      const { amountMinor, amountCurrency } = row.request;

      return {
        requestId: row.requestId,
        stepId: row.id,
        state: row.state as 'PENDING' | 'WAITING',
        waitingReason: row.waitingReason as 'NO_FINANCE_REVIEWER' | null,
        openedAt: row.createdAt.toISOString(),
        slaWorkingDays: row.slaWorkingDays,
        costCenter: { id: center.id, code: center.code },
        requester,
        amount:
          amountMinor !== null && amountCurrency !== null
            ? { amount: formatAmount(amountMinor, units.get(amountCurrency) ?? 2), currency: amountCurrency }
            : null,
        primaryCode: check ? (codesOf(check)[0] ?? null) : null,
        planLineOverdue: check?.planLineOverdue ?? false,
        offPlan: check?.offPlan ?? false,
      };
    });

    return pageOf(items, total, query.page, query.pageSize);
  }

  /** The review of the request, open or ended, with the check it is about and how it ended. Throws SpendReviewNotFoundError. */
  async review(actor: AuthenticatedPrincipal, requestId: string): Promise<ReviewDetailWire> {
    await this.requireReader(actor, requestId);
    const step = await this.steps.findLatest(requestId, 'FINANCE_REVIEW');
    if (!step) throw new SpendReviewNotFoundError();
    const record = await this.reviews.ofStep(step.id);
    const check = (
      record ? await this.checks.findById(record.checkId) : await this.checks.latest(requestId)
    ) as CheckRecord;
    const ids = [step.assigneeEmployeeId, record?.decidedByEmployeeId ?? null];
    const people = await this.people(ids.filter((id): id is string => id !== null));
    const person = (id: string) => people.get(id) as NonNullable<ReturnType<typeof people.get>>;

    return {
      requestId,
      step: this.stepWire(step, people),
      check: await this.checkWire(check, requestId),
      review: record && {
        outcome: record.outcome,
        opinion: record.opinion,
        direction: record.direction,
        reason: record.reason,
        decidedBy: person(record.decidedByEmployeeId),
        decidedAt: record.decidedAt.toISOString(),
      },
    };
  }

  /** The newest check of the request. Throws SpendReviewNotFoundError. */
  async latestCheck(actor: AuthenticatedPrincipal, requestId: string): Promise<CheckWire> {
    await this.requireReader(actor, requestId);
    const check = await this.checks.latest(requestId);
    if (!check) throw new SpendReviewNotFoundError();

    return this.checkWire(check, requestId);
  }

  /** The years of the newest check, one page of them. Throws SpendReviewNotFoundError. */
  async years(
    actor: AuthenticatedPrincipal,
    requestId: string,
    query: { page: number; pageSize: number },
  ): Promise<Page<YearWire>> {
    await this.requireReader(actor, requestId);
    const live = await this.liveYears(actor, requestId);
    const check = live ? null : await this.checks.latest(requestId);
    if (!live && !check) throw new SpendReviewNotFoundError();
    const skip = (query.page - 1) * query.pageSize;
    const { items, total } = live
      ? { items: live.years.slice(skip, skip + query.pageSize), total: live.years.length }
      : await this.checks.pageYears((check as CheckRecord).id, skip, query.pageSize);
    const money = await this.formatter(live ? live.currency : (check as CheckRecord).currency);
    const decided = await this.decisions.latest(requestId);
    const overridden = new Set(check && decided?.checkId === check.id ? decided.overrideYears : []);
    const nullable = (value: bigint | null): Money | null => (value === null ? null : money(value));

    return pageOf(
      items.map((year): YearWire => ({
        year: year.year,
        cost: money(year.costMinor),
        code: year.code,
        budget: nullable(year.budgetMinor),
        held: nullable(year.heldMinor),
        spent: nullable(year.spentMinor),
        remaining: nullable(year.remainingMinor),
        shareBasisPoints: year.shareBasisPoints,
        pending: nullable(year.pendingMinor),
        overridden: overridden.has(year.year),
      })),
      total,
      query.page,
      query.pageSize,
    );
  }

  /**
   * What the check says now, for the person whose spend step is open: they see what is left and what the others that wait cost
   * as they are at this moment, and what they decide on is made again when they decide (`US-06-01` AC-1, AC-9, AC-18). The
   * years of a request are few, since the term is bounded, so the page is cut from them here. Null for anybody else, and for a
   * request that cannot be checked, which is read as it was kept.
   */
  private async liveYears(
    actor: AuthenticatedPrincipal,
    requestId: string,
  ): Promise<{ currency: string; years: YearResult[] } | null> {
    const step = await this.steps.findOpen(requestId, 'SPEND_APPROVAL');
    const request = await this.requests.findById(requestId);
    if (!step || !request || step.state !== 'PENDING' || step.assigneeEmployeeId !== actor.employeeId) return null;
    const computed = await this.runner.run((tx) => this.compute.compute(tx, request, new Date()));

    return computed.status === 'COMPUTED' ? { currency: computed.currency, years: computed.result.years } : null;
  }

  /**
   * Finance reads every check; the person the spend step is given to reads the check of their own step, and nobody else
   * reads one (`US-06-01` AC-1). The head and the requester are not among them.
   */
  private async requireReader(actor: AuthenticatedPrincipal, requestId: string): Promise<void> {
    if (!(await this.requests.findById(requestId))) throw new SpendReviewNotFoundError();
    if (actor.roles.includes('FINANCE')) return;
    const spend = await this.steps.findLatest(requestId, 'SPEND_APPROVAL');
    if (spend?.assigneeEmployeeId === actor.employeeId) return;

    throw new SpendReviewNotFoundError();
  }

  private async checkWire(check: CheckRecord, requestId: string): Promise<CheckWire> {
    const money = await this.formatter(check.currency);
    const spend = await this.steps.findLatest(requestId, 'SPEND_APPROVAL');

    return {
      id: check.id,
      number: check.number,
      trigger: check.trigger,
      route: check.route,
      primaryCode: codesOf(check)[0] ?? null,
      staleCostEvidence: check.staleCostEvidence,
      planLineOverdue: check.planLineOverdue,
      periodClosed: check.periodClosed,
      offPlan: check.offPlan,
      noIndependentReview: spend?.noIndependentReview ?? false,
      bindingTotal: money(check.bindingTotalMinor),
      yearCount: check.years.length,
      ranAt: check.ranAt.toISOString(),
    };
  }

  private stepWire(
    step: SpendStepRecord,
    people: Map<string, { employeeId: string; employeeCode: string; fullName: string }>,
  ) {
    return {
      id: step.id,
      state: step.state as 'PENDING' | 'WAITING' | 'COMPLETED' | 'CLOSED',
      waitingReason: step.waitingReason as 'NO_FINANCE_REVIEWER' | null,
      assignee: step.assigneeEmployeeId === null ? null : (people.get(step.assigneeEmployeeId) ?? null),
      openedAt: step.createdAt.toISOString(),
      closedAt: step.decidedAt?.toISOString() ?? null,
      slaWorkingDays: step.slaWorkingDays,
    };
  }

  private async formatter(currency: string): Promise<(minor: bigint) => Money> {
    const units = (await this.finance.findCurrency(currency))?.minorUnit ?? 2;

    return (minor) => ({ amount: formatAmount(minor, units), currency });
  }

  private async people(ids: readonly string[]) {
    const wanted = [...new Set(ids)];
    const found = wanted.length === 0 ? [] : await this.organization.getEmployees(wanted);

    return new Map(
      found.map((employee) => [
        employee.id,
        { employeeId: employee.id, employeeCode: employee.employeeCode, fullName: employee.fullName },
      ]),
    );
  }
}
