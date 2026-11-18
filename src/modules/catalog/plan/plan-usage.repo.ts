import { Injectable } from '@nestjs/common';
import { toDateColumn, type BusinessDate } from '../../../core/business-date';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { PlanUsageRate } from '../public/catalog.types';

/** The usage of the plans priced per seat (`KPI-3`, `QĐ-109d`): what the last weekly pass of the usage rules found, and the seats bought. */
@Injectable()
export class PlanUsageRepo {
  constructor(private readonly prisma: PrismaService) {}

  /** Replaces what the organization knew of the usage of its plans with what one pass found: a plan the pass did not judge has none. */
  async replaceAll(
    tx: DbTx,
    organizationId: string,
    assessedOn: BusinessDate,
    rates: readonly PlanUsageRate[],
  ): Promise<void> {
    await tx.planUsageRate.deleteMany({ where: { organizationId } });
    if (rates.length === 0) return;
    await tx.planUsageRate.createMany({
      data: rates.map((rate) => ({
        planId: rate.planId,
        organizationId,
        activeSeats: rate.activeSeats,
        assessedSeats: rate.assessedSeats,
        assessedOn: toDateColumn(assessedOn),
      })),
    });
  }

  /**
   * For each of these plans priced per seat that the last pass judged, the seats with activity and the seats its active subscriptions bought
   * (a period another one follows is left out: the same seats), in two statements. A plan with no row, or not priced per seat, is absent.
   */
  async activeAndPurchased(
    planIds: readonly string[],
    tx?: DbTx,
  ): Promise<{ planId: string; activeSeats: number; purchasedSeats: number }[]> {
    if (planIds.length === 0) return [];
    const db = tx ?? this.prisma;
    const rates = await db.planUsageRate.findMany({
      where: { planId: { in: [...planIds] }, plan: { pricingModel: 'PER_SEAT' } },
      select: { planId: true, activeSeats: true },
    });
    if (rates.length === 0) return [];
    const bought = await db.subscription.groupBy({
      by: ['planId'],
      where: {
        planId: { in: rates.map((rate) => rate.planId) },
        status: 'ACTIVE',
        purchasedQuantity: { not: null },
        renewedBy: { is: null },
      },
      _sum: { purchasedQuantity: true },
    });
    const purchased = new Map(bought.map((row) => [row.planId, row._sum.purchasedQuantity ?? 0]));

    return rates.map((rate) => ({
      planId: rate.planId,
      activeSeats: rate.activeSeats,
      purchasedSeats: purchased.get(rate.planId) ?? 0,
    }));
  }
}
