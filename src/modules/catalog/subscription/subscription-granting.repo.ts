import { Injectable } from '@nestjs/common';
import { fromDateColumn, toDateColumn, type BusinessDate } from '../../../core/business-date';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { RuleSubscription, StockPlanFilter, StockPlanPage } from '../public/catalog.types';

/**
 * A period a seat can still be taken from on `today` as far as its successor goes (`BR-MF1-09a`): no later period continues it, or the one
 * that does is still a draft or has not started. Until the next period runs, the period that runs and the next one are one pool.
 */
export const notTakenOverOn = (today: BusinessDate): Prisma.SubscriptionWhereInput => ({
  OR: [
    { renewedBy: null },
    { renewedBy: { is: { OR: [{ status: { not: 'ACTIVE' } }, { startDate: { gt: toDateColumn(today) } }] } } },
  ],
});

/**
 * Leaves out of `rows`, the subscriptions that grant seats on `today`, every period recorded ahead of its start whose previous period is among
 * them. The period that runs and the next one are one pool: the seats carried to the next period are the seats of the one that runs, and the
 * next adds none that can be given before it runs, so the pool counts them once (`QĐ-111n`: seats are counted, never subscription records).
 * A next period whose previous one is not in `rows` (it is over, or another IT Admin answers for it) stays: the pool lives on it. One reading
 * for the stock of a grant, the stock summary and the rules of wasted seats.
 */
export function withoutPeriodsAhead<T extends { id: string; renewedFromId: string | null; startDate: Date | null }>(
  rows: readonly T[],
  today: BusinessDate,
): T[] {
  const ids = new Set(rows.map((row) => row.id));

  return rows.filter(
    (row) =>
      !(
        row.renewedFromId !== null &&
        ids.has(row.renewedFromId) &&
        row.startDate !== null &&
        fromDateColumn(row.startDate) > today
      ),
  );
}

/** Reads which subscriptions grant seats on a day, the way the shared pool reads it: what the rules of wasted seats judge. */
@Injectable()
export class SubscriptionGrantingRepo {
  constructor(private readonly prisma: PrismaService) {}

  /** Which of these subscriptions a later period continues (`renewed_from_id`): they are no longer the period that runs. One statement. */
  async idsWithSuccessor(ids: readonly string[]): Promise<ReadonlySet<string>> {
    if (ids.length === 0) return new Set();
    const rows = await this.prisma.subscription.findMany({
      where: { renewedFromId: { in: [...ids] } },
      select: { renewedFromId: true },
    });

    return new Set(rows.flatMap((row) => (row.renewedFromId === null ? [] : [row.renewedFromId])));
  }

  /**
   * One page of the plans that give out seats (K2), keys (K4) or personal accounts (K1), each with the subscriptions a seat can be taken
   * from on `today`: the shared pool of the plan as a grant reads it (active, not taken over by a later period, not ended, a next period
   * recorded ahead of its start counted with the one it continues, `withoutPeriodsAhead`). A plan with no
   * such subscription is not listed, and with an IT Admin named only the subscriptions that person answers for count, so the plans of
   * the others do not appear. By application, plan then id, and the total for the same filter, from one snapshot.
   */
  async pageStockPlans(filter: StockPlanFilter): Promise<StockPlanPage> {
    const grantable: Prisma.SubscriptionWhereInput = {
      status: 'ACTIVE',
      ...(filter.responsibleItAdminEmployeeId
        ? { responsibleItAdminEmployeeId: filter.responsibleItAdminEmployeeId }
        : {}),
      AND: [
        notTakenOverOn(filter.today),
        { OR: [{ endDate: null }, { endDate: { gte: toDateColumn(filter.today) } }] },
      ],
    };
    const where: Prisma.PlanWhereInput = {
      provisioningType: { in: ['K1', 'K2', 'K4'] },
      ...(filter.planId ? { id: filter.planId } : {}),
      subscriptions: { some: grantable },
    };

    return this.prisma.$transaction(
      async (tx) => {
        const rows = await tx.plan.findMany({
          where,
          select: {
            id: true,
            name: true,
            provisioningType: true,
            application: { select: { id: true, name: true, logoUrl: true } },
            subscriptions: {
              where: grantable,
              select: { id: true, purchasedQuantity: true, renewedFromId: true, startDate: true },
              orderBy: { id: 'asc' },
            },
          },
          orderBy: [{ application: { normalizedName: 'asc' } }, { normalizedName: 'asc' }, { id: 'asc' }],
          skip: filter.skip,
          take: filter.take,
        });

        return {
          items: rows.map((row) => ({
            planId: row.id,
            planName: row.name,
            // The filter keeps K1, K2 and K4 plans only.
            provisioningType: row.provisioningType as 'K1' | 'K2' | 'K4',
            applicationId: row.application.id,
            applicationName: row.application.name,
            applicationLogoUrl: row.application.logoUrl,
            subscriptions: withoutPeriodsAhead(row.subscriptions, filter.today).map((subscription) => ({
              subscriptionId: subscription.id,
              purchasedQuantity: subscription.purchasedQuantity,
            })),
          })),
          total: await tx.plan.count({ where }),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  /**
   * The subscriptions that grant seats on `day`: active, not taken over by a later period on `day` (`notTakenOverOn`, the same reading
   * as the shared pool), not ended before `day`, and not a next period recorded ahead of its start (`withoutPeriodsAhead`). One statement, by id; the plan decides the rules (`PER_SEAT`, the kind of provisioning).
   */
  async grantingOn(day: BusinessDate, tx?: DbTx): Promise<RuleSubscription[]> {
    const rows = await (tx ?? this.prisma).subscription.findMany({
      where: {
        status: 'ACTIVE',
        AND: [notTakenOverOn(day), { OR: [{ endDate: null }, { endDate: { gte: toDateColumn(day) } }] }],
      },
      select: {
        id: true,
        planId: true,
        purchasedQuantity: true,
        renewedFromId: true,
        startDate: true,
        plan: { select: { applicationId: true, provisioningType: true, pricingModel: true } },
      },
      orderBy: { id: 'asc' },
    });

    return withoutPeriodsAhead(rows, day).map((row) => ({
      subscriptionId: row.id,
      planId: row.planId,
      applicationId: row.plan.applicationId,
      provisioningType: row.plan.provisioningType,
      pricingModel: row.plan.pricingModel,
      purchasedQuantity: row.purchasedQuantity,
    }));
  }
}
