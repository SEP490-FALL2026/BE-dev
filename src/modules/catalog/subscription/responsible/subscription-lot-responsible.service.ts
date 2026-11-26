import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../../core/business-date';
import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import { LicenseLotRepo } from '../../license-lot/license-lot.repo';
import { SubscriptionPeriodLinesService } from '../../subscription-line/subscription-period-lines.service';
import { isLineServingOn } from '../../subscription-line/subscription-line.policy';
import { SubscriptionLineRepo } from '../../subscription-line/subscription-line.repo';
import type { SubscriptionLineRecord } from '../../subscription-line/subscription-line.types';
import type { SubscriptionRecord } from '../subscription.types';

export interface SubscriptionLineWithSeats {
  line: SubscriptionLineRecord;
  seatsToday: number;
  isServing: boolean;
}

/**
 * Who answers for a subscription that is a lot and which periods already carry subscription lines:
 * kept in its own collaborator so `SubscriptionViewService` stays focused and under the constructor parameter cap.
 */
@Injectable()
export class SubscriptionLotResponsibleService {
  constructor(
    private readonly lots: LicenseLotRepo,
    private readonly lines: SubscriptionLineRepo,
    private readonly periodLines?: SubscriptionPeriodLinesService,
  ) {}

  /** For each of these subscriptions that is a lot (the lot has its id), the IT Admin who answers for the lot; the others are absent. */
  async lotResponsibles(ids: readonly string[], tx?: DbTx): Promise<ReadonlyMap<string, string | null>> {
    const found = await this.lots.findMany(ids, tx);

    return new Map([...found].map(([id, lot]) => [id, lot.responsibleItAdminEmployeeId]));
  }

  /** Ids of periods among `ids` that already carry at least one subscription line. */
  async withLines(ids: readonly string[], tx?: DbTx): Promise<ReadonlySet<string>> {
    const map = await this.lines.ofSubscriptions(ids, tx);

    return new Set([...map.entries()].filter(([, list]) => list.length > 0).map(([id]) => id));
  }

  /** Batch read of all subscription lines and their `seatsToday` for `records`. */
  async linesForSubscriptions(
    records: readonly SubscriptionRecord[],
    today: BusinessDate,
    tx?: DbTx,
  ): Promise<Map<string, SubscriptionLineWithSeats[]>> {
    const ids = records.map((record) => record.id);
    if (ids.length === 0) return new Map();

    const bySub = await this.lines.ofSubscriptions(ids, tx);
    const allLines = [...bySub.values()].flat();
    if (allLines.length === 0) return new Map();

    const lineIds = allLines.map((line) => line.id);
    const seatsMap: ReadonlyMap<string, ReadonlyMap<BusinessDate, number | null>> = this.periodLines
      ? await this.periodLines.seatsOnDays(lineIds, today, today, tx)
      : new Map();
    const recordById = new Map(records.map((record) => [record.id, record]));
    const result = new Map<string, SubscriptionLineWithSeats[]>();

    for (const [subId, list] of bySub) {
      const period = recordById.get(subId);
      const periodInput = {
        status: period?.status ?? ('ACTIVE' as const),
        startDate: period?.startDate ?? null,
        endDate: period?.endDate ?? null,
      };
      result.set(
        subId,
        list.map((line) => {
          const isServing = isLineServingOn(line, today, periodInput);
          const ledgerCount = seatsMap.get(line.id)?.get(today);
          const fallback = list.length === 1 ? (period?.purchasedQuantity ?? 0) : 0;
          const seatsToday: number = isServing ? (ledgerCount ?? fallback) : 0;

          return { line, seatsToday, isServing };
        }),
      );
    }

    return result;
  }
}
