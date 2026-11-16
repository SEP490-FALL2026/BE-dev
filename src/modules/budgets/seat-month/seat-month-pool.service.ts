import { Injectable } from '@nestjs/common';
import { monthBoundsOf, type BusinessDate } from '../../../core/business-date';
import { CatalogApi } from '../../catalog/public/catalog.api';
import { SubscriptionPeriodApi } from '../../catalog/public/subscription-period.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { inForce, paidMinor, poolLineMinor, type PoolPeriod } from './seat-month-pool.policy';
import { SeatMonthRepo } from './seat-month.repo';

/** The line of the shared pool of one subscription in one month, with what it is made of. */
export interface PoolLineFigures {
  subscriptionId: string;
  /** The seats paid for at the price of a month; null when the seats bought or the price of a month is not known. */
  paidMinor: bigint | null;
  invoicedMinor: bigint;
  allocatedMinor: bigint;
  /** The part of the seat-months that fell to a department with no Cost Center yet. */
  withoutCostCenterMinor: bigint;
  /** The line "not allocated, shared pool". */
  unallocatedMinor: bigint;
}

interface MonthFigures {
  subscriptionId: string;
  invoicedMinor: bigint;
  allocatedMinor: bigint;
  withoutCostCenterMinor: bigint;
}

const ids = (periods: readonly PoolPeriod[]) => periods.map((period) => period.subscriptionId);

/**
 * The line "not allocated, shared pool" of the subscriptions of the pool of shared seats (`K2`), by month and for a year (`SM1-04`, `QĐ-104c`(2),
 * `QĐ-103k`): the seats paid for at the price of a month less the seat-months charged to departments, in every month the purchase runs, so a purchase of a
 * year is the same line each month and not the year in the month it was invoiced. Only the subscriptions of the pool are read, never the purchase of a
 * department. The seats and the price come from the catalog, the invoices and the seat-months from `SeatMonthRepo`; nothing is stored.
 */
@Injectable()
export class SeatMonthPoolService {
  constructor(
    private readonly repo: SeatMonthRepo,
    private readonly catalog: CatalogApi,
    private readonly periods: SubscriptionPeriodApi,
    private readonly organizationReads: OrganizationReadApi,
  ) {}

  /** The lines of a month, by subscription, at most `limit`: the pools running in the month and those that have an invoice or a seat-month in it. */
  async linesOfMonth(month: BusinessDate, only: string | undefined, limit: number): Promise<PoolLineFigures[]> {
    const pools = await this.pools();
    const { start, nextStart } = monthBoundsOf(month);
    const figures = await this.repo.monthlyFigures({ from: start, until: nextStart, invoicedIds: ids(pools), only });

    return this.linesOf(month, pools, figures, only).slice(0, limit);
  }

  /**
   * What the year holds of the line: the sum over its months that have ended, up to `throughMonth` (the close of a review sums to the month it closes), the pool
   * reserve of the cycle being set against it (`QĐ-104i`).
   */
  async yearLineMinor(year: number, only?: string, throughMonth = 12): Promise<bigint> {
    const pools = await this.pools();
    const todayStart = monthBoundsOf(await this.organizationReads.businessToday()).start;
    const all = await this.repo.monthlyFigures({
      from: `${year}-01-01`,
      until: `${year + 1}-01-01`,
      invoicedIds: ids(pools),
      only,
    });
    let total = 0n;
    for (let index = 1; index <= 12; index += 1) {
      const month = `${year}-${String(index).padStart(2, '0')}-01`;
      if (month >= todayStart || index > throughMonth) break;
      const figures = all.filter((row) => row.month === month);
      total += this.linesOf(month, pools, figures, only).reduce((sum, line) => sum + line.unallocatedMinor, 0n);
    }

    return total;
  }

  private linesOf(
    month: BusinessDate,
    pools: readonly PoolPeriod[],
    figures: readonly MonthFigures[],
    only: string | undefined,
  ): PoolLineFigures[] {
    const running = pools.filter(
      (pool) => inForce(pool, month) && (only === undefined || pool.subscriptionId === only),
    );
    const subscriptionIds = [...new Set([...ids(running), ...figures.map((row) => row.subscriptionId)])].sort();

    return subscriptionIds.map((subscriptionId) => {
      const row = figures.find((figure) => figure.subscriptionId === subscriptionId);
      const period = running.find((pool) => pool.subscriptionId === subscriptionId);
      const paid = period ? paidMinor(period) : null;
      const invoicedMinor = row?.invoicedMinor ?? 0n;
      const allocatedMinor = row?.allocatedMinor ?? 0n;

      return {
        subscriptionId,
        paidMinor: paid,
        invoicedMinor,
        allocatedMinor,
        withoutCostCenterMinor: row?.withoutCostCenterMinor ?? 0n,
        unallocatedMinor: poolLineMinor({ paidMinor: paid, invoicedMinor, allocatedMinor }),
      };
    });
  }

  /** The periods of the pool of shared seats the company has, with the seats bought and the price of a month. */
  private async pools(): Promise<PoolPeriod[]> {
    const pools = (await this.catalog.getBaselineSubscriptions()).filter(
      (subscription) => subscription.provisioningType === 'K2',
    );
    const facts = new Map(
      (await this.periods.getPurchaseFacts(pools.map((pool) => pool.subscriptionId))).map((fact) => [
        fact.subscriptionId,
        fact,
      ]),
    );

    return pools.map((pool) => ({
      subscriptionId: pool.subscriptionId,
      startDate: pool.startDate,
      endDate: pool.endDate,
      purchasedQuantity: pool.purchasedQuantity,
      monthlyPriceMinor: facts.get(pool.subscriptionId)?.monthlyPriceMinor ?? null,
    }));
  }
}
