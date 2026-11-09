import { Injectable } from '@nestjs/common';
import { toDateColumn, type BusinessDate } from '../../../core/business-date';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { RuleSubscription } from '../public/catalog.types';

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

/** Reads which subscriptions grant seats on a day, the way the shared pool reads it: what the rules of wasted seats judge. */
@Injectable()
export class SubscriptionGrantingRepo {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The subscriptions that grant seats on `day`: active, not taken over by a later period on `day` (`notTakenOverOn`, the same reading
   * as the shared pool), not ended before `day`. One statement, by id; the plan decides the rules (`PER_SEAT`, the kind of provisioning).
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
        plan: { select: { applicationId: true, provisioningType: true, pricingModel: true } },
      },
      orderBy: { id: 'asc' },
    });

    return rows.map((row) => ({
      subscriptionId: row.id,
      planId: row.planId,
      applicationId: row.plan.applicationId,
      provisioningType: row.plan.provisioningType,
      pricingModel: row.plan.pricingModel,
      purchasedQuantity: row.purchasedQuantity,
    }));
  }
}
