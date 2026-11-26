import { Injectable, Optional } from '@nestjs/common';
import { addDays, monthBoundsOf, type BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { SeatLedgerApi, type SubscriptionLineRecord } from '../../catalog/public/seat-ledger.api';
import { SubscriptionPeriodApi } from '../../catalog/public/subscription-period.api';
import type { PoolAdjustmentWindows, SubscriptionPurchaseFacts } from '../../catalog/public/subscription-period.types';
import { LicensingSeatMonthApi } from '../../licensing/public/licensing-seat-month.api';
import type { PriorLineLockedTarget, SeatOfMonth } from '../../licensing/public/licensing-seat-month.types';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { LicenseLotCostService } from './license-lot-cost.service';
import {
  aggregateIdleClassifications,
  classifyIdleSeatCosts,
  resolveLineMissedSeats,
  type IdleCostByLabel,
} from './shared-pool-line-label.policy';
import {
  isEligiblePoolPeriod,
  poolPeriodMonthCost,
  unallocatedMinorOf,
  type PoolLineFlag,
  type PoolPeriodSpec,
} from './shared-pool-line.policy';
import { SharedPoolLineRepo, type SubscriptionInvoiceVariance } from './shared-pool-line.repo';

const DEFAULT_WINDOWS: PoolAdjustmentWindows = { monthlyDays: 7, annualDays: 30, redAlertDaysAnnual: 30 };
const MAX_YEAR_SUBSCRIPTIONS = 500;

export interface SharedPoolLineDetail {
  subscriptionId: string;
  responsibleItAdminEmployeeId: string | null;
  paidMinor: bigint | null;
  invoicedMinor: bigint;
  allocatedMinor: bigint;
  withoutCostCenterMinor: bigint;
  idleCostMinor: bigint | null;
  idleCostByLabel: IdleCostByLabel;
  invoiceVarianceMinor: bigint;
  invoiceVarianceInReviewMinor: bigint;
  deviceLotPurchasesMinor: bigint;
  replacementKeysMinor: bigint;
  unallocatedMinor: bigint;
  flags: PoolLineFlag[];
  ratioPercent: string;
  exceedsIdleRatioThreshold: boolean;
}

export interface YearSharedPoolFigures {
  idleCostMinor: bigint;
  invoiceVarianceMinor: bigint;
  invoiceVarianceInReviewMinor: bigint;
  deviceLotPurchasesMinor: bigint;
  replacementKeysMinor: bigint;
  unallocatedMinor: bigint;
}

function groupSeatsBySubscription(seats: readonly SeatOfMonth[]): Map<string, SeatOfMonth[]> {
  const grouped = new Map<string, SeatOfMonth[]>();
  for (const seat of seats) {
    const list = grouped.get(seat.subscriptionId) ?? [];
    list.push(seat);
    grouped.set(seat.subscriptionId, list);
  }

  return grouped;
}

function collectCandidateIds(
  seatsOfMonth: readonly SeatOfMonth[],
  chargeTotals: ReadonlyArray<{ subscriptionId: string }>,
  variances: readonly SubscriptionInvoiceVariance[],
  only?: string,
): string[] {
  const matchesOnly = (subscriptionId: string) => only === undefined || subscriptionId === only;

  return [
    ...new Set([
      ...seatsOfMonth.map((seat) => seat.subscriptionId),
      ...chargeTotals.filter((row) => matchesOnly(row.subscriptionId)).map((row) => row.subscriptionId),
      ...variances.filter((row) => matchesOnly(row.subscriptionId)).map((row) => row.subscriptionId),
    ]),
  ].sort();
}

function lineEndExclusiveOf(fact: SubscriptionPurchaseFacts, line: SubscriptionLineRecord): BusinessDate | null {
  if (line.closedOn === null) return fact.endExclusive;
  const lineEnd = addDays(line.closedOn, 1);

  return fact.endExclusive === null || lineEnd < fact.endExclusive ? lineEnd : fact.endExclusive;
}

type PeriodCostInput = {
  fact: SubscriptionPurchaseFacts;
  lines: readonly SubscriptionLineRecord[];
  month: BusinessDate;
  seats: readonly SeatOfMonth[];
  windows: PoolAdjustmentWindows;
  qNext: number | null;
  seatsMap: ReadonlyMap<string, ReadonlyMap<BusinessDate, number | null>>;
  priorTargets: readonly PriorLineLockedTarget[];
};

function evaluateSingleLine(input: PeriodCostInput, line: SubscriptionLineRecord, singleLine: boolean) {
  const dailySeats = input.seatsMap.get(line.id);
  const linePeriod: PoolPeriodSpec = {
    subscriptionId: input.fact.subscriptionId,
    purchasedQuantity: input.fact.purchasedQuantity,
    monthlyPriceMinor: line.monthlyUnitPriceMinor,
    startDate: input.fact.startDate,
    endExclusive: lineEndExclusiveOf(input.fact, line),
    dailySeats,
  };
  const lineSeats = input.seats.filter((seat) => seat.planId === line.planId);
  const cost = poolPeriodMonthCost(linePeriod, lineSeats, input.month);
  const seatsAtStart =
    input.fact.startDate !== null ? (dailySeats?.get(input.fact.startDate) ?? input.fact.purchasedQuantity) : null;
  const missedSeats = resolveLineMissedSeats({
    seatCounting: input.fact.seatCounting ?? 'FIXED',
    seatsAtPeriodStart: seatsAtStart,
    priorLineId: line.renewedFromLineId,
    periodStartDate: input.fact.startDate,
    priorTargets: input.priorTargets,
  });
  const label = classifyIdleSeatCosts(
    {
      ...input.fact,
      ...linePeriod,
      vendorMinimumSeats: line.minimumSeats ?? (singleLine ? input.fact.vendorMinimumSeats : null),
      qNext: singleLine ? input.qNext : null,
      windows: input.windows,
      missedSeats,
    },
    lineSeats,
    input.month,
  );

  return { cost, label };
}

function evaluatePeriodCosts(input: PeriodCostInput) {
  const activeLines = input.lines.filter((line) => line.closedReason !== 'REMOVED');
  if (activeLines.length === 0) {
    const cost = poolPeriodMonthCost(input.fact, input.seats, input.month);
    const label = classifyIdleSeatCosts(
      { ...input.fact, qNext: input.qNext, windows: input.windows },
      input.seats,
      input.month,
    );

    return { paidMinor: cost.paidMinor, idleCostMinor: cost.idleCostMinor, flags: cost.flags, label };
  }

  const results = activeLines.map((line) => evaluateSingleLine(input, line, activeLines.length === 1));
  const flagSet = new Set<PoolLineFlag>(results.flatMap((r) => r.cost.flags));
  const paidValues = results.map((r) => r.cost.paidMinor);
  const idleValues = results.map((r) => r.cost.idleCostMinor);

  return {
    paidMinor: paidValues.some((v) => v === null) ? null : paidValues.reduce<bigint>((s, v) => s + (v ?? 0n), 0n),
    idleCostMinor: idleValues.some((v) => v === null) ? null : idleValues.reduce<bigint>((s, v) => s + (v ?? 0n), 0n),
    flags: [...flagSet],
    label: aggregateIdleClassifications(results.map((r) => r.label)),
  };
}

function buildLineDetail(input: {
  fact: SubscriptionPurchaseFacts;
  lines: readonly SubscriptionLineRecord[];
  month: BusinessDate;
  seats: readonly SeatOfMonth[];
  figure: { invoicedMinor: bigint; allocatedMinor: bigint; withoutCostCenterMinor: bigint } | undefined;
  variance: SubscriptionInvoiceVariance | undefined;
  windows: PoolAdjustmentWindows;
  qNext: number | null;
  seatsMap: ReadonlyMap<string, ReadonlyMap<BusinessDate, number | null>>;
  priorTargets: readonly PriorLineLockedTarget[];
}): SharedPoolLineDetail {
  const { fact, figure, variance } = input;
  const evaluated = evaluatePeriodCosts(input);
  const invoicedMinor = figure?.invoicedMinor ?? 0n;
  const allocatedMinor = figure?.allocatedMinor ?? 0n;
  const invoiceVarianceMinor = variance?.varianceMinor ?? 0n;
  const invoiceVarianceInReviewMinor = variance?.varianceInReviewMinor ?? 0n;
  const deviceLotPurchasesMinor = 0n;
  const replacementKeysMinor = 0n;

  return {
    subscriptionId: fact.subscriptionId,
    responsibleItAdminEmployeeId: fact.responsibleItAdminEmployeeId,
    paidMinor: evaluated.paidMinor,
    invoicedMinor,
    allocatedMinor,
    withoutCostCenterMinor: figure?.withoutCostCenterMinor ?? 0n,
    idleCostMinor: evaluated.idleCostMinor,
    idleCostByLabel: evaluated.label.byLabel,
    invoiceVarianceMinor,
    invoiceVarianceInReviewMinor,
    deviceLotPurchasesMinor,
    replacementKeysMinor,
    unallocatedMinor: unallocatedMinorOf({
      idleCostMinor: evaluated.idleCostMinor,
      invoicedMinor,
      allocatedMinor,
      invoiceVarianceMinor,
      invoiceVarianceInReviewMinor,
      deviceLotPurchasesMinor,
      replacementKeysMinor,
    }),
    flags: evaluated.flags,
    ratioPercent: evaluated.label.ratioPercent,
    exceedsIdleRatioThreshold: evaluated.label.exceedsIdleRatioThreshold,
  };
}

/**
 * Computes monthly per-subscription shared-pool lines and cumulative year-to-month shared-pool figures
 * from line seat ledgers, seat occupancy, catalog purchase periods, adjustment windows, locked prior-line targets, and pool invoice variances.
 */
@Injectable()
export class SharedPoolLineFactsService {
  constructor(
    private readonly poolRepo: SharedPoolLineRepo,
    private readonly periods: SubscriptionPeriodApi,
    private readonly licensing: LicensingSeatMonthApi,
    private readonly organizationReads: OrganizationReadApi,
    @Optional() private readonly seatLedger?: SeatLedgerApi,
    @Optional() private readonly lotCosts?: LicenseLotCostService,
  ) {}

  /** Shared-pool lines for `month`, sorted by subscription id, up to `limit`. */
  async linesOfMonth(month: BusinessDate, only?: string, limit = 100, tx?: DbTx): Promise<SharedPoolLineDetail[]> {
    const { start, nextStart } = monthBoundsOf(month);
    const seatsOfMonth = await this.licensing.getSeatsOfMonth(month, tx, only);
    const org = await this.organizationReads.getOrganization(tx);
    const chargeTotals = org
      ? await this.poolRepo.seatMonthTotalsBySubscriptionMonth(
          { organizationId: org.id, from: start, until: nextStart },
          tx,
        )
      : [];
    const variances = org ? await this.poolRepo.invoiceVariancesBySubscriptionMonth(org.id, month, tx) : [];
    const candidateIds = collectCandidateIds(seatsOfMonth, chargeTotals, variances, only);
    if (candidateIds.length === 0) return [];
    const candidateSet = new Set(candidateIds);

    const eligible = (await this.periods.getPurchaseFacts(candidateIds, tx))
      .filter(
        (fact) =>
          candidateSet.has(fact.subscriptionId) &&
          isEligiblePoolPeriod({ ...fact, hasSeatOrRun: true }) &&
          (only === undefined || fact.subscriptionId === only),
      )
      .sort((a, b) => a.subscriptionId.localeCompare(b.subscriptionId))
      .slice(0, limit);
    if (eligible.length === 0) return [];

    const eligibleIds = eligible.map((fact) => fact.subscriptionId);
    const monthEnd = addDays(nextStart, -1);
    const figures = await this.poolRepo.monthlyFigures(
      { from: start, until: nextStart, invoicedIds: eligibleIds, only },
      tx,
    );
    const windowsMap = await this.periods.adjustmentWindowsOf(eligibleIds, monthEnd, tx);
    const qNextMap = await this.licensing.getNextPeriodQuantities(eligibleIds, tx);
    const linesMap = await this.periods.linesOfSubscriptions(eligibleIds, tx);

    const { seatsMap, priorTargets } = await this.readLineLedgerAndTargets(eligible, linesMap, start, monthEnd, tx);
    const seatsBySub = groupSeatsBySubscription(seatsOfMonth);
    const figureBySub = new Map(figures.map((row) => [row.subscriptionId, row]));
    const varianceBySub = new Map(variances.map((row) => [row.subscriptionId, row]));

    return eligible.map((fact) =>
      buildLineDetail({
        fact,
        lines: linesMap.get(fact.subscriptionId) ?? [],
        month,
        seats: seatsBySub.get(fact.subscriptionId) ?? [],
        figure: figureBySub.get(fact.subscriptionId),
        variance: varianceBySub.get(fact.subscriptionId),
        windows: windowsMap.get(fact.subscriptionId) ?? DEFAULT_WINDOWS,
        qNext: fact.nextPeriodPurchasedQuantity ?? qNextMap.get(fact.subscriptionId) ?? null,
        seatsMap,
        priorTargets,
      }),
    );
  }

  private async readLineLedgerAndTargets(
    eligible: readonly SubscriptionPurchaseFacts[],
    linesMap: ReadonlyMap<string, SubscriptionLineRecord[]>,
    monthStart: BusinessDate,
    monthEnd: BusinessDate,
    tx?: DbTx,
  ): Promise<{
    seatsMap: ReadonlyMap<string, ReadonlyMap<BusinessDate, number | null>>;
    priorTargets: PriorLineLockedTarget[];
  }> {
    const activeLines = eligible.flatMap((fact) =>
      (linesMap.get(fact.subscriptionId) ?? [])
        .filter((line) => line.closedReason !== 'REMOVED')
        .map((line) => ({ fact, line })),
    );
    if (activeLines.length === 0) {
      return { seatsMap: new Map(), priorTargets: [] };
    }

    let minFrom = monthStart;
    const priorLineIds: string[] = [];
    for (const { fact, line } of activeLines) {
      if (fact.seatCounting !== 'MEMBERS' && line.renewedFromLineId !== null) {
        priorLineIds.push(line.renewedFromLineId);
        if (fact.startDate !== null && fact.startDate < minFrom && fact.startDate <= monthEnd) {
          minFrom = fact.startDate;
        }
      }
    }

    const lineIds = activeLines.map(({ line }) => line.id);
    const seatsMap = this.seatLedger
      ? await this.seatLedger.seatsOnDays(lineIds, minFrom, monthEnd, tx)
      : new Map<string, ReadonlyMap<BusinessDate, number | null>>();
    const priorTargets =
      priorLineIds.length > 0 ? await this.licensing.getPriorLineTargets([...new Set(priorLineIds)], tx) : [];

    return { seatsMap, priorTargets };
  }

  /**
   * Cumulative shared-pool figures for ended months `1 .. throughMonth` of `year`.
   * When `only` is omitted, reads organization-wide invoice variances directly so variances in months with zero K2 seats are included.
   */
  async yearFigures(year: number, throughMonth = 12, only?: string, tx?: DbTx): Promise<YearSharedPoolFigures> {
    const todayStart = monthBoundsOf(await this.organizationReads.businessToday(new Date(), tx)).start;
    const endedMonths = this.endedMonthsInYear(year, throughMonth, todayStart);
    if (endedMonths.length === 0) return emptyYearFigures();

    let idleCostMinor = 0n;
    let onlyVarianceMinor = 0n;
    let onlyVarianceInReviewMinor = 0n;
    for (const month of endedMonths) {
      for (const line of await this.linesOfMonth(month, only, MAX_YEAR_SUBSCRIPTIONS, tx)) {
        idleCostMinor += line.idleCostMinor ?? 0n;
        onlyVarianceMinor += line.invoiceVarianceMinor;
        onlyVarianceInReviewMinor += line.invoiceVarianceInReviewMinor;
      }
    }
    if (only !== undefined) {
      return {
        ...emptyYearFigures(),
        idleCostMinor,
        invoiceVarianceMinor: onlyVarianceMinor,
        invoiceVarianceInReviewMinor: onlyVarianceInReviewMinor,
        unallocatedMinor: idleCostMinor + onlyVarianceMinor + onlyVarianceInReviewMinor,
      };
    }

    const org = await this.organizationReads.getOrganization(tx);
    const { nextStart } = monthBoundsOf(endedMonths[endedMonths.length - 1]);
    const totals = org
      ? await this.poolRepo.invoiceVariancesTotals(
          { organizationId: org.id, from: `${year}-01-01`, until: nextStart },
          tx,
        )
      : { varianceMinor: 0n, varianceInReviewMinor: 0n };
    const lotPool =
      org && this.lotCosts
        ? await this.lotCosts.poolTotalsInRange(org.id, `${year}-01-01`, nextStart, tx)
        : { lotIdleNetMinor: 0n, deviceLotPurchasesMinor: 0n, replacementKeysMinor: 0n };
    const totalIdleMinor = idleCostMinor + lotPool.lotIdleNetMinor;

    return {
      idleCostMinor: totalIdleMinor,
      invoiceVarianceMinor: totals.varianceMinor,
      invoiceVarianceInReviewMinor: totals.varianceInReviewMinor,
      deviceLotPurchasesMinor: lotPool.deviceLotPurchasesMinor,
      replacementKeysMinor: lotPool.replacementKeysMinor,
      unallocatedMinor:
        totalIdleMinor +
        totals.varianceMinor +
        totals.varianceInReviewMinor +
        lotPool.deviceLotPurchasesMinor +
        lotPool.replacementKeysMinor,
    };
  }

  private endedMonthsInYear(year: number, throughMonth: number, todayStart: BusinessDate): BusinessDate[] {
    const months: BusinessDate[] = [];
    for (let index = 1; index <= 12; index += 1) {
      const month = `${year}-${String(index).padStart(2, '0')}-01`;
      if (month >= todayStart || index > throughMonth) break;
      months.push(month);
    }

    return months;
  }
}

function emptyYearFigures(): YearSharedPoolFigures {
  return {
    idleCostMinor: 0n,
    invoiceVarianceMinor: 0n,
    invoiceVarianceInReviewMinor: 0n,
    deviceLotPurchasesMinor: 0n,
    replacementKeysMinor: 0n,
    unallocatedMinor: 0n,
  };
}
