import { Injectable } from '@nestjs/common';
import { fromDateColumn, toDateColumn, type BusinessDate } from '../../../core/business-date';
import { formatRate, parseRate } from '../../../core/money/rate';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { BaselineSubscription } from '../public/catalog.types';
import type {
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
 * The subscriptions a department can price a plan by: active, owned by that department, with a unit price, a currency and a
 * billing cycle. A draft has no price to rely on, and the price of another department's subscription is never used.
 */
const pricedOf = (ownerDepartmentId: string): Prisma.SubscriptionWhereInput => ({
  ownerDepartmentId,
  status: 'ACTIVE',
  unitPriceMinor: { not: null },
  unitPriceCurrency: { not: null },
  billingCycle: { not: null },
});
/** Of those, the one that prices a plan: the later start first (no start last), then the id. */
const PRICED_FIRST: Prisma.SubscriptionOrderByWithRelationInput[] = [
  { startDate: { sort: 'desc', nulls: 'last' } },
  { id: 'asc' },
];

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
    ownerDepartmentId: row.ownerDepartmentId,
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
   * The price a plan is bought at for the department of a request: the unit price and billing cycle of the newest active
   * subscription of that department that has both, and never the one of another department (`QĐ-89a`, F38). A draft has no
   * price to rely on; two active subscriptions of one plan are told apart by the later start, then the id.
   */
  async findPricedOfPlan(
    planId: string,
    ownerDepartmentId: string,
    tx?: DbTx,
  ): Promise<{
    unitPriceMinor: bigint;
    currency: string;
    billingCycle: 'MONTHLY' | 'QUARTERLY' | 'ANNUAL' | 'OTHER';
    allowsMidTermReduction: boolean;
  } | null> {
    const row = await (tx ?? this.prisma).subscription.findFirst({
      where: { planId, ...pricedOf(ownerDepartmentId) },
      orderBy: PRICED_FIRST,
      select: { unitPriceMinor: true, unitPriceCurrency: true, billingCycle: true, allowsMidTermReduction: true },
    });
    if (!row || row.unitPriceMinor === null || row.unitPriceCurrency === null || row.billingCycle === null) return null;

    return {
      unitPriceMinor: row.unitPriceMinor,
      currency: row.unitPriceCurrency,
      billingCycle: row.billingCycle,
      allowsMidTermReduction: row.allowsMidTermReduction,
    };
  }

  /**
   * The billing cycle of the subscription `findPricedOfPlan` would price each of these plans by for the department, in one
   * read for any number of plans (the same filter and order, the first row of each plan wins); a plan with none is absent.
   */
  async findPricedCyclesOfPlans(
    planIds: readonly string[],
    ownerDepartmentId: string,
    tx?: DbTx,
  ): Promise<Map<string, 'MONTHLY' | 'QUARTERLY' | 'ANNUAL' | 'OTHER'>> {
    const cycles = new Map<string, 'MONTHLY' | 'QUARTERLY' | 'ANNUAL' | 'OTHER'>();
    if (planIds.length === 0) return cycles;
    const rows = await (tx ?? this.prisma).subscription.findMany({
      where: { planId: { in: [...planIds] }, ...pricedOf(ownerDepartmentId) },
      orderBy: [{ planId: 'asc' }, ...PRICED_FIRST],
      select: { planId: true, billingCycle: true },
    });
    for (const row of rows) {
      if (row.billingCycle !== null && !cycles.has(row.planId)) cycles.set(row.planId, row.billingCycle);
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

  /** The ids of every subscription and purchase a department owns, by id. */
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
    }));
  }

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
