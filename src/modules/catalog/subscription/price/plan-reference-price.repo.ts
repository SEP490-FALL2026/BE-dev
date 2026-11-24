import { Injectable } from '@nestjs/common';
import { DONG } from '../../../../core/money/money';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import { referenceCycleOf } from './subscription-price.policy';

/**
 * The reads of the reference price a plan carries (`QĐ-113a`), the price a request falls back to when no subscription of the plan prices it. The plan
 * aggregate writes it (`PlanRepo`); this is the read the price side needs, so it never loads the plan with its application or its profile.
 */
@Injectable()
export class PlanReferencePriceRepo {
  constructor(private readonly prisma: PrismaService) {}

  /** The reference price of the plan in dong (above zero) with its kind; null when it has none, it is not in dong, or the plan does not exist. */
  async findOfPlan(
    planId: string,
    tx?: DbTx,
  ): Promise<{
    provisioningType: string;
    amountMinor: bigint;
    currency: string;
    referenceCommitmentMonths: 1 | 12 | null;
  } | null> {
    const row = await (tx ?? this.prisma).plan.findUnique({
      where: { id: planId },
      select: {
        provisioningType: true,
        referencePriceMinor: true,
        referencePriceCurrency: true,
        referenceCommitmentMonths: true,
      },
    });
    if (!row || row.referencePriceMinor === null || row.referencePriceMinor <= 0n) return null;
    if (row.referencePriceCurrency !== DONG) return null;

    return {
      provisioningType: row.provisioningType,
      amountMinor: row.referencePriceMinor,
      currency: DONG,
      referenceCommitmentMonths:
        row.referenceCommitmentMonths === 1 || row.referenceCommitmentMonths === 12
          ? row.referenceCommitmentMonths
          : null,
    };
  }

  /** For each of these plans that has a reference price in dong, the cycle it is counted by (`referenceCycleOf`), in one read; the others are absent. */
  async findCyclesOfPlans(planIds: readonly string[], tx?: DbTx): Promise<Map<string, 'MONTHLY' | 'ONE_TIME'>> {
    const cycles = new Map<string, 'MONTHLY' | 'ONE_TIME'>();
    if (planIds.length === 0) return cycles;
    const rows = await (tx ?? this.prisma).plan.findMany({
      where: { id: { in: [...planIds] }, referencePriceMinor: { gt: 0n }, referencePriceCurrency: DONG },
      select: { id: true, provisioningType: true },
    });
    for (const row of rows) {
      const cycle = referenceCycleOf(row.provisioningType);
      if (cycle) cycles.set(row.id, cycle);
    }

    return cycles;
  }
}
