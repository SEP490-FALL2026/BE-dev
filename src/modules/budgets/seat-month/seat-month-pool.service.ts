import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import { SharedPoolLineFactsService } from '../shared-pool-line/shared-pool-line-facts.service';

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

/**
 * Compatibility facade preserving the 6-field `PoolLineFigures` summary while delegating calculations
 * to `SharedPoolLineFactsService`.
 */
@Injectable()
export class SeatMonthPoolService {
  constructor(private readonly poolFacts: SharedPoolLineFactsService) {}

  /** The lines of a month, by subscription, at most `limit`. */
  async linesOfMonth(month: BusinessDate, only: string | undefined, limit: number): Promise<PoolLineFigures[]> {
    const lines = await this.poolFacts.linesOfMonth(month, only, limit);

    return lines.map((line) => ({
      subscriptionId: line.subscriptionId,
      paidMinor: line.paidMinor,
      invoicedMinor: line.invoicedMinor,
      allocatedMinor: line.allocatedMinor,
      withoutCostCenterMinor: line.withoutCostCenterMinor,
      unallocatedMinor: line.unallocatedMinor,
    }));
  }

  /** Cumulative shared-pool unallocated total for ended months of `year` up to `throughMonth`. */
  async yearLineMinor(year: number, only?: string, throughMonth = 12): Promise<bigint> {
    const figures = await this.poolFacts.yearFigures(year, throughMonth, only);

    return figures.unallocatedMinor;
  }
}
