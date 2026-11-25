import { Injectable } from '@nestjs/common';
import { fromDateColumn, toDateColumn, type BusinessDate } from '../../../core/business-date';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import type {
  PoolSubscription,
  RuleSubscription,
  StockPlan,
  StockPlanFilter,
  StockPlanPage,
} from '../public/catalog.types';
import { isLineServingOn } from '../subscription-line/subscription-line.policy';
import { SubscriptionLineSeatsService } from '../subscription-line/subscription-line-seats.service';
import { orderBySourcePreference, withoutPeriodsAhead } from './pool/subscription-pool.policy';
import { withPriceSource } from './subscription-priced.repo';

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

/** The plan row of a stock page as the stock plan it is: a K2 plan over the subscriptions of its pool, a K4 plan over its lots (the id of the lot as the purchase). */
function stockPlanOf(
  row: {
    id: string;
    name: string;
    provisioningType: string;
    keyBinding: StockPlan['keyBinding'];
    application: { id: string; name: string; logoUrl: string | null };
    subscriptions: {
      id: string;
      purchasedQuantity: number | null;
      renewedFromId: string | null;
      startDate: Date | null;
    }[];
    licenseLots: { id: string; licenseCount: number }[];
  },
  today: BusinessDate,
): StockPlan {
  return {
    planId: row.id,
    planName: row.name,
    // The filter keeps K2 and K4 plans only.
    provisioningType: row.provisioningType as 'K2' | 'K4',
    keyBinding: row.keyBinding,
    applicationId: row.application.id,
    applicationName: row.application.name,
    applicationLogoUrl: row.application.logoUrl,
    subscriptions:
      row.provisioningType === 'K4'
        ? row.licenseLots.map((lot) => ({ subscriptionId: lot.id, purchasedQuantity: lot.licenseCount }))
        : withoutPeriodsAhead(row.subscriptions, today).map((subscription) => ({
            subscriptionId: subscription.id,
            purchasedQuantity: subscription.purchasedQuantity,
          })),
  };
}

interface GrantableLineRow {
  id: string;
  planId: string;
  ledgerOpenedOn: Date | null;
  closedOn: Date | null;
  createdAt: Date;
  subscription: {
    id: string;
    status: 'ACTIVE' | 'DRAFT';
    startDate: Date | null;
    endDate: Date | null;
    purchasedQuantity: number | null;
    isPrimaryForPlan: boolean;
  };
}

function filterServingLines(lineRows: readonly GrantableLineRow[], today: BusinessDate): GrantableLineRow[] {
  return lineRows.filter((row) =>
    isLineServingOn(
      {
        ledgerOpenedOn: row.ledgerOpenedOn ? fromDateColumn(row.ledgerOpenedOn) : null,
        closedOn: row.closedOn ? fromDateColumn(row.closedOn) : null,
      },
      today,
      {
        status: row.subscription.status,
        startDate: row.subscription.startDate ? fromDateColumn(row.subscription.startDate) : null,
        endDate: row.subscription.endDate ? fromDateColumn(row.subscription.endDate) : null,
      },
    ),
  );
}

@Injectable()
export class SubscriptionGrantingRepo {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: SubscriptionLineSeatsService,
  ) {}

  /** The subscriptions of one plan a seat can be taken from on `today`, in the order a grant takes them (see `findGrantableOfPlans`). */
  async findGrantableOfPlan(planId: string, today: BusinessDate, tx?: DbTx) {
    return (await this.findGrantableOfPlans([planId], today, tx)).get(planId) ?? [];
  }

  /**
   * The same for many plans in one read, by plan (a plan with none is absent). For K2 lines, reads serving lines on `today`
   * (including a `RENEWED` line through `closedOn`) and derives seat counts from `seat_changes` when `ledgerOpenedOn <= today`;
   * falls back to legacy `subscriptions` rows for periods without lines (K1, K4, and pre-line test periods).
   */
  async findGrantableOfPlans(
    planIds: readonly string[],
    today: BusinessDate,
    tx?: DbTx,
  ): Promise<Map<string, PoolSubscription[]>> {
    const grantable = new Map<string, PoolSubscription[]>();
    if (planIds.length === 0) return grantable;

    await this.collectGrantableLines(planIds, today, grantable, tx);

    const rows = await (tx ?? this.prisma).subscription.findMany({
      where: {
        planId: { in: [...planIds] },
        status: 'ACTIVE',
        lines: { none: {} },
        AND: [notTakenOverOn(today), { OR: [{ endDate: null }, { endDate: { gte: toDateColumn(today) } }] }],
      },
      select: {
        id: true,
        planId: true,
        purchasedQuantity: true,
        startDate: true,
        renewedFromId: true,
        isPrimaryForPlan: true,
        unitPriceMinor: true,
        priceReportingMinor: true,
        billingCycle: true,
      },
    });
    type Source = ReturnType<typeof withPriceSource<(typeof rows)[number]>>;
    const byPlan = new Map<string, Source[]>();
    for (const row of withoutPeriodsAhead(rows, today)) {
      byPlan.set(row.planId, [...(byPlan.get(row.planId) ?? []), withPriceSource(row)]);
    }
    for (const [planId, sources] of byPlan) {
      const legacy = orderBySourcePreference(sources).map((row) => ({
        subscriptionId: row.id,
        purchasedQuantity: row.purchasedQuantity,
        isPrimaryForPlan: row.isPrimaryForPlan,
      }));
      grantable.set(planId, [...(grantable.get(planId) ?? []), ...legacy]);
    }

    return grantable;
  }

  private async collectGrantableLines(
    planIds: readonly string[],
    today: BusinessDate,
    grantable: Map<string, PoolSubscription[]>,
    tx?: DbTx,
  ): Promise<void> {
    const day = toDateColumn(today);
    const lineRows = await (tx ?? this.prisma).subscriptionLine.findMany({
      where: {
        planId: { in: [...planIds] },
        OR: [{ closedOn: null }, { closedOn: { gte: day } }],
        subscription: {
          status: 'ACTIVE',
          kind: 'TERM',
          AND: [
            { OR: [{ startDate: null }, { startDate: { lte: day } }] },
            { OR: [{ endDate: null }, { endDate: { gte: day } }] },
          ],
        },
      },
      select: {
        id: true,
        planId: true,
        ledgerOpenedOn: true,
        closedOn: true,
        createdAt: true,
        subscription: {
          select: {
            id: true,
            status: true,
            startDate: true,
            endDate: true,
            purchasedQuantity: true,
            isPrimaryForPlan: true,
          },
        },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });

    const serving = filterServingLines(lineRows, today);
    const openedIds = serving
      .filter((row) => row.ledgerOpenedOn !== null && fromDateColumn(row.ledgerOpenedOn) <= today)
      .map((row) => row.id);
    const ledgerSeats = await this.ledger.seatsOnOfLines(openedIds, today, tx);

    for (const row of serving) {
      const opened = row.ledgerOpenedOn !== null && fromDateColumn(row.ledgerOpenedOn) <= today;
      const entry: PoolSubscription = {
        subscriptionId: row.subscription.id,
        subscriptionLineId: row.id,
        lineCreatedAt: row.createdAt,
        purchasedQuantity: opened ? (ledgerSeats.get(row.id) ?? 0) : row.subscription.purchasedQuantity,
        isPrimaryForPlan: row.subscription.isPrimaryForPlan,
      };
      grantable.set(row.planId, [...(grantable.get(row.planId) ?? []), entry]);
    }
  }

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
   * One page of the plans that give out seats (K2) or keys (K4), each with what a grant can take from on `today`: for a K2 plan the shared pool
   * of the plan as a grant reads it (active, not taken over by a later period, not ended, a next period recorded ahead of its start counted with
   * the one it continues, `withoutPeriodsAhead`); for a K4 plan its lots, each as an entry of the id of the lot with the licenses it bought. A plan
   * of personal accounts (K1) has no subscription and is not listed. A plan with nothing to take from is not listed, and with an IT Admin named
   * only what that person answers for counts, so the plans of the others do not appear. By application, plan then id, and the total for the same filter, from one snapshot.
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
    const lots: Prisma.LicenseLotWhereInput = filter.responsibleItAdminEmployeeId
      ? { responsibleItAdminEmployeeId: filter.responsibleItAdminEmployeeId }
      : {};
    const where: Prisma.PlanWhereInput = {
      ...(filter.planId ? { id: filter.planId } : {}),
      OR: [
        { provisioningType: 'K2', subscriptions: { some: grantable } },
        { provisioningType: 'K4', licenseLots: { some: lots } },
      ],
    };

    return this.prisma.$transaction(
      async (tx) => {
        const rows = await tx.plan.findMany({
          where,
          select: {
            id: true,
            name: true,
            provisioningType: true,
            keyBinding: true,
            application: { select: { id: true, name: true, logoUrl: true } },
            subscriptions: {
              where: grantable,
              select: { id: true, purchasedQuantity: true, renewedFromId: true, startDate: true },
              orderBy: { id: 'asc' },
            },
            licenseLots: { where: lots, select: { id: true, licenseCount: true }, orderBy: { id: 'asc' } },
          },
          orderBy: [{ application: { normalizedName: 'asc' } }, { normalizedName: 'asc' }, { id: 'asc' }],
          skip: filter.skip,
          take: filter.take,
        });

        return {
          items: rows.map((row) => stockPlanOf(row, filter.today)),
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
