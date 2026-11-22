import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { BudgetFactsRepo } from '../budget/budget-facts.repo';
import { BudgetYearLockRepo } from '../budget/budget-year-lock.repo';
import { CommitmentRepo, heldKey } from '../budget/commitment.repo';
import { crossedByBaseDrop, crossedThresholds } from './threshold.policy';
import { ThresholdNotifierService } from './threshold-notifier.service';
import { ThresholdRepo, type ThresholdCrossing } from './threshold.repo';

/** A Cost Center and a year, the unit of the use of a budget. */
export interface BudgetPair {
  costCenterId: string;
  year: number;
}

/** The Cost Centers and years a change touches, with what was used of each before it: what `settle` compares the use after the change with. */
export interface ThresholdWatch {
  readonly usedBefore: ReadonlyMap<string, bigint>;
  readonly pairs: readonly BudgetPair[];
}

/** The effective base of each Cost Center and year before an adjustment lowers it, read under the caller's existing locks. */
export interface BaseDropWatch {
  readonly baseBefore: ReadonlyMap<string, bigint>;
  readonly pairs: readonly BudgetPair[];
}

/**
 * The alert of 80 and 100 percent of the base of a budget (`QĐ-111af`, R-5, R-28). A change that moves what a Cost Center uses (a commitment held, an invoice booked, a seat-month, the commitment of 01/01,
 * the commitments that wait for a budget attached) is surrounded by `watch` before it and `settle` after it, in the same transaction; `watch` takes the lock of the budget year of each pair (the Cost Centers by id, the years
 * earliest first, the order of the module; taking it again is nothing) so that nobody else moves the use between the two reads and a crossing is never missed by two changes that each see only their own. What is used is what is spent and what is still held (what the check of a request reads); the base is the effective one, the base of the version with the
 * adjustments, read when the change is settled, so an adjustment that raises or lowers the base tells nothing by itself and the use that goes over the new base is told again. A Cost Center with no
 * budget has no base and tells nothing. Every time the use goes from under a threshold to at it or over it is one crossing and is told (`RV2-01`): the use that goes over and stays is told once, the
 * use that goes back under (a release, a reversal, an adjustment that raised the base) and over again is told again. A crossing is written with its number, read under the lock of the year, and told only when it was written.
 */
@Injectable()
export class ThresholdAlertService {
  constructor(
    private readonly commitments: CommitmentRepo,
    private readonly budgets: BudgetFactsRepo,
    private readonly yearLock: BudgetYearLockRepo,
    private readonly alerts: ThresholdRepo,
    private readonly notifier: ThresholdNotifierService,
  ) {}

  /** Locks the budget years and reads what the Cost Centers and years use now, before the change. */
  async watch(tx: DbTx, pairs: readonly BudgetPair[]): Promise<ThresholdWatch> {
    const unique = [...new Map(pairs.map((pair) => [heldKey(pair.costCenterId, pair.year), pair])).values()].sort(
      (a, b) => (a.costCenterId < b.costCenterId ? -1 : a.costCenterId > b.costCenterId ? 1 : a.year - b.year),
    );
    for (const costCenterId of [...new Set(unique.map((pair) => pair.costCenterId))]) {
      await this.yearLock.lock(
        tx,
        costCenterId,
        unique.filter((pair) => pair.costCenterId === costCenterId).map((pair) => pair.year),
      );
    }

    return { pairs: unique, usedBefore: await this.usedOf(tx, unique) };
  }

  /** What is used after the change against the base that holds then; the alerts that are new are told. Returns how many. */
  async settle(tx: DbTx, watch: ThresholdWatch, now: Date = new Date()): Promise<number> {
    const usedAfter = await this.usedOf(tx, watch.pairs);
    const usedBefore = (pair: BudgetPair): bigint => watch.usedBefore.get(heldKey(pair.costCenterId, pair.year)) ?? 0n;
    const usedNow = (pair: BudgetPair): bigint => usedAfter.get(heldKey(pair.costCenterId, pair.year)) ?? 0n;
    // Only a use that went up can cross a threshold: a release, a reversal or a change of the base alone reads no base.
    const raised = watch.pairs.filter((pair) => usedNow(pair) > usedBefore(pair));
    const crossed: ThresholdCrossing[] = [];
    for (const year of [...new Set(raised.map((pair) => pair.year))].sort((a, b) => a - b)) {
      const inYear = raised.filter((pair) => pair.year === year);
      const bases = await this.budgets.approvedOfCostCenters(
        inYear.map((pair) => pair.costCenterId),
        year,
        tx,
      );
      for (const pair of inYear) {
        const baseMinor = bases.get(pair.costCenterId)?.baseMinor;
        if (baseMinor === undefined) continue;
        for (const threshold of crossedThresholds({
          usedBeforeMinor: usedBefore(pair),
          usedAfterMinor: usedNow(pair),
          baseMinor,
        })) {
          crossed.push({ costCenterId: pair.costCenterId, year, threshold, baseMinor });
        }
      }
    }
    return this.emitCrossed(tx, crossed, now);
  }

  /**
   * Reads the effective base of each Cost Center and year before an approved adjustment lowers it. Takes no additional locks
   * so callers holding budget year locks preserve their existing lock ordering.
   */
  async watchBase(tx: DbTx, pairs: readonly BudgetPair[]): Promise<BaseDropWatch> {
    const unique = this.uniquePairs(pairs);

    return { pairs: unique, baseBefore: await this.basesOf(tx, unique) };
  }

  /** Evaluates thresholds crossed when an adjustment lowered the effective base while use stayed fixed; emits new alerts. */
  async settleBase(tx: DbTx, watch: BaseDropWatch, now: Date = new Date()): Promise<number> {
    if (watch.pairs.length === 0) return 0;
    const [usedMap, baseAfterMap] = [await this.usedOf(tx, watch.pairs), await this.basesOf(tx, watch.pairs)];
    const crossed: ThresholdCrossing[] = [];
    for (const pair of watch.pairs) {
      const key = heldKey(pair.costCenterId, pair.year);
      const baseBefore = watch.baseBefore.get(key);
      const baseAfter = baseAfterMap.get(key);
      if (baseBefore === undefined || baseAfter === undefined) continue;
      const used = usedMap.get(key) ?? 0n;
      for (const threshold of crossedByBaseDrop({ used, baseBefore, baseAfter })) {
        crossed.push({ costCenterId: pair.costCenterId, year: pair.year, threshold, baseMinor: baseAfter });
      }
    }

    return this.emitCrossed(tx, crossed, now);
  }

  private uniquePairs(pairs: readonly BudgetPair[]): BudgetPair[] {
    return [...new Map(pairs.map((pair) => [heldKey(pair.costCenterId, pair.year), pair])).values()].sort((a, b) =>
      a.costCenterId < b.costCenterId ? -1 : a.costCenterId > b.costCenterId ? 1 : a.year - b.year,
    );
  }

  private async basesOf(tx: DbTx, pairs: readonly BudgetPair[]): Promise<Map<string, bigint>> {
    const result = new Map<string, bigint>();
    for (const year of [...new Set(pairs.map((pair) => pair.year))].sort((a, b) => a - b)) {
      const ids = pairs.filter((pair) => pair.year === year).map((pair) => pair.costCenterId);
      const bases = await this.budgets.approvedOfCostCenters(ids, year, tx);
      for (const [costCenterId, entry] of bases) result.set(heldKey(costCenterId, year), entry.baseMinor);
    }

    return result;
  }

  private async emitCrossed(tx: DbTx, crossed: ThresholdCrossing[], now: Date): Promise<number> {
    const told = await this.alerts.insertNew(tx, await this.alerts.numbered(tx, crossed), now);
    await this.notifier.told(tx, told, now);

    return told.length;
  }

  private async usedOf(tx: DbTx, pairs: readonly BudgetPair[]): Promise<Map<string, bigint>> {
    const totals = await this.commitments.totals(pairs, tx);

    return new Map(
      pairs.map((pair) => {
        const key = heldKey(pair.costCenterId, pair.year);
        const entry = totals.get(key);

        return [key, (entry?.held ?? 0n) + (entry?.spent ?? 0n)] as const;
      }),
    );
  }
}
