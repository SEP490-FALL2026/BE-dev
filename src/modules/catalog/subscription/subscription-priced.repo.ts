import { fromDateColumn, toDateColumn, type BusinessDate } from '../../../core/business-date';
import { DONG } from '../../../core/money/money';
import { Prisma } from '../../../generated/prisma/client';
import type { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { pickPriceSource } from './pool/subscription-pool.policy';
import type { BillingCycle, SubscriptionKind } from './subscription.types';

/** The queries that tell which subscription prices a plan: shared by the price reads of `SubscriptionRepo`. */

/**
 * The subscriptions that can price a plan: active, with a unit price in dong (`QĐ-111an`: a price an earlier release left in another currency
 * is no price of the new flow, B1A-03) and a billing cycle, and not already continued by a later
 * period that is active itself (that one prices the plan; a later period still a draft leaves the price with this one, F-012). Its end date
 * is not looked at here, the repository has no calendar. No department is asked: the pool is the plan's. A draft has no price to rely on.
 * `pickPriceSource` chooses the one that prices the plan among them (`Q-04` C).
 */
export const livePricedOf = (): Prisma.SubscriptionWhereInput => ({
  status: 'ACTIVE',
  closedAt: null,
  unitPriceMinor: { not: null },
  unitPriceCurrency: DONG,
  AND: [
    { OR: [{ renewedBy: null }, { renewedBy: { is: { status: { not: 'ACTIVE' } } } }] },
    // A perpetual purchase has a price and no billing cycle: its price is the price of the purchase (`QĐ-106d`).
    { OR: [{ billingCycle: { not: null } }, { kind: 'PERPETUAL' }] },
    // A period that has already ended does not price the plan any more (review G23-05); the UTC day is close enough here.
    { OR: [{ endDate: null }, { endDate: { gte: new Date(new Date().toISOString().slice(0, 10)) } }] },
  ],
});

/** A K4 plan always carries its purchase price, paid once (`QĐ-106d`, review G23-04), whatever kind of subscription records it. */
export const PLAN_KIND = { plan: { select: { provisioningType: true, referenceCommitmentMonths: true } } } as const;

/** The priced subscriptions of a plan whose period runs on `on`: begun by it, not ended before it, not continued by a period begun by it. */
export const pricedOn = (on: BusinessDate): Prisma.SubscriptionWhereInput => {
  const day = toDateColumn(on);

  return {
    status: 'ACTIVE',
    closedAt: null,
    unitPriceMinor: { not: null },
    unitPriceCurrency: DONG,
    AND: [
      { OR: [{ billingCycle: { not: null } }, { kind: 'PERPETUAL' }] },
      { OR: [{ startDate: null }, { startDate: { lte: day } }] },
      { OR: [{ endDate: null }, { endDate: { gte: day } }] },
      { OR: [{ renewedBy: { is: null } }, { renewedBy: { is: { startDate: { gt: day } } } }] },
    ],
  };
};
export const PRICE_FIELDS = {
  kind: true,
  unitPriceMinor: true,
  unitPriceCurrency: true,
  monthlyUnitPriceMinor: true,
  priceReportingMinor: true,
  priceReportingCurrency: true,
  billingCycle: true,
  allowsMidTermReduction: true,
} as const;

/** A priced row as `pickPriceSource` reads it: the price and the cycle are there (`livePricedOf` asks for them). */
export const withPriceSource = <
  R extends {
    id: string;
    startDate: Date | null;
    isPrimaryForPlan: boolean;
    unitPriceMinor: bigint | null;
    priceReportingMinor: bigint | null;
    billingCycle: BillingCycle | null;
  },
>(
  row: R,
) => ({
  ...row,
  startDate: row.startDate ? fromDateColumn(row.startDate) : null,
  unitPriceMinor: row.unitPriceMinor ?? 0n,
  reportingPriceMinor: row.priceReportingMinor,
  billingCycle: row.billingCycle ?? 'OTHER',
});

export interface PricedOfPlanResult {
  subscriptionId: string;
  subscriptionKind: 'TERM' | 'PERPETUAL';
  provisioningType: 'K1' | 'K2' | 'K3' | 'K4' | 'K5';
  referenceCommitmentMonths: 1 | 12 | null;
  unitPriceMinor: bigint;
  monthlyUnitPriceMinor: bigint | null;
  currency: string;
  /** The unit price converted to the reporting currency when it was recorded; null when it was not converted. */
  reporting: { amountMinor: bigint; currency: string } | null;
  billingCycle: BillingCycle;
  allowsMidTermReduction: boolean;
}

/** Maps a priced subscription row returned by `pickPriceSource` into plan price facts. */
export function toPricedOfPlan(row: {
  id: string;
  kind: 'TERM' | 'PERPETUAL';
  plan: { provisioningType: 'K1' | 'K2' | 'K3' | 'K4' | 'K5'; referenceCommitmentMonths: number | null };
  unitPriceMinor: bigint | null;
  monthlyUnitPriceMinor: bigint | null;
  unitPriceCurrency: string | null;
  priceReportingMinor: bigint | null;
  priceReportingCurrency: string | null;
  billingCycle: BillingCycle | null;
  allowsMidTermReduction: boolean;
}): PricedOfPlanResult | null {
  if (row.unitPriceMinor === null || row.unitPriceCurrency === null) return null;

  return {
    subscriptionId: row.id,
    subscriptionKind: row.plan.provisioningType === 'K4' ? 'PERPETUAL' : row.kind,
    provisioningType: row.plan.provisioningType,
    referenceCommitmentMonths:
      row.plan.referenceCommitmentMonths === 1 || row.plan.referenceCommitmentMonths === 12
        ? row.plan.referenceCommitmentMonths
        : null,
    unitPriceMinor: row.unitPriceMinor,
    monthlyUnitPriceMinor: row.monthlyUnitPriceMinor,
    currency: row.unitPriceCurrency,
    reporting:
      row.priceReportingMinor !== null && row.priceReportingCurrency !== null
        ? { amountMinor: row.priceReportingMinor, currency: row.priceReportingCurrency }
        : null,
    billingCycle: row.billingCycle ?? 'OTHER',
    allowsMidTermReduction: row.allowsMidTermReduction,
  };
}

const LINE_CYCLE_MONTHS: Readonly<Record<BillingCycle, number>> = {
  MONTHLY: 1,
  QUARTERLY: 3,
  ANNUAL: 12,
  OTHER: 1,
};

/** Lines of active non-superseded periods that can price their plan (`B2-R7`). */
export const livePricedLineOf = (): Prisma.SubscriptionLineWhereInput => ({
  OR: [{ closedOn: null }, { closedOn: { gte: new Date(new Date().toISOString().slice(0, 10)) } }],
  subscription: {
    status: 'ACTIVE',
    closedAt: null,
    AND: [
      { OR: [{ renewedBy: null }, { renewedBy: { is: { status: { not: 'ACTIVE' } } } }] },
      { OR: [{ billingCycle: { not: null } }, { kind: 'PERPETUAL' }] },
      { OR: [{ endDate: null }, { endDate: { gte: new Date(new Date().toISOString().slice(0, 10)) } }] },
    ],
  },
});

/** Lines whose period and service window cover `on` (`B2-R7`). */
export const pricedLineOn = (on: BusinessDate): Prisma.SubscriptionLineWhereInput => {
  const day = toDateColumn(on);

  return {
    AND: [
      { OR: [{ closedOn: null }, { closedOn: { gte: day } }] },
      { OR: [{ ledgerOpenedOn: null }, { ledgerOpenedOn: { lte: day } }] },
      {
        subscription: {
          status: 'ACTIVE',
          closedAt: null,
          AND: [
            { OR: [{ billingCycle: { not: null } }, { kind: 'PERPETUAL' }] },
            { OR: [{ startDate: null }, { startDate: { lte: day } }] },
            { OR: [{ endDate: null }, { endDate: { gte: day } }] },
            { OR: [{ renewedBy: { is: null } }, { renewedBy: { is: { startDate: { gt: day } } } }] },
          ],
        },
      },
    ],
  };
};

export const LINE_PRICE_SELECT = {
  id: true,
  planId: true,
  monthlyUnitPriceMinor: true,
  plan: { select: { provisioningType: true, referenceCommitmentMonths: true } },
  subscription: {
    select: {
      id: true,
      planId: true,
      kind: true,
      startDate: true,
      isPrimaryForPlan: true,
      unitPriceMinor: true,
      unitPriceCurrency: true,
      monthlyUnitPriceMinor: true,
      priceReportingMinor: true,
      priceReportingCurrency: true,
      billingCycle: true,
      allowsMidTermReduction: true,
    },
  },
} as const;

export type LinePriceRow = Prisma.SubscriptionLineGetPayload<{ select: typeof LINE_PRICE_SELECT }>;

/** Adapts a `subscription_lines` row into a `PriceSource` using line-level `monthlyUnitPriceMinor` (`B2-R7`). */
export function withLinePriceSource(row: LinePriceRow) {
  const { subscription } = row;
  const billingCycle = subscription.billingCycle ?? 'OTHER';
  const matchesSub =
    subscription.planId === row.planId &&
    subscription.monthlyUnitPriceMinor === row.monthlyUnitPriceMinor &&
    subscription.unitPriceMinor !== null &&
    subscription.unitPriceCurrency === DONG;
  const unitPriceMinor = matchesSub
    ? (subscription.unitPriceMinor as bigint)
    : row.monthlyUnitPriceMinor * BigInt(LINE_CYCLE_MONTHS[billingCycle]);
  const reportingMinor =
    matchesSub && subscription.priceReportingMinor !== null ? subscription.priceReportingMinor : unitPriceMinor;

  return {
    id: subscription.id,
    startDate: subscription.startDate ? fromDateColumn(subscription.startDate) : null,
    isPrimaryForPlan: subscription.isPrimaryForPlan,
    unitPriceMinor,
    reportingPriceMinor: reportingMinor,
    billingCycle,
    lineRow: row,
    derivedUnitPriceMinor: unitPriceMinor,
    derivedReportingMinor: reportingMinor,
  };
}

/** Maps a line-backed `pickPriceSource` winner into `PricedOfPlanResult` (`B2-R7`). */
export function toPricedLineOfPlan(winner: ReturnType<typeof withLinePriceSource>): PricedOfPlanResult {
  const { lineRow, derivedUnitPriceMinor, derivedReportingMinor } = winner;
  const { subscription, plan } = lineRow;

  return {
    subscriptionId: subscription.id,
    subscriptionKind: plan.provisioningType === 'K4' ? 'PERPETUAL' : subscription.kind,
    provisioningType: plan.provisioningType,
    referenceCommitmentMonths:
      plan.referenceCommitmentMonths === 1 || plan.referenceCommitmentMonths === 12
        ? plan.referenceCommitmentMonths
        : null,
    unitPriceMinor: derivedUnitPriceMinor,
    monthlyUnitPriceMinor: lineRow.monthlyUnitPriceMinor,
    currency: DONG,
    reporting: { amountMinor: derivedReportingMinor, currency: DONG },
    billingCycle: subscription.billingCycle ?? 'OTHER',
    allowsMidTermReduction: subscription.allowsMidTermReduction,
  };
}

/** Finds the line-level pricing source for `planId` (on `on`, or latest live), returning null when no lines match. */
export async function findPricedLineOfPlan(
  db: DbTx | PrismaService,
  planId: string,
  on?: BusinessDate,
): Promise<PricedOfPlanResult | null> {
  let chosen =
    on === undefined
      ? null
      : pickPriceSource(
          (
            await db.subscriptionLine.findMany({
              where: { planId, ...pricedLineOn(on) },
              select: LINE_PRICE_SELECT,
            })
          ).map(withLinePriceSource),
        );
  chosen ??= pickPriceSource(
    (
      await db.subscriptionLine.findMany({
        where: { planId, ...livePricedLineOf() },
        select: LINE_PRICE_SELECT,
      })
    ).map(withLinePriceSource),
  );

  return chosen ? toPricedLineOfPlan(chosen) : null;
}

/** Collects billing cycles from `subscription_lines` for `planIds` into `cycles`. */
export async function collectLineCycles(
  db: DbTx | PrismaService,
  planIds: readonly string[],
  cycles: Map<string, 'MONTHLY' | 'QUARTERLY' | 'ANNUAL' | 'OTHER' | 'ONE_TIME'>,
): Promise<void> {
  const lineRows = await db.subscriptionLine.findMany({
    where: { planId: { in: [...planIds] }, ...livePricedLineOf() },
    select: LINE_PRICE_SELECT,
  });
  const byPlan = new Map<string, ReturnType<typeof withLinePriceSource>[]>();
  for (const row of lineRows) {
    byPlan.set(row.planId, [...(byPlan.get(row.planId) ?? []), withLinePriceSource(row)]);
  }
  for (const [planId, sources] of byPlan) {
    const chosen = pickPriceSource(sources);
    if (!chosen) continue;
    const isPerpetual =
      chosen.lineRow.plan.provisioningType === 'K4' || chosen.lineRow.subscription.kind === 'PERPETUAL';
    cycles.set(planId, isPerpetual ? 'ONE_TIME' : chosen.billingCycle);
  }
}

/** Resolves billing cycles for `planIds` preferring line-level pricing and falling back to legacy subscriptions. */
export async function findPricedCyclesInDb(
  db: DbTx | PrismaService,
  planIds: readonly string[],
): Promise<Map<string, 'MONTHLY' | 'QUARTERLY' | 'ANNUAL' | 'OTHER' | 'ONE_TIME'>> {
  const cycles = new Map<string, 'MONTHLY' | 'QUARTERLY' | 'ANNUAL' | 'OTHER' | 'ONE_TIME'>();
  if (planIds.length === 0) return cycles;
  await collectLineCycles(db, planIds, cycles);

  const remaining = planIds.filter((id) => !cycles.has(id));
  if (remaining.length === 0) return cycles;
  const rows = await db.subscription.findMany({
    where: { planId: { in: remaining }, ...livePricedOf(), lines: { none: {} } },
    select: { id: true, planId: true, startDate: true, isPrimaryForPlan: true, ...PRICE_FIELDS, ...PLAN_KIND },
  });
  const byPlan = new Map<string, Array<ReturnType<typeof withPriceSource> & { kind: SubscriptionKind }>>();
  for (const row of rows) {
    const kind: SubscriptionKind = row.plan.provisioningType === 'K4' ? 'PERPETUAL' : row.kind;
    byPlan.set(row.planId, [...(byPlan.get(row.planId) ?? []), { ...withPriceSource(row), kind }]);
  }
  for (const [planId, sources] of byPlan) {
    const chosen = pickPriceSource(sources);
    if (chosen) cycles.set(planId, chosen.kind === 'PERPETUAL' ? 'ONE_TIME' : chosen.billingCycle);
  }

  return cycles;
}
