import { Injectable } from '@nestjs/common';
import { addDays, monthBoundsOf, type BusinessDate } from '../../../../core/business-date';
import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import { SeatLedgerApi, type SubscriptionLineRecord } from '../../../catalog/public/seat-ledger.api';
import { SubscriptionPeriodApi } from '../../../catalog/public/subscription-period.api';
import type { SubscriptionPurchaseFacts } from '../../../catalog/public/subscription-period.types';
import { AssignmentSeatMonthRepo } from '../../assignment/assignment-seat-month.repo';
import type { SeatOfMonth } from '../../public/licensing-seat-month.types';
import { SubscriptionRenewalLinesService } from '../lines/subscription-renewal-lines.service';
import type { SubscriptionLineTargetRecord } from '../lines/subscription-renewal-lines.types';
import {
  accumulateKpi4Months,
  lineMonthKpi4,
  missedSeatsOf,
  resolvePriorLockedTarget,
} from './kpi-missed-adjustment.policy';
import type { LineKpi4Breakdown, SubscriptionKpi4Summary } from './subscription-renewal-kpi.types';

/**
 * Computes incremental monthly `KPI-4` (`missedAdjustment` seat-months and VND cost) for a `FIXED` subscription's
 * lines by reading locked targets of prior lines, daily ledger seat counts, and held assignments.
 */
@Injectable()
export class KpiMissedAdjustmentService {
  constructor(
    private readonly linesService: SubscriptionRenewalLinesService,
    private readonly seatLedger: SeatLedgerApi,
    private readonly periods: SubscriptionPeriodApi,
    private readonly assignments: AssignmentSeatMonthRepo,
  ) {}

  /** Computes incremental `KPI-4` across `months` (`YYYY-MM-01`) for `subscriptionId`; returns zero for `MEMBERS`. */
  async kpi4ForSubscription(
    subscriptionId: string,
    months: readonly BusinessDate[],
    tx?: DbTx,
  ): Promise<SubscriptionKpi4Summary> {
    if (months.length === 0) return { subscriptionId, totalSeatMonths: 0, totalAmountMinor: 0n, lines: [] };
    const [period] = await this.periods.getPurchaseFacts([subscriptionId], tx);
    if (!period || period.seatCounting === 'MEMBERS') {
      return { subscriptionId, totalSeatMonths: 0, totalAmountMinor: 0n, lines: [] };
    }
    const lines = (await this.seatLedger.linesOfSubscription(subscriptionId, tx)).filter(
      (line) => line.closedReason !== 'REMOVED',
    );
    if (lines.length === 0) return { subscriptionId, totalSeatMonths: 0, totalAmountMinor: 0n, lines: [] };

    const sortedMonths = [...months].sort();
    const minMonthStart = monthBoundsOf(sortedMonths[0]).start;
    const maxMonthNext = monthBoundsOf(sortedMonths[sortedMonths.length - 1]).nextStart;
    const maxMonthEnd = addDays(maxMonthNext, -1);
    const ledgerFrom = period.startDate !== null && period.startDate < minMonthStart ? period.startDate : minMonthStart;
    const ledgerUntil = period.startDate !== null && period.startDate > maxMonthEnd ? period.startDate : maxMonthEnd;

    const priorLineIds = lines.flatMap((line) => (line.renewedFromLineId ? [line.renewedFromLineId] : []));
    const priorTargets = await this.linesService.targetsOfLines(priorLineIds, tx);
    const seatsMap = await this.seatLedger.seatsOnDays(
      lines.map((line) => line.id),
      ledgerFrom,
      ledgerUntil,
      tx,
    );
    const heldSeats = await this.assignments.seatsOfPlans(
      [...new Set(lines.map((line) => line.planId))],
      minMonthStart,
      maxMonthNext,
      tx,
      subscriptionId,
    );

    const heldByPlan = groupHeldByPlan(heldSeats);
    const breakdowns = lines.map((line) =>
      buildLineBreakdown({ line, period, sortedMonths, seatsMap, priorTargets, heldByPlan }),
    );
    const overall = accumulateKpi4Months(breakdowns.flatMap((line) => line.months));

    return {
      subscriptionId,
      totalSeatMonths: overall.totalSeatMonths,
      totalAmountMinor: overall.totalAmountMinor,
      lines: breakdowns,
    };
  }
}

function buildLineBreakdown(input: {
  line: SubscriptionLineRecord;
  period: SubscriptionPurchaseFacts;
  sortedMonths: readonly BusinessDate[];
  seatsMap: ReadonlyMap<string, ReadonlyMap<BusinessDate, number | null>>;
  priorTargets: readonly SubscriptionLineTargetRecord[];
  heldByPlan: ReadonlyMap<string, SeatOfMonth[]>;
}): LineKpi4Breakdown {
  const { line, period, sortedMonths, seatsMap, priorTargets, heldByPlan } = input;
  const dailySeats = seatsMap.get(line.id);
  const seatsAtStart =
    period.startDate !== null ? (dailySeats?.get(period.startDate) ?? period.purchasedQuantity) : null;
  const priorTarget = resolvePriorLockedTarget(priorTargets, line.renewedFromLineId, period.startDate);
  const missedSeats = missedSeatsOf({
    seatCounting: period.seatCounting ?? 'FIXED',
    seatsAtPeriodStart: seatsAtStart,
    priorLockedTarget: priorTarget,
  });
  const lineWindowEnd = line.closedOn !== null ? addDays(line.closedOn, 1) : null;
  const endExclusive =
    lineWindowEnd !== null && (period.endExclusive === null || lineWindowEnd < period.endExclusive)
      ? lineWindowEnd
      : period.endExclusive;
  const monthResults = sortedMonths.map((month) => ({
    month,
    ...lineMonthKpi4({
      seatCounting: period.seatCounting ?? 'FIXED',
      missedSeats,
      monthlyUnitPriceMinor: line.monthlyUnitPriceMinor,
      month,
      startDate: period.startDate,
      endExclusive,
      dailySeats,
      fallbackQuantity: period.purchasedQuantity,
      heldSeats: heldByPlan.get(line.planId) ?? [],
    }),
  }));
  const lineTotals = accumulateKpi4Months(monthResults);

  return {
    subscriptionLineId: line.id,
    planId: line.planId,
    missedSeats,
    seatMonths: lineTotals.totalSeatMonths,
    amountMinor: lineTotals.totalAmountMinor,
    months: monthResults,
  };
}

function groupHeldByPlan(seats: readonly SeatOfMonth[]): Map<string, SeatOfMonth[]> {
  const byPlan = new Map<string, SeatOfMonth[]>();
  for (const seat of seats) {
    const list = byPlan.get(seat.planId) ?? [];
    list.push(seat);
    byPlan.set(seat.planId, list);
  }

  return byPlan;
}
