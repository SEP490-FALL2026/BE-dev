import { Injectable } from '@nestjs/common';
import { fromDateColumn, type BusinessDate } from '../../../../core/business-date';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../../infrastructure/database/transaction-runner';

/** The reads of the periods the renewal looks at, which no other repo of the subscription answers. */
@Injectable()
export class SubscriptionPeriodRepo {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The ids of the terms of a `K2` plan that run a period (`SBF-20`: active, none that a later one continues), the shared pool's and a
   * department's alike, at most `limit`, by id.
   */
  async listAdjustmentSubjectIds(limit: number): Promise<string[]> {
    const rows = await this.prisma.subscription.findMany({
      where: {
        kind: 'TERM',
        status: 'ACTIVE',
        renewedBy: null,
        seatCounting: 'FIXED',
        plan: { provisioningType: 'K2' },
      },
      select: { id: true },
      orderBy: { id: 'asc' },
      take: limit,
    });

    return rows.map((row) => row.id);
  }

  /** Successor period start date and purchased quantity keyed by the predecessor subscription id. */
  async successorPoolFactsOf(
    ids: readonly string[],
    tx?: DbTx,
  ): Promise<Map<string, { startDate: BusinessDate | null; purchasedQuantity: number | null }>> {
    if (ids.length === 0) return new Map();
    const rows = await (tx ?? this.prisma).subscription.findMany({
      where: { renewedFromId: { in: [...ids] } },
      select: { renewedFromId: true, startDate: true, purchasedQuantity: true },
    });

    return new Map(
      rows.flatMap((row) =>
        row.renewedFromId
          ? [
              [
                row.renewedFromId,
                {
                  startDate: row.startDate ? fromDateColumn(row.startDate) : null,
                  purchasedQuantity: row.purchasedQuantity,
                },
              ] as const,
            ]
          : [],
      ),
    );
  }
}
