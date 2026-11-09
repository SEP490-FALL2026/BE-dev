import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import { fiscalYearOf } from '../../../core/fiscal-year';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { BudgetsApi } from '../../budgets/public/budgets.api';
import { AuditApi } from '../../audit/public/audit.api';
import { FinanceApi } from '../../finance/public/finance.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { accessRequestAuditEvent } from '../access-request/access-request-audit-event.mapper';
import { AccessRequestNotPriceableError } from '../access-request/access-request.errors';
import { chargedCostCenterId } from '../access-request/access-request.policy';
import { AccessRequestRepo } from '../access-request/access-request.repo';
import type { AccessRequestRecord, PricingRecord } from '../access-request/access-request.types';
import { RepricingService } from '../assessment/repricing.service';
import { AssessmentReadRepo } from '../access-request/assessment-read.repo';
import { scaleAmount } from './line-allocation.policy';
import { checkBudget, type CheckResult, type YearBudget, type YearSlice } from './budget-check.policy';
import { BudgetCheckRepo, type CheckRecord, type CheckTrigger } from './budget-check.repo';

/** The same amount for the same year and months: nothing to write. */
const isSameAmount = (before: PricingRecord, after: PricingRecord): boolean =>
  before.status === 'PRICED' &&
  before.amount?.amountMinor === after.amount?.amountMinor &&
  before.budgetYear === after.budgetYear &&
  before.amountMonths === after.amountMonths &&
  before.kind === after.kind;

/** Why a request cannot be checked at all: it is not a case for the check, but for whoever gives it its price or its rate. */
export type NotCheckable = 'PRICE_MISSING' | 'RATE_MISSING';

/** The part of a request that is checked: its payments are made for `priced` people and the check is of `scoped` of them. */
export interface CheckScope {
  priced: number;
  scoped: number;
}

export type CheckOutcome =
  { status: 'CHECKED'; check: CheckRecord } | { status: 'NOT_CHECKABLE'; reason: NotCheckable };

/**
 * Makes one check of the budget of a request (`US-06-12`) and keeps it. It works the amount of the request out again for the day of the
 * check (`QĐ-109e`: the months left of that year, at the price of that day), reads the year it falls in, turns the amount into the
 * estimate that falls on the company in the reporting currency at the rate of the day, reads the current budget of that year, and gives
 * the whole to the pure judgement. It decides nothing about who looks next: the routing does, from what is kept here. It runs in the
 * transaction of the caller, so the check and the move it leads to are one.
 */
@Injectable()
export class BudgetCheckService {
  constructor(
    private readonly checks: BudgetCheckRepo,
    private readonly budgets: BudgetsApi,
    private readonly finance: FinanceApi,
    private readonly organizationReads: OrganizationReadApi,
    private readonly assessments: AssessmentReadRepo,
    private readonly repricing: RepricingService,
    private readonly requests: AccessRequestRepo,
    private readonly audit: AuditApi,
  ) {}

  /**
   * Makes a check of the request and keeps it. The caller holds the lock of the request. The amount is worked out again for today and
   * written when it changed (`ACCESS_REQUEST.REPRICED`; `request.pricing` is the new one on return); then this takes the lock of the
   * Cost Center and the year, before it reads a figure of the budget, and keeps it to the end of the transaction, which is also where
   * the commitment of an approval is written.
   */
  async run(
    tx: DbTx,
    request: AccessRequestRecord,
    trigger: CheckTrigger,
    actor: AuthenticatedPrincipal | null,
    now: Date,
    scope?: CheckScope,
  ): Promise<CheckOutcome> {
    const today = await this.organizationReads.businessToday(now, tx);
    const repriced = await this.priceOn(tx, request, today);
    if (repriced === null) return { status: 'NOT_CHECKABLE', reason: 'PRICE_MISSING' };
    await this.keepRepriced(tx, request, repriced, { trigger, actor, today });

    await this.checks.lockBudgetYears(tx, chargedCostCenterId(request), this.bindingYears(request));
    const computed = await this.computeOn(tx, request, today, scope);
    if (computed.status === 'NOT_CHECKABLE') return computed;

    const { result } = computed;
    const check = await this.checks.insert(tx, {
      organizationId: request.organizationId,
      requestId: request.id,
      trigger,
      route: result.route,
      staleCostEvidence: result.staleCostEvidence,
      planLineOverdue: result.planLineOverdue,
      periodClosed: result.periodClosed,
      offPlan: false,
      currency: computed.currency,
      bindingTotalMinor: computed.bindingTotalMinor,
      years: result.years,
      ranByEmployeeId: actor?.employeeId ?? null,
      now,
    });

    return { status: 'CHECKED', check };
  }

  /**
   * The request priced for `today` (`QĐ-109e`), or null when it cannot be priced that day: no price in the catalog, a quote that is not in
   * force. Nothing is written.
   */
  private async priceOn(tx: DbTx, request: AccessRequestRecord, today: BusinessDate): Promise<PricingRecord | null> {
    let priced: PricingRecord;
    try {
      priced = await this.repricing.reprice(tx, request, today);
    } catch (error) {
      if (error instanceof AccessRequestNotPriceableError) return null;
      throw error;
    }

    return priced.status === 'PRICED' && priced.amount !== null ? priced : null;
  }

  /** Writes the new amount over the old one when it changed, and leaves the request in the caller's hands with it. */
  private async keepRepriced(
    tx: DbTx,
    request: AccessRequestRecord,
    repriced: PricingRecord,
    by: { trigger: CheckTrigger; actor: AuthenticatedPrincipal | null; today: BusinessDate },
  ): Promise<void> {
    const before = request.pricing;
    if (isSameAmount(before, repriced)) return;

    await this.requests.setPricing(tx, request.id, repriced);
    request.pricing = repriced;
    if (by.actor === null) return;
    await this.audit.record(
      tx,
      accessRequestAuditEvent(
        by.actor,
        request.organizationId,
        'ACCESS_REQUEST.REPRICED',
        'ACCESS_REQUEST',
        request.id,
        {
          requestId: request.id,
          trigger: by.trigger,
          checkDate: by.today,
          beforeAmountMinor: before.amount?.amountMinor.toString() ?? null,
          afterAmountMinor: repriced.amount?.amountMinor.toString() ?? null,
          beforeBudgetYear: before.budgetYear,
          afterBudgetYear: repriced.budgetYear,
          beforeMonths: before.amountMonths,
          afterMonths: repriced.amountMonths,
        },
      ),
    );
  }

  /** The year the amount that binds falls in, whichever of them is open: what the check reads and what a commitment holds. */
  private bindingYears(request: AccessRequestRecord): number[] {
    const { pricing } = request;
    if (pricing.status !== 'PRICED' || pricing.budgetYear === null) return [];

    return [pricing.budgetYear];
  }

  /**
   * What a check would say now, as it reads the figures at this moment, without keeping it: the spending approver opens their
   * step and sees what is left and what the others that wait cost today, not as they were when the request was sent. The amount is the
   * one of today, in memory only.
   */
  async compute(
    tx: DbTx,
    request: AccessRequestRecord,
    now: Date,
    scope?: CheckScope,
  ): Promise<
    | { status: 'COMPUTED'; result: CheckResult; currency: string; bindingTotalMinor: bigint }
    | { status: 'NOT_CHECKABLE'; reason: NotCheckable }
  > {
    const today = await this.organizationReads.businessToday(now, tx);
    const repriced = await this.priceOn(tx, request, today);
    if (repriced === null) return { status: 'NOT_CHECKABLE', reason: 'PRICE_MISSING' };

    return this.computeOn(tx, { ...request, pricing: repriced }, today, scope);
  }

  /** The one year the request is counted in: its budget, what waits to be decided against it, and whether it is closed. */
  private async sliceOf(
    tx: DbTx,
    request: AccessRequestRecord,
    year: { year: number; currentYear: number; costMinor: bigint },
  ): Promise<YearSlice> {
    const isOpen = year.year >= year.currentYear;
    const costCenterId = chargedCostCenterId(request);
    const facts = await this.budgets.yearFacts(costCenterId, isOpen ? [year.year] : [], tx);
    const pendingMinor = isOpen ? await this.checks.pendingFor(costCenterId, year.year, request.id, tx) : 0n;
    const found = facts.get(year.year);
    const budget: YearBudget | null = found
      ? {
          versionId: found.versionId,
          totalMinor: found.totalMinor,
          heldMinor: found.heldMinor,
          spentMinor: found.spentMinor,
        }
      : null;

    return { year: year.year, costMinor: year.costMinor, closed: !isOpen, budget, pendingMinor };
  }

  /** The check of a request whose `pricing` is already the amount of `today`. */
  private async computeOn(
    tx: DbTx,
    request: AccessRequestRecord,
    today: BusinessDate,
    scope?: CheckScope,
  ): Promise<
    | { status: 'COMPUTED'; result: CheckResult; currency: string; bindingTotalMinor: bigint }
    | { status: 'NOT_CHECKABLE'; reason: NotCheckable }
  > {
    const { pricing } = request;
    if (pricing.status !== 'PRICED' || pricing.amount === null || pricing.budgetYear === null) {
      return { status: 'NOT_CHECKABLE', reason: 'PRICE_MISSING' };
    }
    // A request for a group is checked on the people approved: the amount is the part of it for fewer people.
    const checked = scope
      ? scaleAmount(pricing.amount.amountMinor, scope.priced, scope.scoped)
      : pricing.amount.amountMinor;
    if (checked === null) return { status: 'NOT_CHECKABLE', reason: 'PRICE_MISSING' };

    const currentYear = fiscalYearOf(today);
    const assessment = request.branch === 'NEW_SOFTWARE' ? await this.assessments.findAssessment(request.id, tx) : null;

    // What the company bears is the price before tax (`FR-3.2`): no estimate of tax is added to the amount that is checked.
    const year = pricing.budgetYear;
    const converted = await this.finance.snapshotMoney(
      tx,
      { amountMinor: checked, currency: pricing.amount.currency },
      today,
    );
    if (converted.status === 'MISSING_RATE') return { status: 'NOT_CHECKABLE', reason: 'RATE_MISSING' };
    const reporting = converted.snapshot.reportingCurrency;
    const costMinor = converted.snapshot.reportingAmountMinor;

    const slices = [await this.sliceOf(tx, request, { year, currentYear, costMinor })];

    const quoteValidUntil = assessment?.quote?.validUntil ?? null;
    const result = checkBudget({
      slices,
      staleCostEvidence: quoteValidUntil !== null && quoteValidUntil < today,
      // A request is not attached to a line of the plan any more (`QĐ-101n`): none is overdue.
      planLineOverdue: false,
    });

    return { status: 'COMPUTED', result, currency: reporting, bindingTotalMinor: costMinor };
  }
}
