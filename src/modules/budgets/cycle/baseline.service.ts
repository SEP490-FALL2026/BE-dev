import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { CatalogApi } from '../../catalog/public/catalog.api';
import { LicensingApi } from '../../licensing/public/licensing.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import {
  BudgetBaselineVersionNotAllowedError,
  BudgetCycleNotFoundError,
  BudgetNotYourCostCenterError,
} from '../budget/budget.errors';
import { BudgetFactsService } from '../budget/budget-facts.service';
import { CommitmentRepo, heldKey } from '../budget/commitment.repo';
import { ProposalRepo } from '../budget/proposal.repo';
import {
  allocateSeats,
  baselineLinesOf,
  type BaselineLine,
  inOrderOf,
  listedDepartments,
  poolIdleSeats,
  SOFTWARE_LISTED_MAX,
  baselineVersionRefusal,
  cancelledCost,
  type SeatAllocation,
  shouldSuggestRenewal,
  subscriptionCost,
} from './baseline.policy';
import type { BaselineSubscription } from '../../catalog/public/catalog.types';
import type { BaselineWire } from './cycle.dto';
import { CycleRepo } from './cycle.repo';

type Reading = {
  year: number;
  today: BusinessDate;
  /** The seats the people of the department hold, by subscription. */
  seats: ReadonlyMap<string, number>;
  /** The subscriptions the company has decided to end: they are not renewed (`Q-162`). */
  ending: ReadonlySet<string>;
  /** `KPI-3` in percent by plan, for the plans that have one. */
  kpi3ByPlan: ReadonlyMap<string, number>;
  spent: bigint;
  format: (minor: bigint) => { amount: string; currency: string };
};

/**
 * One department of the baseline (`QĐ-103k`): the subscriptions its people hold seats of, those seats, and what the year is estimated to
 * cost at today's prices. `subscriptions` are the ones the department holds seats of.
 */
export function departmentOf(
  brief: { id: string; code: string; name: string },
  costCenterId: string | null,
  subscriptions: readonly BaselineSubscription[],
  reading: Reading,
): BaselineWire['departments'][number] {
  const { year, today, seats, ending, kpi3ByPlan, spent, format } = reading;
  const software: BaselineWire['departments'][number]['software'] = [];
  let total = 0n;
  let assigned = 0;
  let unknown = false;
  for (const subscription of subscriptions) {
    const held = seats.get(subscription.subscriptionId) ?? 0;
    const terminated = ending.has(subscription.subscriptionId);
    const {
      monthlyMinor: monthly,
      months,
      costMinor: cost,
    } = subscriptionCost(year, today, held, subscription, terminated);
    total += cost ?? 0n;
    unknown ||= cost === null;
    // The seats of a period that a later one follows are the later one's too (the same people): they are counted once.
    if (!subscription.hasSuccessor) assigned += held;
    if (software.length >= SOFTWARE_LISTED_MAX) continue;
    software.push({
      subscriptionId: subscription.subscriptionId,
      application: subscription.applicationName,
      plan: subscription.planName,
      seatsPurchased: subscription.purchasedQuantity,
      seatsAssigned: held,
      monthlyUnitPrice: monthly === null ? null : format(monthly),
      monthsRunning: months,
      estimatedAnnualCost: cost === null ? null : format(cost),
      suggestRenewal: shouldSuggestRenewal(year, today, subscription, terminated),
      kpi3: kpi3ByPlan.get(subscription.planId) ?? null,
    });
  }

  return {
    departmentId: brief.id,
    departmentCode: brief.code,
    departmentName: brief.name,
    costCenterId,
    spentThisYear: format(spent),
    estimatedAnnualCost: format(total),
    hasUnknownCost: unknown,
    seatsAssigned: assigned,
    softwareTotal: subscriptions.length,
    software,
  };
}

type PoolLine = NonNullable<BaselineWire['sharedPoolUnallocated']>;

/**
 * The line _Unallocated - shared pool_ of the baseline (`QĐ-103k`, `QĐ-89a(2)`): the seats of the `K2`/`K4` subscriptions bought and held by
 * nobody, a line of the company in no department, which Finance reads to set the reserve of the shared pool (B2). Their cost is the same
 * reading as a department's (idle seats x monthly price x months running).
 */
export function sharedPoolLineOf(
  subscriptions: readonly BaselineSubscription[],
  reading: Pick<Reading, 'year' | 'today' | 'ending' | 'format'> & { held: ReadonlyMap<string, number> },
): PoolLine {
  const { year, today, held, ending, format } = reading;
  const software: PoolLine['software'] = [];
  let total = 0n;
  let idleTotal = 0;
  let unknown = false;
  let counted = 0;
  for (const subscription of subscriptions) {
    const holding = held.get(subscription.subscriptionId) ?? 0;
    const idle = poolIdleSeats(subscription.provisioningType, subscription.purchasedQuantity, holding);
    if (idle === null) continue;
    counted += 1;
    const terminated = ending.has(subscription.subscriptionId);
    const { monthlyMinor, months, costMinor } = subscriptionCost(year, today, idle, subscription, terminated);
    total += costMinor ?? 0n;
    unknown ||= costMinor === null;
    if (!subscription.hasSuccessor) idleTotal += idle;
    if (software.length >= SOFTWARE_LISTED_MAX) continue;
    software.push({
      subscriptionId: subscription.subscriptionId,
      application: subscription.applicationName,
      plan: subscription.planName,
      seatsPurchased: subscription.purchasedQuantity ?? 0,
      seatsAssigned: holding,
      seatsIdle: idle,
      monthlyUnitPrice: monthlyMinor === null ? null : format(monthlyMinor),
      monthsRunning: months,
      estimatedAnnualCost: costMinor === null ? null : format(costMinor),
    });
  }

  return {
    line: 'SHARED_POOL_UNALLOCATED',
    estimatedAnnualCost: format(total),
    hasUnknownCost: unknown,
    seatsIdle: idleTotal,
    softwareTotal: counted,
    software,
  };
}

/**
 * What runs today, department by department, and what it is estimated to cost over a year (`FR-5.15`, `R-I03`): every seat held is charged
 * to the department of the person who holds it (`QĐ-103k`), whichever department may own the subscription, so a shared-pool subscription
 * that owns none counts too; the seats bought and held by nobody are one line of the company, _Unallocated - shared pool_. Each department
 * lists the subscriptions its people hold, their seats, the price of a seat by the month, what the year costs at that price, and `KPI-3` of
 * the plan when usage was assessed (MF-5). Finance and the spending approver read every department and the pool line, a head only their
 * own department. Read-only; computed when read, in a fixed number of statements for any number of departments.
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
    private readonly proposals: ProposalRepo,
  ) {}

  /** Throws BudgetCycleNotFoundError and BudgetNotYourCostCenterError (a head asking for a department that is not theirs, or for none). */
  async read(actor: AuthenticatedPrincipal, year: number, departmentId?: string): Promise<BaselineWire> {
    const today = await this.facts.today(new Date());
    const wholeCompany = actor.roles.includes('FINANCE') || (await this.facts.isSpendingApprover(actor.employeeId));
    if (!wholeCompany) await this.requireOwnDepartment(actor, today, year, departmentId);
    const cycle = await this.cycles.findByYear(await this.facts.organizationId(), year);
    if (!cycle) throw new BudgetCycleNotFoundError();

    const inYear = await this.organizationReads.getActiveDepartmentIds(year);
    const wanted = listedDepartments(inYear, departmentId);
    const [briefs, costCenters, history, subscriptions, format] = await Promise.all([
      this.organizationReads.getDepartmentBriefs(wanted),
      this.organizationReads.getUnitCostCenterIds(wanted),
      this.organizationReads.getUnitCostCenterHistory(wanted),
      this.catalog.getBaselineSubscriptions(),
      this.facts.formatter(cycle.currency),
    ]);
    const { allocation, ending } = await this.seatsOf(subscriptions, today);
    const kpi3ByPlan = await this.catalog.getPlanKpi3([...new Set(subscriptions.map((one) => one.planId))]);
    const spentOf = await this.spentByDepartment(history, today);

    const departments = inOrderOf(wanted, briefs).map((brief) => {
      const seats = allocation.byDepartment.get(brief.id) ?? new Map<string, number>();

      return departmentOf(
        brief,
        costCenters.get(brief.id) ?? null,
        subscriptions.filter((subscription) => (seats.get(subscription.subscriptionId) ?? 0) > 0),
        { year, today, seats, ending, kpi3ByPlan, spent: spentOf(brief.id), format },
      );
    });

    return {
      year,
      basis: 'HOLDER_DEPARTMENT',
      currency: cycle.currency,
      computedAt: new Date().toISOString(),
      departmentsTotal: departmentId === undefined ? inYear.length : wanted.length,
      departments,
      sharedPoolUnallocated:
        departmentId === undefined
          ? sharedPoolLineOf(subscriptions, { year, today, held: allocation.held, ending, format })
          : null,
    };
  }

  /**
   * The seats of the subscriptions held today, charged to the department each holder is in today (`QĐ-103k`), and the subscriptions the
   * company ordered to end: four statements whatever the number of subscriptions or departments.
   */
  private async seatsOf(
    subscriptions: readonly BaselineSubscription[],
    today: BusinessDate,
    tx?: DbTx,
  ): Promise<{ allocation: SeatAllocation; ending: Set<string> }> {
    const ids = subscriptions.map((subscription) => subscription.subscriptionId);
    const holdings = await this.licensing.countSeatsByHolderOfSubscriptions(ids, today, tx);
    const units = await this.organizationReads.getOwningUnits(
      [...new Set(holdings.map((holding) => holding.employeeId))],
      today,
      tx,
    );
    const departmentOfHolder = new Map([...units].map(([employeeId, unit]) => [employeeId, unit.departmentId]));

    return {
      allocation: allocateSeats(holdings, departmentOfHolder),
      ending: await this.licensing.getSubscriptionIdsToEnd(ids, tx),
    };
  }

  /** The spend of the year of each department: it sits on whichever Cost Center the department was charged to when it was recorded, all of them. */
  private async spentByDepartment(
    history: ReadonlyMap<string, string[]>,
    today: BusinessDate,
  ): Promise<(departmentId: string) => bigint> {
    const thisYear = Number(today.slice(0, 4));
    const spent = await this.commitments.totals(
      [...history.values()].flat().map((costCenterId) => ({ costCenterId, year: thisYear })),
    );

    return (departmentId) =>
      (history.get(departmentId) ?? []).reduce(
        (sum, costCenterId) => sum + (spent.get(heldKey(costCenterId, thisYear))?.spent ?? 0n),
        0n,
      );
  }

  /**
   * Whether Finance may build the first version of the department of this Cost Center for `year` from the baseline (`QĐ-100h`,
   * `R-I05`). The cycle is locked `FOR UPDATE` first (the order of the module). Throws FinanceSetupIncompleteError and
   * BudgetCostCenterNotFoundError (the Cost Center is not in use), and BudgetBaselineVersionNotAllowedError naming the first thing
   * that is wrong.
   */
  async requireVersionAllowed(
    tx: DbTx,
    costCenterId: string,
    year: number,
    today: BusinessDate,
  ): Promise<{ departmentId: string; currency: string }> {
    const cycle = await this.cycles.lockByYear(tx, await this.facts.organizationId(tx), year, 'UPDATE');
    const unit = await this.facts.costCenterInUse(costCenterId, tx);
    const heads = await this.organizationReads.getDepartmentHeads([unit.departmentId], today, tx);
    const refusal = baselineVersionRefusal({
      cyclePublishedOnce: cycle !== null && cycle.firstPublishedAt !== null,
      inCycle: cycle !== null && (await this.isInCycle(cycle, unit.departmentId, year, tx)),
      today,
      submissionDeadline: cycle?.submissionDeadline ?? today,
      headsToday: heads.has(unit.departmentId),
      headToCome: await this.organizationReads.hasHeadStartingAfter(unit.departmentId, today, tx),
      openProposal: (await this.proposals.openOfCostCenters([costCenterId], year, tx)).has(costCenterId),
    });
    if (refusal !== null || cycle === null)
      throw new BudgetBaselineVersionNotAllowedError(refusal ?? 'CYCLE_NOT_PUBLISHED');

    return { departmentId: unit.departmentId, currency: cycle.currency };
  }

  /** Whether the department is in the cycle of the year: it has a ceiling there and takes effect no later than the year ends. */
  private async isInCycle(
    cycle: { ceilings: readonly { departmentId: string }[] },
    departmentId: string,
    year: number,
    tx: DbTx,
  ): Promise<boolean> {
    if (!cycle.ceilings.some((ceiling) => ceiling.departmentId === departmentId)) return false;
    const [brief] = await this.organizationReads.getDepartmentBriefs([departmentId], tx);

    return brief !== undefined && brief.effectiveFrom <= `${year}-12-31`;
  }

  /**
   * The lines of a first version built from the baseline (`QĐ-100h`, `C4-14`), read the way the baseline reads the department
   * (`QĐ-103k`): one `Renew` line for what each plan its people hold seats of costs in the year at a known price (the months before an
   * ordered end included), and a `Cancel` line (shown, not added) for what ending one that was ordered to end saves. The idle seats of the
   * shared pool are no department's line. Throws nothing; a department whose people hold nothing gives none.
   */
  async renewalLinesOf(departmentId: string, year: number, today: BusinessDate, tx?: DbTx): Promise<BaselineLine[]> {
    const subscriptions = await this.catalog.getBaselineSubscriptions(tx);
    const { allocation, ending } = await this.seatsOf(subscriptions, today, tx);
    const seats = allocation.byDepartment.get(departmentId) ?? new Map<string, number>();

    return baselineLinesOf(
      subscriptions
        .filter((subscription) => (seats.get(subscription.subscriptionId) ?? 0) > 0)
        .map((subscription) => {
          const held = seats.get(subscription.subscriptionId) ?? 0;
          const terminated = ending.has(subscription.subscriptionId);

          return {
            planId: subscription.planId,
            label: `${subscription.applicationName} ${subscription.planName}`,
            seats: held,
            costMinor: subscriptionCost(year, today, held, subscription, terminated).costMinor,
            cancelledMinor: terminated ? cancelledCost(year, held, subscription) : null,
          };
        }),
    );
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
