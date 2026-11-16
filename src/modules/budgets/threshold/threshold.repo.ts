import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AlertThreshold } from './threshold.policy';

/** An alert of a threshold, as it is written and told: the Cost Center, the year, the threshold and the effective base the use went over. */
export interface ThresholdAlert {
  costCenterId: string;
  year: number;
  threshold: AlertThreshold;
  baseMinor: bigint;
}

/** Every SQL of the table `budget_threshold_alerts` (`RV-2`, MAJ-10). */
@Injectable()
export class ThresholdRepo {
  /**
   * Writes the alerts that are new and returns exactly those: one for the same Cost Center, year, threshold and base already exists is left as it is (`ON CONFLICT DO NOTHING`), so the
   * caller tells only what it wrote, and two changes that cross a threshold at the same time tell it once.
   */
  async insertNew(tx: DbTx, alerts: readonly ThresholdAlert[], now: Date): Promise<ThresholdAlert[]> {
    if (alerts.length === 0) return [];
    const written = await tx.budgetThresholdAlert.createManyAndReturn({
      data: alerts.map((alert) => ({ ...alert, createdAt: now })),
      skipDuplicates: true,
      select: { costCenterId: true, year: true, threshold: true, baseMinor: true },
    });

    return written.map((row) => ({ ...row, threshold: row.threshold as AlertThreshold }));
  }
}
