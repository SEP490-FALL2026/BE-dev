import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { SubscriptionPeriodApi } from '../../catalog/public/subscription-period.api';
import { LicensingSeatMonthApi } from '../../licensing/public/licensing-seat-month.api';
import type { SeatInForce } from '../../licensing/public/licensing-seat-month.types';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { SharedPoolLineRepo } from '../shared-pool-line/shared-pool-line.repo';
import { RunningUncommittedRepo } from './running-uncommitted.repo';
import {
  runningUncommittedByCostCenter,
  type RunningUncommittedPeriod,
  type RunningUncommittedSeat,
} from './running-uncommitted.policy';

/**
 * Gathers live K2 seats in force, current Cost Centers, active subscription periods, year commitments,
 * and recorded `seat_month_runs` to compute running uncommitted cost per Cost Center inside `tx`.
 */
@Injectable()
export class RunningUncommittedFactsService {
  constructor(
    private readonly licensing: LicensingSeatMonthApi,
    private readonly periods: SubscriptionPeriodApi,
    private readonly organizationReads: OrganizationReadApi,
    private readonly commitments: RunningUncommittedRepo,
    private readonly poolRepo: SharedPoolLineRepo,
  ) {}

  /** Running uncommitted minor per Cost Center id for `year` on `today` (defaults to business today). */
  async ofYear(year: number, today?: BusinessDate, tx?: DbTx): Promise<Map<string, bigint>> {
    const resolvedToday = today ?? (await this.organizationReads.businessToday(new Date(), tx));
    if (year !== Number(resolvedToday.slice(0, 4))) return new Map();

    const seats = await this.licensing.getSeatsInForceOn(resolvedToday, tx);
    if (seats.length === 0) return new Map();

    const mappedSeats = await this.mapSeatCostCenters(seats, resolvedToday, tx);
    const periodBySubscription = await this.periodsOf(seats, tx);
    const requestIds = [...new Set(seats.flatMap((seat) => (seat.requestId === null ? [] : [seat.requestId])))];
    const commitmentByRequest = await this.commitments.commitmentsOfRequestsInYear(requestIds, year, tx);
    const runMonthsBySubscription = await this.runMonthsOf(year, tx);

    return runningUncommittedByCostCenter({
      year,
      today: resolvedToday,
      seats: mappedSeats,
      periodBySubscription,
      commitmentByRequest,
      runMonthsBySubscription,
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
    const result = new Map<string, bigint>();
    if (pairs.length === 0) return result;
    const resolvedToday = today ?? (await this.organizationReads.businessToday(new Date(), tx));
    const uniqueYears = [...new Set(pairs.map((pair) => pair.year))];
    for (const year of uniqueYears) {
      const byCostCenter = await this.ofYear(year, resolvedToday, tx);
      for (const pair of pairs) {
        if (pair.year !== year) continue;
        result.set(`${pair.costCenterId}:${year}`, byCostCenter.get(pair.costCenterId) ?? 0n);
      }
    }

    return result;
  }

  private async mapSeatCostCenters(
    seats: readonly SeatInForce[],
    today: BusinessDate,
    tx?: DbTx,
  ): Promise<RunningUncommittedSeat[]> {
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

    return seats.map((seat) => ({
      assignmentId: seat.assignmentId,
      subscriptionId: seat.subscriptionId,
      requestId: seat.requestId,
      source: seat.source,
      costCenterId:
        seat.kind === 'SERVICE'
          ? seat.owningDepartmentId === null
            ? null
            : (serviceCostCenters.get(seat.owningDepartmentId) ?? null)
          : (owningUnits.get(seat.employeeId)?.costCenter?.id ?? null),
      heldFrom: seat.heldFrom,
      heldUntil: seat.heldUntil,
    }));
  }

  private async periodsOf(seats: readonly SeatInForce[], tx?: DbTx): Promise<Map<string, RunningUncommittedPeriod>> {
    const subscriptionIds = [...new Set(seats.map((seat) => seat.subscriptionId))];
    const facts = await this.periods.getPurchaseFacts(subscriptionIds, tx);
    const map = new Map<string, RunningUncommittedPeriod>();
    for (const fact of facts) {
      if (fact.status !== 'ACTIVE' || fact.kind !== 'TERM' || fact.provisioningType !== 'K2') continue;
      map.set(fact.subscriptionId, {
        monthlyPriceMinor: fact.monthlyPriceMinor,
        startDate: fact.startDate,
      });
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
