import { Injectable } from '@nestjs/common';
import { fromDateColumn, toDateColumn, type BusinessDate } from '../../../core/business-date';
import { formatRate, parseRate } from '../../../core/money/rate';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { BaselineSubscription } from '../public/catalog.types';
import { orderBySourcePreference, pickPriceSource, type LivenessFacts } from './pool/subscription-pool.policy';
import type {
  BillingCycle,
  NewSubscription,
  PriceSnapshotRecord,
  SubscriptionKind,
  SubscriptionListFilter,
  SubscriptionRecord,
  SubscriptionState,
  UnitPriceRecord,
} from './subscription.types';

/** The plan, its application and the vendor of it, only as far as a subscription is answered with them. */
const WITH_PLAN = {
  plan: {
    select: {
      name: true,
      pricingModel: true,
      application: {
        select: { id: true, name: true, kind: true, vendor: { select: { id: true, name: true } } },
      },
    },
  },
} as const;
type Row = Prisma.SubscriptionGetPayload<{ include: typeof WITH_PLAN }>;

/**
 * The subscriptions that can price a plan: active, with a unit price, a currency and a billing cycle, and not already continued by a later
 * period (`isLive`: its end date is not looked at here, the repository has no calendar). No department is asked: the pool is the plan's.
 * A draft has no price to rely on. `pickPriceSource` chooses the one that prices the plan among them (`Q-04` C).
 */
const livePricedOf = (): Prisma.SubscriptionWhereInput => ({
  status: 'ACTIVE',
  renewedBy: null,
  unitPriceMinor: { not: null },
  unitPriceCurrency: { not: null },
  // A perpetual purchase has a price and no billing cycle: its price is the price of the purchase (`QĐ-106d`).
  OR: [{ billingCycle: { not: null } }, { kind: 'PERPETUAL' }],
});
const PRICE_FIELDS = {
  kind: true,
  unitPriceMinor: true,
  unitPriceCurrency: true,
  billingCycle: true,
  allowsMidTermReduction: true,
} as const;

/** A priced row as `pickPriceSource` reads it: the price and the cycle are there (`livePricedOf` asks for them). */
const withPriceSource = <
  R extends {
    id: string;
    startDate: Date | null;
    isPrimaryForPlan: boolean;
    unitPriceMinor: bigint | null;
    billingCycle: BillingCycle | null;
  },
>(
  row: R,
) => ({
  ...row,
  startDate: row.startDate ? fromDateColumn(row.startDate) : null,
  unitPriceMinor: row.unitPriceMinor ?? 0n,
  billingCycle: row.billingCycle ?? 'OTHER',
});

const date = (value: Date | null) => (value ? fromDateColumn(value) : null);
const column = (value: string | null) => (value ? toDateColumn(value) : null);

function toRecord(row: Row): SubscriptionRecord {
  const unitPrice: UnitPriceRecord | null =
    row.unitPriceMinor !== null && row.unitPriceCurrency !== null && row.priceRecordedOn !== null
      ? {
          amountMinor: row.unitPriceMinor,
          currency: row.unitPriceCurrency,
          recordedOn: fromDateColumn(row.priceRecordedOn),
        }
      : null;
  const priceSnapshot: PriceSnapshotRecord | null =
    row.priceRate !== null &&
    row.priceRateDate !== null &&
    row.priceRateSource !== null &&
    row.priceReportingMinor !== null &&
    row.priceReportingCurrency !== null
      ? {
          rate: parseRate(row.priceRate.toFixed(10)),
          rateDate: fromDateColumn(row.priceRateDate),
          rateSource: row.priceRateSource,
          reportingMinor: row.priceReportingMinor,
          reportingCurrency: row.priceReportingCurrency,
          exchangeRateId: row.priceExchangeRateId,
        }
      : null;
  const { application } = row.plan;
  if (!application.vendor) throw new Error('A subscription belongs to an application with a vendor');

  return {
    id: row.id,
    planId: row.planId,
    planName: row.plan.name,
    planPricingModel: row.plan.pricingModel,
    ownerDepartmentId: row.ownerDepartmentId, // Gói 9: nullable kho chung
    applicationId: application.id,
    applicationName: application.name,
    applicationKind: application.kind,
    vendor: { id: application.vendor.id, name: application.vendor.name },
    kind: row.kind,
    status: row.status,
    purchasedQuantity: row.purchasedQuantity,
    unitPrice,
    priceSnapshot,
    billingCycle: row.billingCycle,
    commitmentTermMonths:
      row.commitmentTermMonths === 1 || row.commitmentTermMonths === 12 ? row.commitmentTermMonths : null,
    startDate: date(row.startDate),
    endDate: date(row.endDate),
    renewalDate: date(row.renewalDate),
    noticeDeadline: date(row.noticeDeadline),
    noticePeriodDays: row.noticePeriodDays,
    autoRenew: row.autoRenew,
    allowsMidTermReduction: row.allowsMidTermReduction,
    responsibleItAdminEmployeeId: row.responsibleItAdminEmployeeId,
    vendorMinimumSeats: row.vendorMinimumSeats,
    isPrimaryForPlan: row.isPrimaryForPlan,
    renewedFromId: row.renewedFromId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** The columns a state writes: the same set for a new subscription and for every change, so a write never leaves a stale one. */
function columnsOf(state: SubscriptionState) {
  return {
    status: state.status,
    purchasedQuantity: state.purchasedQuantity,
    unitPriceMinor: state.unitPrice?.amountMinor ?? null,
    unitPriceCurrency: state.unitPrice?.currency ?? null,
    priceRecordedOn: state.unitPrice ? toDateColumn(state.unitPrice.recordedOn) : null,
    priceRate: state.priceSnapshot ? formatRate(state.priceSnapshot.rate) : null,
    priceRateDate: state.priceSnapshot ? toDateColumn(state.priceSnapshot.rateDate) : null,
    priceRateSource: state.priceSnapshot?.rateSource ?? null,
    priceReportingMinor: state.priceSnapshot?.reportingMinor ?? null,
    priceReportingCurrency: state.priceSnapshot?.reportingCurrency ?? null,
    priceExchangeRateId: state.priceSnapshot?.exchangeRateId ?? null,
    billingCycle: state.billingCycle,
    commitmentTermMonths: state.commitmentTermMonths,
    startDate: column(state.startDate),
    endDate: column(state.endDate),
    renewalDate: column(state.renewalDate),
    noticeDeadline: column(state.noticeDeadline),
    noticePeriodDays: state.noticePeriodDays,
    autoRenew: state.autoRenew,
    allowsMidTermReduction: state.allowsMidTermReduction,
    responsibleItAdminEmployeeId: state.responsibleItAdminEmployeeId,
    vendorMinimumSeats: state.vendorMinimumSeats,
    isPrimaryForPlan: state.isPrimaryForPlan,
  };
}

/** The one writer of `subscriptions` (US-04-03): the subscriptions and perpetual purchases of the plans. */
@Injectable()
export class SubscriptionRepo {
  constructor(private readonly prisma: PrismaService) {}

  async insert(tx: DbTx, input: NewSubscription): Promise<SubscriptionRecord> {
    const { organizationId, planId, ownerDepartmentId, kind, renewedFromId, ...state } = input;
    const row = await tx.subscription.create({
      data: {
        organizationId,
        planId,
        ownerDepartmentId,
        kind,
        renewedFromId: renewedFromId ?? null,
        ...columnsOf(state),
      },
      include: WITH_PLAN,
    });

    return toRecord(row);
  }

  /** Takes the flag of the subscription that prices its plan off every other subscription of the plan (Q-04); returns the ids that had it. */
  async clearPrimaryOfPlan(tx: DbTx, planId: string, exceptId: string): Promise<string[]> {
    const where = { planId, isPrimaryForPlan: true, id: { not: exceptId } };
    const had = await tx.subscription.findMany({ where, select: { id: true }, orderBy: { id: 'asc' } });
    await tx.subscription.updateMany({
      where: { id: { in: had.map((row) => row.id) } },
      data: { isPrimaryForPlan: false },
    });

    return had.map((row) => row.id);
  }

  /** Takes the flag off one subscription: the period a renewal continues hands it to the new period. */
  async clearPrimary(tx: DbTx, id: string): Promise<void> {
    await tx.subscription.update({ where: { id }, data: { isPrimaryForPlan: false } });
  }

  /** The period that continues each of these, by the id of the one it continues; a period not renewed is absent. */
  async successorsOf(ids: readonly string[], tx?: DbTx): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const rows = await (tx ?? this.prisma).subscription.findMany({
      where: { renewedFromId: { in: [...ids] } },
      select: { id: true, renewedFromId: true },
    });

    return new Map(rows.flatMap((row) => (row.renewedFromId ? [[row.renewedFromId, row.id] as const] : [])));
  }

  /** The subscriptions with these ids, in one read; an id that does not exist is absent. */
  async findMany(ids: readonly string[], tx?: DbTx): Promise<SubscriptionRecord[]> {
    if (ids.length === 0) return [];
    const rows = await (tx ?? this.prisma).subscription.findMany({
      where: { id: { in: [...ids] } },
      include: WITH_PLAN,
      orderBy: { id: 'asc' },
    });

    return rows.map(toRecord);
  }

  async count(): Promise<number> {
    return this.prisma.subscription.count();
  }

  /** The subscription, locked for the rest of the transaction, or null. */
  async lock(tx: DbTx, id: string): Promise<SubscriptionRecord | null> {
    const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM subscriptions WHERE id = ${id}::uuid FOR UPDATE`;
    if (locked.length === 0) return null;

    return this.find(id, tx);
  }

  /** The subscriptions and perpetual purchases of these plans: only what a rule about their term needs. */
  async findOfPlans(
    planIds: readonly string[],
    tx?: DbTx,
  ): Promise<{ subscriptionId: string; planId: string; kind: SubscriptionKind; endDate: BusinessDate | null }[]> {
    if (planIds.length === 0) return [];
    const rows = await (tx ?? this.prisma).subscription.findMany({
      where: { planId: { in: [...planIds] } },
      select: { id: true, planId: true, kind: true, endDate: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });

    return rows.map((row) => ({
      subscriptionId: row.id,
      planId: row.planId,
      kind: row.kind,
      endDate: row.endDate ? fromDateColumn(row.endDate) : null,
    }));
  }

  /**
   * The subscriptions of these plans, as far as they are K2 or K4 plans, that a later period does not continue: the candidates of the rule
   * against a second live subscription (`isLiveSubscription` decides on the end date, the repository has no calendar). A draft is one.
   */
  async findLivenessOfPooledPlans(planIds: readonly string[], tx?: DbTx): Promise<LivenessFacts[]> {
    if (planIds.length === 0) return [];
    const rows = await (tx ?? this.prisma).subscription.findMany({
      where: { planId: { in: [...planIds] }, plan: { provisioningType: { in: ['K2', 'K4'] } }, renewedBy: null },
      select: { id: true, planId: true, status: true, kind: true, endDate: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });

    return rows.map((row) => ({
      id: row.id,
      planId: row.planId,
      status: row.status,
      kind: row.kind,
      endDate: date(row.endDate),
      renewed: false,
    }));
  }

  /** The subscriptions of one plan a seat can be taken from on `today`, in the order a grant takes them (see `findGrantableOfPlans`). */
  async findGrantableOfPlan(planId: string, today: BusinessDate, tx?: DbTx) {
    return (await this.findGrantableOfPlans([planId], today, tx)).get(planId) ?? [];
  }

  /**
   * The same for many plans in one read, by plan (a plan with none is absent). A draft is left out (its seats cannot be granted), and so is
   * a subscription that a later period continues or whose period already ended. Per plan the primary subscription comes first, then the
   * one that would price the plan: the order a grant with no subscription named takes them.
   */
  async findGrantableOfPlans(
    planIds: readonly string[],
    today: BusinessDate,
    tx?: DbTx,
  ): Promise<Map<string, { subscriptionId: string; purchasedQuantity: number | null; isPrimaryForPlan: boolean }[]>> {
    const grantable = new Map<
      string,
      { subscriptionId: string; purchasedQuantity: number | null; isPrimaryForPlan: boolean }[]
    >();
    if (planIds.length === 0) return grantable;
    const rows = await (tx ?? this.prisma).subscription.findMany({
      where: {
        planId: { in: [...planIds] },
        status: 'ACTIVE',
        renewedBy: null,
        OR: [{ endDate: null }, { endDate: { gte: toDateColumn(today) } }],
      },
      select: {
        id: true,
        planId: true,
        purchasedQuantity: true,
        startDate: true,
        isPrimaryForPlan: true,
        unitPriceMinor: true,
        billingCycle: true,
      },
    });
    type Source = ReturnType<typeof withPriceSource<(typeof rows)[number]>>;
    const byPlan = new Map<string, Source[]>();
    for (const row of rows) byPlan.set(row.planId, [...(byPlan.get(row.planId) ?? []), withPriceSource(row)]);
    for (const [planId, sources] of byPlan) {
      grantable.set(
        planId,
        orderBySourcePreference(sources).map((row) => ({
          subscriptionId: row.id,
          purchasedQuantity: row.purchasedQuantity,
          isPrimaryForPlan: row.isPrimaryForPlan,
        })),
      );
    }

    return grantable;
  }

  /**
   * The price a plan is bought at: the unit price and billing cycle of the main subscription of the plan, the newest active one with
   * a price. The shared pool is the plan's, not a department's, so no department is asked (`BR-MF1-07`, S1-02).
   */
  async findPricedOfPlan(
    planId: string,
    tx?: DbTx,
  ): Promise<{
    subscriptionKind: 'TERM' | 'PERPETUAL';
    unitPriceMinor: bigint;
    currency: string;
    billingCycle: 'MONTHLY' | 'QUARTERLY' | 'ANNUAL' | 'OTHER';
    allowsMidTermReduction: boolean;
  } | null> {
    const rows = await (tx ?? this.prisma).subscription.findMany({
      where: { planId, ...livePricedOf() },
      select: { id: true, startDate: true, isPrimaryForPlan: true, ...PRICE_FIELDS },
    });
    const row = pickPriceSource(rows.map(withPriceSource));
    if (!row || row.unitPriceMinor === null || row.unitPriceCurrency === null) return null;

    return {
      subscriptionKind: row.kind,
      unitPriceMinor: row.unitPriceMinor,
      currency: row.unitPriceCurrency,
      billingCycle: row.billingCycle,
      allowsMidTermReduction: row.allowsMidTermReduction,
    };
  }

  /** The billing cycles of the main subscriptions pricing these plans, one per plan (`ONE_TIME` for a perpetual purchase); no department is asked. */
  async findPricedCyclesOfPlans(
    planIds: readonly string[],
    tx?: DbTx,
  ): Promise<Map<string, 'MONTHLY' | 'QUARTERLY' | 'ANNUAL' | 'OTHER' | 'ONE_TIME'>> {
    const cycles = new Map<string, 'MONTHLY' | 'QUARTERLY' | 'ANNUAL' | 'OTHER' | 'ONE_TIME'>();
    if (planIds.length === 0) return cycles;
    const rows = await (tx ?? this.prisma).subscription.findMany({
      where: { planId: { in: [...planIds] }, ...livePricedOf() },
      select: { id: true, planId: true, startDate: true, isPrimaryForPlan: true, ...PRICE_FIELDS },
    });
    const byPlan = new Map<string, Array<ReturnType<typeof withPriceSource> & { kind: SubscriptionKind }>>();
    for (const row of rows) {
      byPlan.set(row.planId, [...(byPlan.get(row.planId) ?? []), { ...withPriceSource(row), kind: row.kind }]);
    }
    for (const [planId, sources] of byPlan) {
      const chosen = pickPriceSource(sources);
      if (chosen) cycles.set(planId, chosen.kind === 'PERPETUAL' ? 'ONE_TIME' : chosen.billingCycle);
    }

    return cycles;
  }

  async find(id: string, tx?: DbTx): Promise<SubscriptionRecord | null> {
    const row = await (tx ?? this.prisma).subscription.findUnique({ where: { id }, include: WITH_PLAN });

    return row ? toRecord(row) : null;
  }

  /** Writes the whole mutable state; the plan and the kind never change. */
  async update(tx: DbTx, id: string, state: SubscriptionState): Promise<SubscriptionRecord> {
    const row = await tx.subscription.update({ where: { id }, data: columnsOf(state), include: WITH_PLAN });

    return toRecord(row);
  }

  /**
   * The active term subscriptions whose milestone (the base date of `deriveNotice`: the declared deadline, else the renewal
   * or end date less the notice period, else the end date of one that does not renew itself) falls between `from` and `to`,
   * oldest first: the only ones a review alert can need (`LD-02`), read by that window instead of all of them. The
   * rule is written twice (here and in `deriveNotice`); `catalog-subscription-read-model` checks that they agree.
   */
  async listTermsWithMilestoneBetween(
    from: BusinessDate,
    to: BusinessDate,
    planId?: string,
  ): Promise<SubscriptionRecord[]> {
    const ids = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT s.id
        FROM subscriptions s
       WHERE s.status = 'ACTIVE' AND s.kind = 'TERM'
         ${planId ? Prisma.sql`AND s.plan_id = ${planId}::uuid` : Prisma.empty}
         AND (CASE
                WHEN s.notice_deadline IS NOT NULL THEN s.notice_deadline
                WHEN s.notice_period_days IS NOT NULL AND COALESCE(s.renewal_date, s.end_date) IS NOT NULL
                  THEN COALESCE(s.renewal_date, s.end_date) - s.notice_period_days
                WHEN NOT s.auto_renew AND s.end_date IS NOT NULL THEN s.end_date
              END) BETWEEN ${from}::date AND ${to}::date`;
    if (ids.length === 0) return [];
    const rows = await this.prisma.subscription.findMany({
      where: { id: { in: ids.map((row) => row.id) } },
      include: WITH_PLAN,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });

    return rows.map(toRecord);
  }

  /**
   * The ids of the term subscriptions a department owns that are not over on `day`, by id: those with no end date, an end date that
   * has not passed, or that renew themselves (the catalog records no cancellation yet, so only an end date or switching the renewal
   * off ends one). A draft counts: its data is incomplete, not its obligation.
   */
  async termIdsNotOverOf(departmentId: string, day: BusinessDate, tx?: DbTx): Promise<string[]> {
    const rows = await (tx ?? this.prisma).subscription.findMany({
      where: {
        ownerDepartmentId: departmentId,
        kind: 'TERM',
        OR: [{ endDate: null }, { endDate: { gte: toDateColumn(day) } }, { autoRenew: true }],
      },
      select: { id: true },
      orderBy: { id: 'asc' },
    });

    return rows.map((row) => row.id);
  }

  /** The ids of the perpetual purchases a department owns, by id: one blocks it only while some seat of it is held. */
  async perpetualIdsOf(departmentId: string, tx?: DbTx): Promise<string[]> {
    const rows = await (tx ?? this.prisma).subscription.findMany({
      where: { ownerDepartmentId: departmentId, kind: 'PERPETUAL' },
      select: { id: true },
      orderBy: { id: 'asc' },
    });

    return rows.map((row) => row.id);
  }

  /** The active subscriptions owned by any of these owners, with their plan and application, by owner and id: one statement. */
  async baselineRowsOf(departmentIds: readonly string[], tx?: DbTx): Promise<BaselineSubscription[]> {
    if (departmentIds.length === 0) return [];
    const rows = await (tx ?? this.prisma).subscription.findMany({
      where: { ownerDepartmentId: { in: [...departmentIds] }, status: 'ACTIVE' },
      select: {
        id: true,
        ownerDepartmentId: true,
        planId: true,
        purchasedQuantity: true,
        priceReportingMinor: true,
        billingCycle: true,
        startDate: true,
        endDate: true,
        renewalDate: true,
        renewedBy: { select: { id: true } },
        plan: { select: { name: true, application: { select: { name: true } } } },
      },
      orderBy: [{ ownerDepartmentId: 'asc' }, { id: 'asc' }],
    });

    return rows.map((row) => ({
      subscriptionId: row.id,
      departmentId: row.ownerDepartmentId,
      planId: row.planId,
      planName: row.plan.name,
      applicationName: row.plan.application.name,
      purchasedQuantity: row.purchasedQuantity,
      unitPriceReportingMinor: row.priceReportingMinor,
      billingCycle: row.billingCycle,
      startDate: row.startDate ? fromDateColumn(row.startDate) : null,
      endDate: row.endDate ? fromDateColumn(row.endDate) : null,
      renewalDate: row.renewalDate ? fromDateColumn(row.renewalDate) : null,
      hasSuccessor: row.renewedBy !== null,
    }));
  }

  /** The ids of every subscription and purchase a department owns, by id. */
  async idsOwnedBy(departmentId: string, tx?: DbTx): Promise<string[]> {
    const rows = await (tx ?? this.prisma).subscription.findMany({
      where: { ownerDepartmentId: departmentId },
      select: { id: true },
      orderBy: { id: 'asc' },
    });

    return rows.map((row) => row.id);
  }

  /** A short label for each of these subscriptions, by id: the application and the plan, never a price or a person. */
  async labelsOf(ids: readonly string[], tx?: DbTx): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const rows = await (tx ?? this.prisma).subscription.findMany({
      where: { id: { in: [...ids] } },
      select: { id: true, plan: { select: { name: true, application: { select: { name: true } } } } },
    });

    return new Map(rows.map((row) => [row.id, `${row.plan.application.name} / ${row.plan.name}`]));
  }

  /** One page by application, plan then creation, and the total for the same filter, from one snapshot. */
  async list(filter: SubscriptionListFilter): Promise<{ items: SubscriptionRecord[]; total: number }> {
    const conditions: Prisma.SubscriptionWhereInput[] = [
      ...(filter.applicationId ? [{ plan: { applicationId: filter.applicationId } }] : []),
      ...(filter.planId ? [{ planId: filter.planId }] : []),
      ...(filter.status ? [{ status: filter.status }] : []),
      ...(filter.kind ? [{ kind: filter.kind }] : []),
      // The rule that derives the NO_ALERT_ANCHOR warning, as a filter: a term subscription with no declared deadline,
      // no notice period that a renewal or end date can be counted from, and either auto renewal or no end date.
      ...(filter.withoutAlertAnchor
        ? [
            { kind: 'TERM' as const },
            { noticeDeadline: null },
            {
              NOT: {
                AND: [
                  { noticePeriodDays: { not: null } },
                  { OR: [{ renewalDate: { not: null } }, { endDate: { not: null } }] },
                ],
              },
            },
            { OR: [{ autoRenew: true }, { endDate: null }] },
          ]
        : []),
    ];
    const where: Prisma.SubscriptionWhereInput = { AND: conditions };

    return this.prisma.$transaction(
      async (tx) => {
        const rows = await tx.subscription.findMany({
          where,
          include: WITH_PLAN,
          orderBy: [
            { plan: { application: { normalizedName: 'asc' } } },
            { plan: { normalizedName: 'asc' } },
            { createdAt: 'asc' },
            { id: 'asc' },
          ],
          skip: filter.skip,
          take: filter.take,
        });

        return { items: rows.map(toRecord), total: await tx.subscription.count({ where }) };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
}
