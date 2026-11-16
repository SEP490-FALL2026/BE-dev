import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AlertThreshold } from './threshold.policy';

/** A crossing the use made of a threshold: the Cost Center, the year, the threshold and the effective base the use went over. */
export interface ThresholdCrossing {
  costCenterId: string;
  year: number;
  threshold: AlertThreshold;
  baseMinor: bigint;
}

/** An alert of a threshold, as it is written and told: the crossing and its number (`episode`, 1 for the first time the use goes over, one more for each time it goes over again after going back under). */
export interface ThresholdAlert extends ThresholdCrossing {
  episode: number;
}

const keyOf = (crossing: Pick<ThresholdCrossing, 'costCenterId' | 'year' | 'threshold'>): string =>
  `${crossing.costCenterId}:${crossing.year}:${crossing.threshold}`;

/** Every SQL of the table `budget_threshold_alerts` (`RV-2`, MAJ-10; the number of the crossing is FIX-RV23 RV2-01). */
@Injectable()
export class ThresholdRepo {
  /**
   * The number each of these crossings takes: one more than the last alert of the same Cost Center, year and threshold (1 when there is none). It reads what is there, so it is exact only under the lock of
   * the budget year of each pair, which `ThresholdAlertService.watch` holds until the transaction ends.
   */
  async numbered(tx: DbTx, crossings: readonly ThresholdCrossing[]): Promise<ThresholdAlert[]> {
    if (crossings.length === 0) return [];
    const last = await tx.budgetThresholdAlert.groupBy({
      by: ['costCenterId', 'year', 'threshold'],
      where: {
        OR: crossings.map((crossing) => ({
          costCenterId: crossing.costCenterId,
          year: crossing.year,
          threshold: crossing.threshold,
        })),
      },
      _max: { episode: true },
    });
    const lastOf = new Map(
      last.map((row) => [keyOf({ ...row, threshold: row.threshold as AlertThreshold }), row._max.episode ?? 0]),
    );

    return crossings.map((crossing) => ({ ...crossing, episode: (lastOf.get(keyOf(crossing)) ?? 0) + 1 }));
  }

  /**
   * Writes the alerts that are new and returns exactly those: one for the same Cost Center, year, threshold and number already exists is left as it is (`ON CONFLICT DO NOTHING`), so the caller tells only
   * what it wrote, and the same crossing written twice is told once.
   */
  async insertNew(tx: DbTx, alerts: readonly ThresholdAlert[], now: Date): Promise<ThresholdAlert[]> {
    if (alerts.length === 0) return [];
    const written = await tx.budgetThresholdAlert.createManyAndReturn({
      data: alerts.map((alert) => ({ ...alert, createdAt: now })),
      skipDuplicates: true,
      select: { costCenterId: true, year: true, threshold: true, episode: true, baseMinor: true },
    });

    return written.map((row) => ({ ...row, threshold: row.threshold as AlertThreshold }));
  }
}
