import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { CatalogApi } from '../../catalog/public/catalog.api';
import { LicensingApi } from '../../licensing/public/licensing.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { BudgetCycleNotFoundError, BudgetNotYourCostCenterError } from '../budget/budget.errors';
import { BudgetFactsService } from '../budget/budget-facts.service';
import { CommitmentRepo, heldKey } from '../budget/commitment.repo';
import { estimatedCost, monthlyUnitPrice, monthsRunning, shouldSuggestRenewal } from './baseline.policy';
import type { BaselineSubscription } from '../../catalog/public/catalog.types';
import type { BaselineWire } from './cycle.dto';
import { CycleRepo } from './cycle.repo';

type Reading = {
  year: number;
  today: BusinessDate;
  seats: Map<string, number>;
  spent: Map<string, { spent: bigint }>;
  format: (minor: bigint) => { amount: string; currency: string };
};

/** One department of the baseline: its subscriptions, the seats they hold and what the year is estimated to cost at today's prices. */
function departmentOf(
  brief: { code: string; name: string },
  costCenterId: string | null,
  subscriptions: readonly BaselineSubscription[],
  reading: Reading,
): BaselineWire['departments'][string] {
  const { year, today, seats, spent, format } = reading;
  const software: BaselineWire['departments'][string]['software'] = {};
  let total = 0n;
  let purchased = 0;
  let assigned = 0;
  for (const subscription of subscriptions) {
    const held = seats.get(subscription.subscriptionId) ?? 0;
    const monthly = monthlyUnitPrice(subscription.unitPriceReportingMinor, subscription.billingCycle);
    const months = monthsRunning(year, subscription.startDate, subscription.endDate);
    const cost = estimatedCost(subscription.purchasedQuantity, monthly, months);
    total += cost ?? 0n;
    purchased += subscription.purchasedQuantity ?? 0;
    assigned += held;
    software[subscription.subscriptionId] = {
      application: subscription.applicationName,
      plan: subscription.planName,
      seatsPurchased: subscription.purchasedQuantity,
      seatsAssigned: held,
      seatsIdle: subscription.purchasedQuantity === null ? null : Math.max(0, subscription.purchasedQuantity - held),
      monthlyUnitPrice: monthly === null ? null : format(monthly),
      monthsRunning: months,
      estimatedAnnualCost: cost === null ? null : format(cost),
      suggestRenewal: shouldSuggestRenewal(year, subscription.endDate),
    };
  }
  const thisYear = Number(today.slice(0, 4));

  return {
    departmentCode: brief.code,
    departmentName: brief.name,
    costCenterId,
    spentThisYear: format(costCenterId === null ? 0n : (spent.get(heldKey(costCenterId, thisYear))?.spent ?? 0n)),
    estimatedAnnualCost: format(total),
    seatsPurchased: purchased,
    seatsAssigned: assigned,
    software,
  };
}

/**
 * What runs today, department by department, and what it is estimated to cost over a year (`FR-5.15`, `R-I03`): the active
 * subscriptions each department owns, their seats (held and idle), the price of a seat by the month and what the year costs at that
 * price. Finance and the spending approver read every department, a head only their own. Read-only; the numbers are computed when read,
 * from the catalog and the seats, in a fixed number of statements for any number of departments.
 */
@Injectable()
export class BaselineService {
  constructor(
    private readonly facts: BudgetFactsService,
    private readonly cycles: CycleRepo,
    private readonly organizationReads: OrganizationReadApi,
    private readonly catalog: CatalogApi,
    private readonly licensing: LicensingApi,
    private readonly commitments: CommitmentRepo,
  ) {}

  /** Throws BudgetCycleNotFoundError and BudgetNotYourCostCenterError (a head asking for a department that is not theirs, or for none). */
  async read(actor: AuthenticatedPrincipal, year: number, departmentId?: string): Promise<BaselineWire> {
    const today = await this.facts.today(new Date());
    const wholeCompany = actor.roles.includes('FINANCE') || (await this.facts.isSpendingApprover(actor.employeeId));
    if (!wholeCompany) await this.requireOwnDepartment(actor, today, year, departmentId);
    const cycle = await this.cycles.findByYear(await this.facts.organizationId(), year);
    if (!cycle) throw new BudgetCycleNotFoundError();

    const inYear = await this.organizationReads.getActiveDepartmentIds(year);
    const wanted = departmentId === undefined ? inYear : inYear.filter((id) => id === departmentId);
    const [briefs, costCenters, subscriptions, format] = await Promise.all([
      this.organizationReads.getDepartmentBriefs(wanted),
      this.organizationReads.getUnitCostCenterIds(wanted),
      this.catalog.getBaselineSubscriptions(wanted),
      this.facts.formatter(cycle.currency),
    ]);
    const seats = await this.licensing.countSeatsOfSubscriptions(
      subscriptions.map((subscription) => subscription.subscriptionId),
      today,
    );
    const spent = await this.commitments.totals(
      [...costCenters.values()].map((costCenterId) => ({ costCenterId, year: Number(today.slice(0, 4)) })),
    );

    const reading: Reading = { year, today, seats, spent, format };
    const departments: BaselineWire['departments'] = {};
    for (const brief of briefs) {
      departments[brief.id] = departmentOf(
        brief,
        costCenters.get(brief.id) ?? null,
        subscriptions.filter((row) => row.departmentId === brief.id),
        reading,
      );
    }

    return { year, currency: cycle.currency, computedAt: new Date().toISOString(), kpi3: null, departments };
  }

  /** A head reads the baseline of their own department only, and names it. */
  private async requireOwnDepartment(
    actor: AuthenticatedPrincipal,
    today: BusinessDate,
    year: number,
    departmentId: string | undefined,
  ): Promise<void> {
    const units = departmentId === undefined ? [] : await this.facts.headedUnitsFor(actor.employeeId, today, year);
    if (!units.some((unit) => unit.departmentId === departmentId)) throw new BudgetNotYourCostCenterError();
  }
}
