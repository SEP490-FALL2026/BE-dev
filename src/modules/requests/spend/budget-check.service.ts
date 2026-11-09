import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { BudgetsReadApi } from '../../budgets/public/budgets-read.api';
import { AuditApi } from '../../audit/public/audit.api';
import { FinanceApi } from '../../finance/public/finance.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { accessRequestAuditEvent } from '../access-request/access-request-audit-event.mapper';
import { AccessRequestNotPriceableError } from '../access-request/access-request.errors';
import { AccessRequestRepo } from '../access-request/access-request.repo';
import type { AccessRequestRecord, PricingRecord } from '../access-request/access-request.types';
import { RepricingService } from '../repricing/repricing.service';
import { AssessmentReadRepo } from '../access-request/assessment-read.repo';
import { scaleAmount } from './line-allocation.policy';
import { checkBudget, type CheckResult, type YearBudget } from './budget-check.policy';
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

type Computed =
  | {
      status: 'COMPUTED';
      result: CheckResult;
      currency: string;
      bindingTotalMinor: bigint;
      costCenterId: string | null;
    }
  | { status: 'NOT_CHECKABLE'; reason: NotCheckable };

/**
 * The Cost Center a check reads (`BR-MF1-06d`, `M-12`): the one the department has now, not the one the request was sent with. At the
 * decision the check is made again and a Cost Center that is not the one of the check before is blocked, with the reason that there is no
 * approved budget (RV-09); the commitment held before stays in the Cost Center it was held in.
 */
interface CostCenterRead {
  id: string | null;
  changed: boolean;
}

/**
 * Makes one check of the budget of a request (`US-06-12`) and keeps it. It works the amount of the request out again for the day of the
 * check (`QĐ-109e`: the months left of that year, at the price of that day), reads the year it falls in, turns the amount into the
 * estimate that falls on the company in the reporting currency at the rate of the day, reads the approved budget of that year in the
 * current Cost Center of the department, and gives the whole to the pure judgement. It decides nothing about who looks next: the routing
 * does, from what is kept here. It runs in the transaction of the caller, so the check and the move it leads to are one.
 */
@Injectable()
export class BudgetCheckService {
  constructor(
    private readonly checks: BudgetCheckRepo,
    private readonly budgets: BudgetsReadApi,
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

    const costCenter = await this.costCenterOf(tx, request, trigger);
    if (costCenter.id !== null) await this.checks.lockBudgetYears(tx, costCenter.id, this.bindingYears(request));
    const computed = await this.computeOn(tx, request, today, costCenter, scope);
    if (computed.status === 'NOT_CHECKABLE') return computed;

    const { result } = computed;
    const check = await this.checks.insert(tx, {
      organizationId: request.organizationId,
      requestId: request.id,
      trigger,
      route: result.route,
      staleCostEvidence: result.staleCostEvidence,
      outcome: result.outcome,
      blockReasons: result.blockReasons,
      overBaseByMinor: result.overBaseByMinor,
      overByMinor: result.overByMinor,
      costCenterId: computed.costCenterId,
      currency: computed.currency,
      bindingTotalMinor: computed.bindingTotalMinor,
      years: result.years,
      ranByEmployeeId: actor?.employeeId ?? null,
      now,
    });

    return { status: 'CHECKED', check };
  }

  /**
   * What a check would say now, as it reads the figures at this moment, without keeping it: the spending approver opens their
   * step and sees what is left and what the others that wait cost today, not as they were when the request was sent. The amount is the
   * one of today, in memory only. `trigger` says what the check is for: a decision compares the Cost Center with the check before.
   */
  async compute(
    tx: DbTx,
    request: AccessRequestRecord,
    now: Date,
    scope?: CheckScope,
    trigger: CheckTrigger = 'SPEND_DECISION',
  ): Promise<Computed> {
    const today = await this.organizationReads.businessToday(now, tx);
    const repriced = await this.priceOn(tx, request, today);
    if (repriced === null) return { status: 'NOT_CHECKABLE', reason: 'PRICE_MISSING' };
    const costCenter = await this.costCenterOf(tx, request, trigger);

    return this.computeOn(tx, { ...request, pricing: repriced }, today, costCenter, scope);
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

  /** The year the amount that binds falls in: what the check reads and what a commitment holds. */
  private bindingYears(request: AccessRequestRecord): number[] {
    const { pricing } = request;
    if (pricing.status !== 'PRICED' || pricing.budgetYear === null) return [];

    return [pricing.budgetYear];
  }

  /** The Cost Center in use of the department now, and whether a decision finds it is not the one the request was last checked against. */
  private async costCenterOf(tx: DbTx, request: AccessRequestRecord, trigger: CheckTrigger): Promise<CostCenterRead> {
    const current = (await this.organizationReads.getUnitCostCenterIds([request.departmentId], tx)).get(
      request.departmentId,
    );
    if (current === undefined) return { id: null, changed: false };
    if (trigger !== 'SPEND_DECISION') return { id: current, changed: false };
    const prior = (await this.checks.latest(request.id, tx))?.costCenterId ?? request.costCenterId;

    return { id: current, changed: prior !== null && prior !== current };
  }

  /** The approved budget of the year in the Cost Center, with what is held and spent; null when there is none, or the Cost Center changed. */
  private async budgetOf(tx: DbTx, costCenter: CostCenterRead, year: number): Promise<YearBudget | null> {
    if (costCenter.id === null || costCenter.changed) return null;
    const found = (await this.budgets.yearFacts(costCenter.id, [year], tx)).get(year);

    return found
      ? {
          versionId: found.versionId,
          baseMinor: found.baseMinor,
          reserveMinor: found.reserveMinor,
          heldMinor: found.heldMinor,
          spentMinor: found.spentMinor,
        }
      : null;
  }

  /** The check of a request whose `pricing` is already the amount of `today`. */
  private async computeOn(
    tx: DbTx,
    request: AccessRequestRecord,
    today: BusinessDate,
    costCenter: CostCenterRead,
    scope?: CheckScope,
  ): Promise<Computed> {
    const { pricing } = request;
    const converted = await this.costOf(tx, request, today, scope);
    if (converted.status === 'NOT_CHECKABLE' || pricing.budgetYear === null) {
      return converted.status === 'NOT_CHECKABLE' ? converted : { status: 'NOT_CHECKABLE', reason: 'PRICE_MISSING' };
    }
    const costMinor = converted.costMinor;

    // The year is the one the amount was worked out for, which is the year of the day of the check (`QĐ-109e`).
    const year = pricing.budgetYear;
    const budget = await this.budgetOf(tx, costCenter, year);
    const pendingMinor =
      costCenter.id === null ? 0n : await this.checks.pendingFor(costCenter.id, year, request.id, tx);
    const assessment = request.branch === 'NEW_SOFTWARE' ? await this.assessments.findAssessment(request.id, tx) : null;
    const quoteValidUntil = assessment?.quote?.validUntil ?? null;
    const result = checkBudget({
      slice: { year, costMinor, budget, pendingMinor },
      priceExpired: quoteValidUntil !== null && quoteValidUntil < today,
    });

    return {
      status: 'COMPUTED',
      result,
      currency: converted.currency,
      bindingTotalMinor: costMinor,
      costCenterId: costCenter.id,
    };
  }

  /**
   * What the request costs the company, in the reporting currency at the rate of the day: the price before tax (`FR-3.2`), so no estimate of
   * tax is added. A request for a group is checked on the people approved: the amount is the part of it for fewer people.
   */
  private async costOf(
    tx: DbTx,
    request: AccessRequestRecord,
    today: BusinessDate,
    scope?: CheckScope,
  ): Promise<
    { status: 'COST'; costMinor: bigint; currency: string } | { status: 'NOT_CHECKABLE'; reason: NotCheckable }
  > {
    const { amount } = request.pricing;
    if (request.pricing.status !== 'PRICED' || amount === null)
      return { status: 'NOT_CHECKABLE', reason: 'PRICE_MISSING' };
    const checked = scope ? scaleAmount(amount.amountMinor, scope.priced, scope.scoped) : amount.amountMinor;
    if (checked === null) return { status: 'NOT_CHECKABLE', reason: 'PRICE_MISSING' };

    const converted = await this.finance.snapshotMoney(tx, { amountMinor: checked, currency: amount.currency }, today);
    if (converted.status === 'MISSING_RATE') return { status: 'NOT_CHECKABLE', reason: 'RATE_MISSING' };

    return {
      status: 'COST',
      costMinor: converted.snapshot.reportingAmountMinor,
      currency: converted.snapshot.reportingCurrency,
    };
  }
}
