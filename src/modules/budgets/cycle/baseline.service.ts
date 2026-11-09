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
  inOrderOf,
  listedDepartments,
  SOFTWARE_LISTED_MAX,
  baselineVersionRefusal,
  shouldSuggestRenewal,
  subscriptionCost,
} from './baseline.policy';
import type { BaselineSubscription } from '../../catalog/public/catalog.types';
import type { BaselineWire } from './cycle.dto';
import { CycleRepo } from './cycle.repo';

type Reading = {
  year: number;
  today: BusinessDate;
  seats: Map<string, number>;
  /** The subscriptions the company has decided to end: they are not renewed (`Q-162`). */
  ending: ReadonlySet<string>;
  spent: bigint;
  format: (minor: bigint) => { amount: string; currency: string };
};

/** One department of the baseline: its subscriptions, the seats they hold and what the year is estimated to cost at today's prices. */
export function departmentOf(
  brief: { id: string; code: string; name: string },
  costCenterId: string | null,
  subscriptions: readonly BaselineSubscription[],
  reading: Reading,
): BaselineWire['departments'][number] {
  const { year, today, seats, ending, spent, format } = reading;
  const software: BaselineWire['departments'][number]['software'] = [];
  let total = 0n;
  let purchased = 0;
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
    if (!subscription.hasSuccessor) {
      purchased += subscription.purchasedQuantity ?? 0;
      assigned += held;
    }
    if (software.length >= SOFTWARE_LISTED_MAX) continue;
    software.push({
      subscriptionId: subscription.subscriptionId,
      application: subscription.applicationName,
      plan: subscription.planName,
      seatsPurchased: subscription.purchasedQuantity,
      seatsAssigned: held,
      seatsIdle: subscription.purchasedQuantity === null ? null : Math.max(0, subscription.purchasedQuantity - held),
      monthlyUnitPrice: monthly === null ? null : format(monthly),
      monthsRunning: months,
      estimatedAnnualCost: cost === null ? null : format(cost),
      suggestRenewal: shouldSuggestRenewal(year, today, subscription, terminated),
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
    seatsPurchased: purchased,
    seatsAssigned: assigned,
    softwareTotal: subscriptions.length,
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
      this.catalog.getBaselineSubscriptions(wanted),
      this.facts.formatter(cycle.currency),
    ]);
    const subscriptionIds = subscriptions.map((subscription) => subscription.subscriptionId);
    const seats = await this.licensing.countSeatsOfSubscriptions(subscriptionIds, today);
    const ending = await this.licensing.getSubscriptionIdsToEnd(subscriptionIds);
    const thisYear = Number(today.slice(0, 4));
    // The spend of the year sits on whichever Cost Center the department was charged to when it was recorded: all of them count.
    const spent = await this.commitments.totals(
      [...history.values()].flat().map((costCenterId) => ({ costCenterId, year: thisYear })),
    );

    const byDepartment = new Map<string, BaselineSubscription[]>();
    for (const row of subscriptions) {
      // Gói 9: departmentId nullable — filter bỏ kho chung (departmentId = null) để lập baseline theo phòng
      if (row.departmentId) {
        byDepartment.set(row.departmentId, [...(byDepartment.get(row.departmentId) ?? []), row]);
      }
    }
    const departments = inOrderOf(wanted, briefs).map((brief) =>
      departmentOf(brief, costCenters.get(brief.id) ?? null, byDepartment.get(brief.id) ?? [], {
        year,
        today,
        seats,
        ending,
        spent: (history.get(brief.id) ?? []).reduce(
          (sum, costCenterId) => sum + (spent.get(heldKey(costCenterId, thisYear))?.spent ?? 0n),
          0n,
        ),
        format,
      }),
    );

    return {
      year,
      currency: cycle.currency,
      computedAt: new Date().toISOString(),
      kpi3: null,
      departmentsTotal: departmentId === undefined ? inYear.length : wanted.length,
      departments,
    };
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
   * The lines of a first version built from the baseline (`QĐ-100h`): one `Renew` line for each active subscription of the department
   * that runs in the year at a known price, as the baseline estimates it. Throws nothing; a department that runs nothing gives none.
   */
  async renewalLinesOf(
    departmentId: string,
    year: number,
    today: BusinessDate,
    tx?: DbTx,
  ): Promise<{ description: string; planId: string; seats: number | null; amountMinor: bigint }[]> {
    const subscriptions = await this.catalog.getBaselineSubscriptions([departmentId], tx);
    const subscriptionIds = subscriptions.map((subscription) => subscription.subscriptionId);
    const seats = await this.licensing.countSeatsOfSubscriptions(subscriptionIds, today, tx);
    const ending = await this.licensing.getSubscriptionIdsToEnd(subscriptionIds, tx);

    return subscriptions.flatMap((subscription) => {
      const held = seats.get(subscription.subscriptionId) ?? 0;
      const { costMinor } = subscriptionCost(year, today, held, subscription, ending.has(subscription.subscriptionId));

      return costMinor === null || costMinor <= 0n
        ? []
        : [
            {
              description: `Renew ${subscription.applicationName} ${subscription.planName}`.slice(0, 200),
              planId: subscription.planId,
              seats: held,
              amountMinor: costMinor,
            },
          ];
    });
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
