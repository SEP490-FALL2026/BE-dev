import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { CatalogPricingApi } from '../../catalog/public/catalog-pricing.api';
import { LicensingSeatMonthApi } from '../../licensing/public/licensing-seat-month.api';
import type { SeatInForce, UnrequestedK1SeatInForce } from '../../licensing/public/licensing-seat-month.types';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { servingMonthlyPriceMinor } from './serving-line-price.policy';
import { SharedPoolLineRepo } from '../shared-pool-line/shared-pool-line.repo';
import { RunningUncommittedRepo } from './running-uncommitted.repo';
import {
  periodKeyOf,
  runningUncommittedWithFlagsByCostCenter,
  type RunningUncommittedK1Seat,
  type RunningUncommittedPeriod,
  type RunningUncommittedResult,
} from './running-uncommitted.policy';

/**
 * Gathers live K2 seats in force, current Cost Centers, active subscription periods, year commitments,
 * and recorded `seat_month_runs` to compute running uncommitted cost per Cost Center inside `tx`.
 */
@Injectable()
export class RunningUncommittedFactsService {
  constructor(
    private readonly licensing: LicensingSeatMonthApi,
    private readonly periods: CatalogPricingApi,
    private readonly organizationReads: OrganizationReadApi,
    private readonly commitments: RunningUncommittedRepo,
    private readonly poolRepo: SharedPoolLineRepo,
  ) {}

  /** Running uncommitted minor per Cost Center id for `year` (`Y` or `Y+1`) on `today` (defaults to business today). */
  async ofYear(
    year: number,
    today?: BusinessDate,
    tx?: DbTx,
    options?: { exceptRequestIds?: readonly string[] },
  ): Promise<Map<string, bigint>> {
    return (await this.ofYearWithFlags(year, today, tx, options)).totals;
  }

  /** Running uncommitted minor and internal `NO_PRICE` flags (`K-A2`, `D-17`) per Cost Center for `year`. */
  async ofYearWithFlags(
    year: number,
    today?: BusinessDate,
    tx?: DbTx,
    options?: { exceptRequestIds?: readonly string[] },
  ): Promise<RunningUncommittedResult> {
    const empty: RunningUncommittedResult = { totals: new Map(), flagsByCostCenter: new Map() };
    const resolvedToday = today ?? (await this.organizationReads.businessToday(new Date(), tx));
    const todayYear = Number(resolvedToday.slice(0, 4));
    if (year !== todayYear && year !== todayYear + 1) return empty;

    const seats = await this.licensing.getSeatsInForceOn(resolvedToday, tx);
    const k1Seats = await this.licensing.getUnrequestedK1SeatsInForceOn(resolvedToday, tx);
    if (seats.length === 0 && k1Seats.length === 0) return empty;

    const ccByEntity = await this.resolveSeatCostCenters([...seats, ...k1Seats], resolvedToday, tx);
    const mappedSeats = seats.map((seat) => ({
      assignmentId: seat.assignmentId,
      subscriptionId: seat.subscriptionId,
      planId: seat.planId,
      requestId: seat.requestId,
      source: seat.source,
      costCenterId: ccByEntity.get(seat.assignmentId) ?? null,
      heldFrom: seat.heldFrom,
      heldUntil: seat.heldUntil,
    }));
    const mappedK1Seats: RunningUncommittedK1Seat[] = k1Seats.map((seat) => ({
      assignmentId: seat.assignmentId,
      planId: seat.planId,
      costCenterId: ccByEntity.get(seat.assignmentId) ?? null,
      heldFrom: seat.heldFrom,
      heldUntil: seat.heldUntil,
      billingAnchorOn: seat.billingAnchorOn,
    }));
    const periodBySubscriptionPlan = seats.length > 0 ? await this.periodsOf(seats, tx) : new Map();
    const requestIds = [...new Set(seats.flatMap((seat) => (seat.requestId === null ? [] : [seat.requestId])))];
    const commitmentByRequest =
      requestIds.length > 0 ? await this.commitments.commitmentsOfRequestsInYear(requestIds, year, tx) : new Map();
    const runMonthsBySubscription = seats.length > 0 ? await this.runMonthsOf(year, tx) : new Map();
    const k1ReferencePriceByPlan = new Map(k1Seats.map((seat) => [seat.planId, seat.referenceMonthlyPriceMinor]));

    const exceptRequestIds = toExceptSet(options);

    return runningUncommittedWithFlagsByCostCenter({
      year,
      today: resolvedToday,
      seats: mappedSeats,
      periodBySubscriptionPlan,
      commitmentByRequest,
      runMonthsBySubscription,
      k1UnrequestedSeats: mappedK1Seats,
      k1ReferencePriceByPlan,
      ...(exceptRequestIds ? { exceptRequestIds } : {}),
    });
  }

  /** Running uncommitted minor for `costCenterId` across `years`, keyed by year. */
  async ofCostCenterYears(
    costCenterId: string,
    years: readonly number[],
    tx?: DbTx,
    today?: BusinessDate,
  ): Promise<Map<number, bigint>> {
    const result = new Map<number, bigint>();
    if (years.length === 0) return result;
    const resolvedToday = today ?? (await this.organizationReads.businessToday(new Date(), tx));
    for (const year of [...new Set(years)]) {
      const byCostCenter = await this.ofYear(year, resolvedToday, tx);
      result.set(year, byCostCenter.get(costCenterId) ?? 0n);
    }

    return result;
  }

  /** Batched running uncommitted minor keyed by `${costCenterId}:${year}` across requested pairs. */
  async totals(
    pairs: readonly { costCenterId: string; year: number }[],
    tx?: DbTx,
    today?: BusinessDate,
  ): Promise<Map<string, bigint>> {
    return (await this.totalsWithFlags(pairs, tx, today)).totals;
  }

  /** Batched running uncommitted minor and no-price right counts keyed by `${costCenterId}:${year}`. */
  async totalsWithFlags(
    pairs: readonly { costCenterId: string; year: number }[],
    tx?: DbTx,
    today?: BusinessDate,
  ): Promise<{ totals: Map<string, bigint>; noPriceRightCounts: Map<string, number> }> {
    const totals = new Map<string, bigint>();
    const noPriceRightCounts = new Map<string, number>();
    if (pairs.length === 0) return { totals, noPriceRightCounts };
    const resolvedToday = today ?? (await this.organizationReads.businessToday(new Date(), tx));
    const uniqueYears = [...new Set(pairs.map((pair) => pair.year))];
    for (const year of uniqueYears) {
      const { totals: byCostCenter, flagsByCostCenter } = await this.ofYearWithFlags(year, resolvedToday, tx);
      for (const pair of pairs) {
        if (pair.year !== year) continue;
        const key = `${pair.costCenterId}:${year}`;
        totals.set(key, byCostCenter.get(pair.costCenterId) ?? 0n);
        const noPriceCount = (flagsByCostCenter.get(pair.costCenterId) ?? []).filter(
          (flag) => flag.code === 'NO_PRICE',
        ).length;
        noPriceRightCounts.set(key, noPriceCount);
      }
    }

    return { totals, noPriceRightCounts };
  }

  private async resolveSeatCostCenters(
    seats: readonly Pick<
      SeatInForce | UnrequestedK1SeatInForce,
      'assignmentId' | 'kind' | 'employeeId' | 'owningDepartmentId'
    >[],
    today: BusinessDate,
    tx?: DbTx,
  ): Promise<Map<string, string | null>> {
    const personalIds = [...new Set(seats.filter((s) => s.kind !== 'SERVICE').map((s) => s.employeeId))];
    const serviceDeptIds = [
      ...new Set(
        seats.flatMap((s) => (s.kind === 'SERVICE' && s.owningDepartmentId !== null ? [s.owningDepartmentId] : [])),
      ),
    ];
    const owningUnits =
      personalIds.length > 0
        ? await this.organizationReads.getOwningUnits(personalIds, today, tx)
        : new Map<string, { costCenter: { id: string } | null }>();
    const serviceCostCenters =
      serviceDeptIds.length > 0
        ? await this.organizationReads.getUnitCostCenterIds(serviceDeptIds, tx)
        : new Map<string, string>();

    return new Map(
      seats.map((seat) => [
        seat.assignmentId,
        seat.kind === 'SERVICE'
          ? seat.owningDepartmentId === null
            ? null
            : (serviceCostCenters.get(seat.owningDepartmentId) ?? null)
          : (owningUnits.get(seat.employeeId)?.costCenter?.id ?? null),
      ]),
    );
  }

  /**
   * The period each seat is priced on, by subscription and plan: a seat of a period with lines is priced by the line that serves its plan
   * (`servingMonthlyPriceMinor`), the columns of the period only when it has no line.
   */
  private async periodsOf(seats: readonly SeatInForce[], tx?: DbTx): Promise<Map<string, RunningUncommittedPeriod>> {
    const subscriptionIds = [...new Set(seats.map((seat) => seat.subscriptionId))];
    const facts = await this.periods.getPurchaseFacts(subscriptionIds, tx);
    const linesOf = await this.periods.linesOfSubscriptions(subscriptionIds, tx);
    const map = new Map<string, RunningUncommittedPeriod>();
    for (const fact of facts) {
      if (fact.status !== 'ACTIVE' || fact.kind !== 'TERM' || fact.provisioningType !== 'K2') continue;
      for (const planId of new Set(
        seats.filter((seat) => seat.subscriptionId === fact.subscriptionId).map((seat) => seat.planId),
      )) {
        map.set(periodKeyOf(fact.subscriptionId, planId), {
          monthlyPriceMinor: servingMonthlyPriceMinor(
            linesOf.get(fact.subscriptionId) ?? [],
            planId,
            fact.monthlyPriceMinor,
          ),
          startDate: fact.startDate,
        });
      }
    }

    return map;
  }

  private async runMonthsOf(year: number, tx?: DbTx): Promise<Map<string, Set<number>>> {
    const org = await this.organizationReads.getOrganization(tx);
    if (!org) return new Map();
    const runs = await this.poolRepo.subscriptionIdsWithRunsByMonth(
      { organizationId: org.id, from: `${year}-01-01`, until: `${year + 1}-01-01` },
      tx,
    );
    const bySub = new Map<string, Set<number>>();
    for (const run of runs) {
      const monthNumber = Number(run.month.slice(5, 7));
      const set = bySub.get(run.subscriptionId) ?? new Set<number>();
      set.add(monthNumber);
      bySub.set(run.subscriptionId, set);
    }

    return bySub;
  }
}

function toExceptSet(options?: { exceptRequestIds?: readonly string[] }): Set<string> | undefined {
  const ids = options?.exceptRequestIds;

  return ids && ids.length > 0 ? new Set(ids) : undefined;
}
