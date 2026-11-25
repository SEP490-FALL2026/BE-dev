import { Injectable } from '@nestjs/common';
import { addDays, monthBoundsOf, type BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { SubscriptionPeriodApi } from '../../catalog/public/subscription-period.api';
import type { PoolAdjustmentWindows, SubscriptionPurchaseFacts } from '../../catalog/public/subscription-period.types';
import { LicensingSeatMonthApi } from '../../licensing/public/licensing-seat-month.api';
import type { SeatOfMonth } from '../../licensing/public/licensing-seat-month.types';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { classifyIdleSeatCosts, type IdleCostByLabel } from './shared-pool-line-label.policy';
import {
  isEligiblePoolPeriod,
  poolPeriodMonthCost,
  unallocatedMinorOf,
  type PoolLineFlag,
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

function buildLineDetail(input: {
  fact: SubscriptionPurchaseFacts;
  month: BusinessDate;
  seats: readonly SeatOfMonth[];
  figure: { invoicedMinor: bigint; allocatedMinor: bigint; withoutCostCenterMinor: bigint } | undefined;
  variance: SubscriptionInvoiceVariance | undefined;
  windows: PoolAdjustmentWindows;
  qNext: number | null;
}): SharedPoolLineDetail {
  const { fact, month, seats, figure, variance, windows, qNext } = input;
  const cost = poolPeriodMonthCost(fact, seats, month);
  const label = classifyIdleSeatCosts({ ...fact, qNext, windows }, seats, month);
  const invoicedMinor = figure?.invoicedMinor ?? 0n;
  const allocatedMinor = figure?.allocatedMinor ?? 0n;
  const invoiceVarianceMinor = variance?.varianceMinor ?? 0n;
  const invoiceVarianceInReviewMinor = variance?.varianceInReviewMinor ?? 0n;
  const deviceLotPurchasesMinor = 0n;
  const replacementKeysMinor = 0n;

  return {
    subscriptionId: fact.subscriptionId,
    responsibleItAdminEmployeeId: fact.responsibleItAdminEmployeeId,
    paidMinor: cost.paidMinor,
    invoicedMinor,
    allocatedMinor,
    withoutCostCenterMinor: figure?.withoutCostCenterMinor ?? 0n,
    idleCostMinor: cost.idleCostMinor,
    idleCostByLabel: label.byLabel,
    invoiceVarianceMinor,
    invoiceVarianceInReviewMinor,
    deviceLotPurchasesMinor,
    replacementKeysMinor,
    unallocatedMinor: unallocatedMinorOf({
      idleCostMinor: cost.idleCostMinor,
      invoicedMinor,
      allocatedMinor,
      invoiceVarianceMinor,
      invoiceVarianceInReviewMinor,
      deviceLotPurchasesMinor,
      replacementKeysMinor,
    }),
    flags: cost.flags,
    ratioPercent: label.ratioPercent,
    exceedsIdleRatioThreshold: label.exceedsIdleRatioThreshold,
  };
}

/**
 * Computes monthly per-subscription shared-pool lines and cumulative year-to-month shared-pool figures (`W3-04`, `W3-06`)
 * from seat occupancy, catalog purchase periods, adjustment windows, and pool invoice variances.
 */
@Injectable()
export class SharedPoolLineFactsService {
  constructor(
    private readonly poolRepo: SharedPoolLineRepo,
    private readonly periods: SubscriptionPeriodApi,
    private readonly licensing: LicensingSeatMonthApi,
    private readonly organizationReads: OrganizationReadApi,
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
    const candidateIds = [
      ...new Set([
        ...seatsOfMonth.map((seat) => seat.subscriptionId),
        ...chargeTotals
          .filter((row) => only === undefined || row.subscriptionId === only)
          .map((row) => row.subscriptionId),
      ]),
    ].sort();
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
    const variances = org ? await this.poolRepo.invoiceVariancesBySubscriptionMonth(org.id, month, tx) : [];
    const windowsMap = await this.periods.adjustmentWindowsOf(eligibleIds, monthEnd, tx);
    const qNextMap = await this.licensing.getNextPeriodQuantities(eligibleIds, tx);

    const seatsBySub = groupSeatsBySubscription(seatsOfMonth);
    const figureBySub = new Map(figures.map((row) => [row.subscriptionId, row]));
    const varianceBySub = new Map(variances.map((row) => [row.subscriptionId, row]));

    return eligible.map((fact) =>
      buildLineDetail({
        fact,
        month,
        seats: seatsBySub.get(fact.subscriptionId) ?? [],
        figure: figureBySub.get(fact.subscriptionId),
        variance: varianceBySub.get(fact.subscriptionId),
        windows: windowsMap.get(fact.subscriptionId) ?? DEFAULT_WINDOWS,
        qNext: fact.nextPeriodPurchasedQuantity ?? qNextMap.get(fact.subscriptionId) ?? null,
      }),
    );
  }

  /**
   * Cumulative shared-pool figures for ended months `1 .. throughMonth` of `year`.
   * When `only` is omitted, reads organization-wide invoice variances directly so variances in months with zero K2 seats are included.
   */
  async yearFigures(year: number, throughMonth = 12, only?: string, tx?: DbTx): Promise<YearSharedPoolFigures> {
    const todayStart = monthBoundsOf(await this.organizationReads.businessToday(new Date(), tx)).start;
    const endedMonths = this.endedMonthsInYear(year, throughMonth, todayStart);
    if (endedMonths.length === 0) {
      return {
        idleCostMinor: 0n,
        invoiceVarianceMinor: 0n,
        invoiceVarianceInReviewMinor: 0n,
        deviceLotPurchasesMinor: 0n,
        replacementKeysMinor: 0n,
        unallocatedMinor: 0n,
      };
    }

    let idleCostMinor = 0n;
    let onlyVarianceMinor = 0n;
    let onlyVarianceInReviewMinor = 0n;
    for (const month of endedMonths) {
      const lines = await this.linesOfMonth(month, only, MAX_YEAR_SUBSCRIPTIONS, tx);
      for (const line of lines) {
        idleCostMinor += line.idleCostMinor ?? line.invoicedMinor - line.allocatedMinor;
        onlyVarianceMinor += line.invoiceVarianceMinor;
        onlyVarianceInReviewMinor += line.invoiceVarianceInReviewMinor;
      }
    }

    if (only !== undefined) {
      return {
        idleCostMinor,
        invoiceVarianceMinor: onlyVarianceMinor,
        invoiceVarianceInReviewMinor: onlyVarianceInReviewMinor,
        deviceLotPurchasesMinor: 0n,
        replacementKeysMinor: 0n,
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

    return {
      idleCostMinor,
      invoiceVarianceMinor: totals.varianceMinor,
      invoiceVarianceInReviewMinor: totals.varianceInReviewMinor,
      deviceLotPurchasesMinor: 0n,
      replacementKeysMinor: 0n,
      unallocatedMinor: idleCostMinor + totals.varianceMinor + totals.varianceInReviewMinor,
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
