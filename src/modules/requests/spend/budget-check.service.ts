import { Injectable } from '@nestjs/common';
import { fiscalYearOf } from '../../../core/fiscal-year';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { BudgetsApi } from '../../budgets/public/budgets.api';
import { CatalogApi } from '../../catalog/public/catalog.api';
import { FinanceApi } from '../../finance/public/finance.api';
import { OperatingParametersApi } from '../../operating-parameters/public/operating-parameters.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { chargedCostCenterId } from '../access-request/access-request.policy';
import type { AccessRequestRecord } from '../access-request/access-request.types';
import { AssessmentReadRepo } from '../access-request/assessment-read.repo';
import { scaleSchedule } from './line-allocation.policy';
import { checkBudget, type CheckResult, type YearBudget, type YearSlice } from './budget-check.policy';
import { BudgetCheckRepo, type CheckRecord, type CheckTrigger } from './budget-check.repo';

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
 * Makes one check of the budget of a request (`US-06-12`) and keeps it. It reads what the request costs year by year (only
 * the payments that bind, `QĐ-84a`), turns it into the estimate that falls on the company (`QĐ-60a`) in the reporting
 * currency at the rate of the day, reads the current budget of each open year, and gives the whole to the pure judgement.
 * It decides nothing about who looks next: the routing does, from what is kept here. It runs in the transaction of the
 * caller, so the check and the move it leads to are one.
 */
@Injectable()
export class BudgetCheckService {
  constructor(
    private readonly checks: BudgetCheckRepo,
    private readonly budgets: BudgetsApi,
    private readonly finance: FinanceApi,
    private readonly catalog: CatalogApi,
    private readonly organizationReads: OrganizationReadApi,
    private readonly parameters: OperatingParametersApi,
    private readonly assessments: AssessmentReadRepo,
  ) {}

  /**
   * Makes a check of the request and keeps it. The caller holds the lock of the request; this takes the lock of the Cost Center and
   * each year the request binds in, in ascending order, before it reads a figure of the budget, and keeps it to the end of the
   * transaction, which is also where the commitment of an approval is written.
   */
  async run(
    tx: DbTx,
    request: AccessRequestRecord,
    trigger: CheckTrigger,
    actor: AuthenticatedPrincipal | null,
    now: Date,
    scope?: CheckScope,
  ): Promise<CheckOutcome> {
    await this.checks.lockBudgetYears(tx, chargedCostCenterId(request), this.bindingYears(request, scope));
    const computed = await this.compute(tx, request, now, scope);
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

  /** The years the payments that bind fall in, whichever of them are open: what the check reads and what a commitment holds. */
  private bindingYears(request: AccessRequestRecord, scope?: CheckScope): number[] {
    const { pricing } = request;
    if (pricing.status !== 'PRICED' || pricing.schedule === null) return [];
    const schedule = scope ? scaleSchedule(pricing.schedule, scope.priced, scope.scoped) : pricing.schedule;

    return [...new Set((schedule ?? []).filter((period) => period.binding).map((period) => period.budgetYear))];
  }

  /**
   * What a check would say now, as it reads the figures at this moment, without keeping it: the spending approver opens their
   * step and sees what is left and what the others that wait cost today, not as they were when the request was sent.
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
    const { pricing } = request;
    if (pricing.status !== 'PRICED' || pricing.amount === null || pricing.schedule === null) {
      return { status: 'NOT_CHECKABLE', reason: 'PRICE_MISSING' };
    }
    // A request for a group is checked on the people approved: the payments are those for fewer people, in whole minor units.
    const schedule = scope ? scaleSchedule(pricing.schedule, scope.priced, scope.scoped) : pricing.schedule;
    if (schedule === null) return { status: 'NOT_CHECKABLE', reason: 'PRICE_MISSING' };
    const binding = new Map<number, bigint>();
    for (const period of schedule) {
      if (period.binding) binding.set(period.budgetYear, (binding.get(period.budgetYear) ?? 0n) + period.amountMinor);
    }
    if (binding.size === 0) return { status: 'NOT_CHECKABLE', reason: 'PRICE_MISSING' };

    const today = await this.organizationReads.businessToday(now, tx);
    const startMonth = Number(await this.parameters.getValue('FISCAL_YEAR_START_MONTH'));
    const currentYear = fiscalYearOf(today, startMonth);
    const assessment = request.branch === 'NEW_SOFTWARE' ? await this.assessments.findAssessment(request.id, tx) : null;

    const years = [...binding.keys()].sort((a, b) => a - b);
    const costs = await this.costs(tx, request, assessment?.vendorId ?? null, years, binding);
    const converted = new Map<number, bigint>();
    let reporting = '';
    for (const year of years) {
      const result = await this.finance.snapshotMoney(
        tx,
        { amountMinor: costs.get(year) as bigint, currency: pricing.amount.currency },
        today,
      );
      if (result.status === 'MISSING_RATE') return { status: 'NOT_CHECKABLE', reason: 'RATE_MISSING' };
      converted.set(year, result.snapshot.reportingAmountMinor);
      reporting = result.snapshot.reportingCurrency;
    }

    const open = years.filter((year) => year >= currentYear);
    const facts = await this.budgets.yearFacts(chargedCostCenterId(request), open, tx);
    const pending = new Map<number, bigint>();
    for (const year of open)
      pending.set(year, await this.checks.pendingFor(chargedCostCenterId(request), year, request.id, tx));
    const slices: YearSlice[] = years.map((year) => {
      const found = facts.get(year);
      const budget: YearBudget | null = found
        ? {
            versionId: found.versionId,
            totalMinor: found.totalMinor,
            heldMinor: found.heldMinor,
            spentMinor: found.spentMinor,
          }
        : null;

      return {
        year,
        costMinor: converted.get(year) as bigint,
        closed: year < currentYear,
        budget,
        pendingMinor: pending.get(year) ?? 0n,
      };
    });

    const quoteValidUntil = assessment?.quote?.validUntil ?? null;
    const result = checkBudget({
      slices,
      staleCostEvidence: quoteValidUntil !== null && quoteValidUntil < today,
      // A request is not attached to a line of the plan any more (`QĐ-101n`): none is overdue.
      planLineOverdue: false,
    });

    return {
      status: 'COMPUTED',
      result,
      currency: reporting,
      bindingTotalMinor: [...converted.values()].reduce((sum, value) => sum + value, 0n),
    };
  }

  /**
   * What each year costs the company: the payment of the year and the tax on it that is not deducted (`QĐ-60a`, `AC-14`). A
   * request with no vendor to hold a tax profile costs what it says.
   */
  private async costs(
    tx: DbTx,
    request: AccessRequestRecord,
    assessmentVendorId: string | null,
    years: readonly number[],
    binding: ReadonlyMap<number, bigint>,
  ): Promise<Map<number, bigint>> {
    const vendorId = request.planId ? await this.catalog.getPlanVendorId(request.planId, tx) : assessmentVendorId;
    if (vendorId === null) return new Map(years.map((year) => [year, binding.get(year) as bigint]));

    const estimates = await this.finance.estimateTaxMany(
      years.map((year) => ({ vendorId, netMinor: binding.get(year) as bigint })),
      tx,
    );

    return new Map(years.map((year, index) => [year, estimates[index].estimatedCostMinor]));
  }
}
