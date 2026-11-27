import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { LicensingApi } from '../../licensing/public/licensing.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import {
  BaselinePlanMissingError,
  BudgetBaselineVersionNotAllowedError,
  BudgetCycleNotFoundError,
  BudgetNotYourCostCenterError,
} from '../budget/budget.errors';
import { BaselineCatalogFacts } from './baseline-catalog-facts.service';
import { BaselineFlags, type BaselineCarried } from './baseline-flags.service';
import { BudgetFactsService } from '../budget/budget-facts.service';
import { CommitmentRepo, heldKey } from '../budget/commitment.repo';
import { ProposalRepo } from '../budget/proposal.repo';
import {
  allocateSeats,
  inOrderOf,
  listedDepartments,
  poolIdleSeats,
  SOFTWARE_LISTED_MAX,
  baselineVersionRefusal,
  type SeatAllocation,
  shouldSuggestRenewal,
  subscriptionCostByPlan,
} from './baseline.policy';
import type { BaselineSubscription } from '../../catalog/public/catalog.types';
import type { BaselineWire } from './cycle.dto';
import { cycleStateOf } from './cycle.policy';
import { CycleRepo } from './cycle.repo';

type Reading = {
  year: number;
  today: BusinessDate;
  /** The seats the people of the department hold, by subscription. */
  seats: ReadonlyMap<string, number>;
  /** The same seats by subscription and the plan of the seat: each is charged the line of its own plan. */
  seatPlans: ReadonlyMap<string, ReadonlyMap<string, number>>;
  /** The monthly price of a seat of a plan on a period (the line that serves the plan); null when it has none. */
  priceOf: (subscriptionId: string, planId: string) => bigint | null;
  /** The seats the line serving the plan has today (the seats bought of a period with no line); null when it has no number of seats. */
  seatsOf: (subscriptionId: string, planId: string) => number | null;
  /** The name of a plan and of its application: a period with several plans may hold plans of several applications. */
  planFactsOf: (planId: string) => { planName: string; applicationName: string };
  /** The subscriptions the company has decided to end: they are not renewed (`Q-162`). */
  ending: ReadonlySet<string>;
  /** `KPI-3` in percent by plan, for the plans that have one. */
  kpi3ByPlan: ReadonlyMap<string, number>;
  spent: bigint;
  format: (minor: bigint) => { amount: string; currency: string };
};

/** The row of one plan of a subscription the department holds seats of: its seats, the price of its line and what its year costs. */
function planRowOf(
  subscription: BaselineSubscription,
  planId: string,
  held: number,
  reading: Reading,
): { wire: BaselineWire['departments'][number]['software'][number]; cost: bigint | null } {
  const { year, today, priceOf, seatsOf, planFactsOf, ending, kpi3ByPlan, format } = reading;
  const terminated = ending.has(subscription.subscriptionId);
  const monthly = priceOf(subscription.subscriptionId, planId);
  const { months, costMinor } = subscriptionCostByPlan(
    year,
    today,
    new Map([[planId, held]]),
    () => monthly,
    subscription,
    terminated,
  );

  return {
    cost: costMinor,
    wire: {
      subscriptionId: subscription.subscriptionId,
      planId,
      application: planFactsOf(planId).applicationName,
      plan: planFactsOf(planId).planName,
      seatsPurchased: seatsOf(subscription.subscriptionId, planId),
      seatsAssigned: held,
      monthlyUnitPrice: monthly === null ? null : format(monthly),
      monthsRunning: months,
      estimatedAnnualCost: costMinor === null ? null : format(costMinor),
      suggestRenewal: shouldSuggestRenewal(year, today, subscription, terminated),
      kpi3: kpi3ByPlan.get(planId) ?? null,
    },
  };
}

/**
 * One department of the baseline (`QĐ-103k`): the subscriptions its people hold seats of, those seats, and what the year is estimated to
 * cost at today's prices. `subscriptions` are the ones the department holds seats of.
 */
export function departmentOf(
  brief: { id: string; code: string; name: string },
  costCenterId: string | null,
  subscriptions: readonly BaselineSubscription[],
  reading: Reading,
  carried: BaselineCarried = {
    carriedOver: 0n,
    noProposalSubmitted: false,
    belowCarriedOver: false,
    carriedOverShortfall: 0n,
  },
): BaselineWire['departments'][number] {
  const { seats, seatPlans, spent, format } = reading;
  const software: BaselineWire['departments'][number]['software'] = [];
  let total = 0n;
  let assigned = 0;
  let unknown = false;
  let rows = 0;
  for (const subscription of subscriptions) {
    // The seats of a period that a later one follows are the later one's too (the same people): they are counted once.
    if (!subscription.hasSuccessor) assigned += seats.get(subscription.subscriptionId) ?? 0;
    for (const [planId, held] of seatPlans.get(subscription.subscriptionId) ?? []) {
      const row = planRowOf(subscription, planId, held, reading);
      total += row.cost ?? 0n;
      unknown ||= row.cost === null;
      rows += 1;
      if (software.length < SOFTWARE_LISTED_MAX) software.push(row.wire);
    }
  }

  return {
    departmentId: brief.id,
    departmentCode: brief.code,
    departmentName: brief.name,
    costCenterId,
    carriedOverNextYear: format(carried.carriedOver),
    noProposalSubmitted: carried.noProposalSubmitted,
    belowCarriedOver: carried.belowCarriedOver,
    carriedOverShortfall: format(carried.carriedOverShortfall),
    spentThisYear: format(spent),
    estimatedAnnualCost: format(total),
    hasUnknownCost: unknown,
    seatsAssigned: assigned,
    softwareTotal: rows,
    software,
  };
}

type PoolLine = NonNullable<BaselineWire['sharedPoolUnallocated']>;

/** What the idle seats of the shared pool are read from: the seats of each plan of a period, held and bought, and what a seat of it costs. */
interface PoolReading extends Pick<Reading, 'year' | 'today' | 'ending' | 'format' | 'priceOf'> {
  /** The seats held by anyone, by subscription and plan. */
  heldByPlan: ReadonlyMap<string, ReadonlyMap<string, number>>;
  /** The seats the line serving the plan has today; null when it has no number of seats. */
  seatsOf: (subscriptionId: string, planId: string) => number | null;
  /** The plans a period serves. */
  planIdsOf: (subscriptionId: string) => readonly string[];
  /** The name of a plan and of its application: a period with several plans may hold plans of several applications. */
  planFactsOf: (planId: string) => { planName: string; applicationName: string };
}

/**
 * The line _Unallocated - shared pool_ of the baseline (`QĐ-103k`, `QĐ-89a(2)`): the seats of the `K2`/`K4` subscriptions bought and held by
 * nobody, a line of the company in no department, which Finance reads to set the reserve of the shared pool (B2). Each plan of a period is
 * read on its own line: the idle seats of a plan are the seats its line serves less the seats held of that plan, charged at the price of
 * that line x months running.
 */
export function sharedPoolLineOf(subscriptions: readonly BaselineSubscription[], reading: PoolReading): PoolLine {
  const software: PoolLine['software'] = [];
  let total = 0n;
  let idleTotal = 0;
  let unknown = false;
  let counted = 0;
  for (const subscription of subscriptions) {
    for (const planId of reading.planIdsOf(subscription.subscriptionId)) {
      const row = poolRowOf(subscription, planId, reading);
      if (row === null) continue;
      counted += 1;
      total += row.cost ?? 0n;
      unknown ||= row.cost === null;
      if (!subscription.hasSuccessor) idleTotal += row.wire.seatsIdle;
      if (software.length < SOFTWARE_LISTED_MAX) software.push(row.wire);
    }
  }

  return {
    line: 'SHARED_POOL_UNALLOCATED',
    estimatedAnnualCost: reading.format(total),
    hasUnknownCost: unknown,
    seatsIdle: idleTotal,
    softwareTotal: counted,
    software,
  };
}

/** The row of one plan of a period in the shared pool, with what it costs; null when the plan has no idle seat. */
function poolRowOf(
  subscription: BaselineSubscription,
  planId: string,
  reading: PoolReading,
): { wire: PoolLine['software'][number]; cost: bigint | null } | null {
  const { year, today, heldByPlan, seatsOf, priceOf, planFactsOf, ending, format } = reading;
  const purchased = seatsOf(subscription.subscriptionId, planId);
  const holding = heldByPlan.get(subscription.subscriptionId)?.get(planId) ?? 0;
  const idle = poolIdleSeats(subscription.provisioningType, purchased, holding);
  if (idle === null) return null;
  const monthly = priceOf(subscription.subscriptionId, planId);
  const { months, costMinor } = subscriptionCostByPlan(
    year,
    today,
    new Map([[planId, idle]]),
    () => monthly,
    subscription,
    ending.has(subscription.subscriptionId),
  );

  return {
    cost: costMinor,
    wire: {
      subscriptionId: subscription.subscriptionId,
      planId,
      application: planFactsOf(planId).applicationName,
      plan: planFactsOf(planId).planName,
      seatsPurchased: purchased ?? 0,
      seatsAssigned: holding,
      seatsIdle: idle,
      monthlyUnitPrice: monthly === null ? null : format(monthly),
      monthsRunning: months,
      estimatedAnnualCost: costMinor === null ? null : format(costMinor),
    },
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
    private readonly catalog: BaselineCatalogFacts,
    private readonly licensing: LicensingApi,
    private readonly commitments: CommitmentRepo,
    private readonly proposals: ProposalRepo,
    private readonly flags: BaselineFlags,
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
    const [briefs, costCenters, history, pricing, format] = await Promise.all([
      this.organizationReads.getDepartmentBriefs(wanted),
      this.organizationReads.getUnitCostCenterIds(wanted),
      this.organizationReads.getUnitCostCenterHistory(wanted),
      this.catalog.subscriptions(today),
      this.facts.formatter(cycle.currency),
    ]);
    const { subscriptions, priceOf } = pricing;
    const { allocation, ending } = await this.seatsOf(subscriptions, today);
    const { kpi3ByPlan, planFactsOf } = await this.planFacts(subscriptions, pricing.planIdsOf, allocation);
    const spentOf = await this.spentByDepartment(history, today);
    const common = { year, today, priceOf, seatsOf: pricing.seatsOf, planFactsOf, ending, format };

    const costCenterIds = [...costCenters.values()];
    // Locked is a state of the cycle (`QĐ-111z`): a draft whose deadline is behind us is not locked, and nobody missed a deadline yet.
    const carriedOf = await this.flags.of(costCenterIds, year, cycleStateOf(cycle, today) === 'LOCKED');
    const departments = inOrderOf(wanted, briefs).map((brief) => {
      const seats = allocation.byDepartment.get(brief.id) ?? new Map<string, number>();
      const seatPlans = allocation.byDepartmentPlan.get(brief.id) ?? new Map<string, Map<string, number>>();

      return departmentOf(
        brief,
        costCenters.get(brief.id) ?? null,
        subscriptions.filter((subscription) => (seats.get(subscription.subscriptionId) ?? 0) > 0),
        { ...common, seats, seatPlans, kpi3ByPlan, spent: spentOf(brief.id) },
        carriedOf(costCenters.get(brief.id) ?? ''),
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
          ? sharedPoolLineOf(subscriptions, {
              ...common,
              heldByPlan: allocation.heldByPlan,
              planIdsOf: pricing.planIdsOf,
            })
          : null,
    };
  }

  /** `KPI-3` and the name of every plan the baseline lists: the plans of the lines of the periods and the plans of the seats held. */
  private async planFacts(
    subscriptions: readonly BaselineSubscription[],
    planIdsOf: (subscriptionId: string) => readonly string[],
    allocation: SeatAllocation,
  ): Promise<{
    kpi3ByPlan: Map<string, number>;
    planFactsOf: (planId: string) => { planName: string; applicationName: string };
  }> {
    const planIds = [
      ...new Set([
        ...subscriptions.flatMap((one) => planIdsOf(one.subscriptionId)),
        ...[...allocation.heldByPlan.values()].flatMap((plans) => [...plans.keys()]),
      ]),
    ];
    const kpi3ByPlan = await this.catalog.kpi3Of(planIds);
    const facts = await this.catalog.planFacts(planIds);

    return {
      kpi3ByPlan,
      planFactsOf: (planId) => {
        const plan = facts.get(planId);
        if (plan === undefined) throw new BaselinePlanMissingError(planId);

        return plan;
      },
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
    const refusal = baselineVersionRefusal({
      cycleOpen: cycle !== null && cycle.openedAt !== null,
      inCycle: (await this.organizationReads.getActiveDepartmentIds(year, tx)).includes(unit.departmentId),
      today,
      submissionDeadline: cycle?.submissionDeadline ?? today,
      openProposal: (await this.proposals.openOfCostCenters([costCenterId], year, tx)).has(costCenterId),
    });
    if (refusal !== null || cycle === null) throw new BudgetBaselineVersionNotAllowedError(refusal ?? 'CYCLE_NOT_OPEN');

    return { departmentId: unit.departmentId, currency: cycle.currency };
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
