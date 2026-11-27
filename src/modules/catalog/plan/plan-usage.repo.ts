import { Injectable } from '@nestjs/common';
import { fromDateColumn, toDateColumn, type BusinessDate } from '../../../core/business-date';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { PlanUsageRate } from '../public/catalog.types';
import { kpi3DenominatorOfLines } from './plan.policy';

/** The usage of the plans priced per seat (`KPI-3`, `QĐ-109d`): what the last weekly pass of the usage rules found, and the seats at period end. */
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
   * For each of these plans priced per seat that the last pass judged, the seats with activity and the seats at the end
   * of its active lines (`seats(L, cuối kỳ)` when ledger is open, with fallback to legacy subscriptions without lines).
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

    const targetPlanIds = rates.map((rate) => rate.planId);
    const lineTotals = await this.liveLineSeatsAtPeriodEnd(db, targetPlanIds);
    const legacyTotals = await this.legacyPurchasedByPlan(db, targetPlanIds);

    return rates.map((rate) => ({
      planId: rate.planId,
      activeSeats: rate.activeSeats,
      purchasedSeats: (lineTotals.get(rate.planId) ?? 0) + (legacyTotals.get(rate.planId) ?? 0),
    }));
  }

  private async loadChangesByLine(
    db: DbTx | PrismaService,
    openedIds: readonly string[],
  ): Promise<Map<string, Array<{ effectiveOn: BusinessDate; delta: number }>>> {
    const changesByLine = new Map<string, Array<{ effectiveOn: BusinessDate; delta: number }>>();
    if (openedIds.length === 0) return changesByLine;
    const changes = await db.seatChange.findMany({
      where: { subscriptionLineId: { in: [...openedIds] } },
      select: { subscriptionLineId: true, effectiveOn: true, delta: true },
    });
    for (const change of changes) {
      const list = changesByLine.get(change.subscriptionLineId) ?? [];
      list.push({ effectiveOn: fromDateColumn(change.effectiveOn), delta: change.delta });
      changesByLine.set(change.subscriptionLineId, list);
    }

    return changesByLine;
  }

  private async liveLineSeatsAtPeriodEnd(
    db: DbTx | PrismaService,
    planIds: readonly string[],
  ): Promise<Map<string, number>> {
    const lines = await db.subscriptionLine.findMany({
      where: {
        planId: { in: [...planIds] },
        closedReason: null,
        subscription: { status: 'ACTIVE', closedAt: null, renewedBy: { is: null } },
      },
      select: {
        id: true,
        planId: true,
        ledgerOpenedOn: true,
        closedOn: true,
        subscription: { select: { purchasedQuantity: true, endDate: true, renewalDate: true } },
      },
    });
    if (lines.length === 0) return new Map();

    const openedIds = lines.filter((line) => line.ledgerOpenedOn !== null).map((line) => line.id);
    const changesByLine = await this.loadChangesByLine(db, openedIds);
    const byPlan = new Map<
      string,
      Array<{ ledgerOpenedOn: string | null; seatsAtPeriodEnd: number | null; fallbackQuantity: number | null }>
    >();
    for (const line of lines) {
      const periodEndRaw = line.closedOn ?? line.subscription.endDate ?? line.subscription.renewalDate;
      const periodEnd = periodEndRaw ? fromDateColumn(periodEndRaw) : null;
      const openedOn = line.ledgerOpenedOn ? fromDateColumn(line.ledgerOpenedOn) : null;
      const lineChanges = changesByLine.get(line.id) ?? [];
      const seatsAtPeriodEnd =
        openedOn === null
          ? null
          : lineChanges.reduce(
              (sum, ch) => (periodEnd === null || ch.effectiveOn <= periodEnd ? sum + ch.delta : sum),
              0,
            );
      const list = byPlan.get(line.planId) ?? [];
      list.push({ ledgerOpenedOn: openedOn, seatsAtPeriodEnd, fallbackQuantity: line.subscription.purchasedQuantity });
      byPlan.set(line.planId, list);
    }

    return new Map([...byPlan].map(([planId, entries]) => [planId, kpi3DenominatorOfLines(entries)]));
  }

  private async legacyPurchasedByPlan(
    db: DbTx | PrismaService,
    planIds: readonly string[],
  ): Promise<Map<string, number>> {
    const bought = await db.subscription.groupBy({
      by: ['planId'],
      where: {
        planId: { in: [...planIds] },
        status: 'ACTIVE',
        purchasedQuantity: { not: null },
        renewedBy: { is: null },
        lines: { none: {} },
      },
      _sum: { purchasedQuantity: true },
    });

    return new Map(bought.map((row) => [row.planId, row._sum.purchasedQuantity ?? 0]));
  }
}
