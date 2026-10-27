import { Injectable } from '@nestjs/common';
import { fromDateColumn, toDateColumn, type BusinessDate } from '../../../core/business-date';
import { formatRate, parseRate } from '../../../core/money/rate';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import type {
  NewSubscription,
  PriceSnapshotRecord,
  SubscriptionKind,
  SubscriptionListFilter,
  SubscriptionRecord,
  SubscriptionState,
  UnitPriceRecord,
} from './subscription.types';

/** The plan, its application and the vendor of it, only as far as a subscription is answered with them (`LD-01`). */
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
    startDate: date(row.startDate),
    endDate: date(row.endDate),
    renewalDate: date(row.renewalDate),
    noticeDeadline: date(row.noticeDeadline),
    noticePeriodDays: row.noticePeriodDays,
    autoRenew: row.autoRenew,
    allowsMidTermReduction: row.allowsMidTermReduction,
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
    startDate: column(state.startDate),
    endDate: column(state.endDate),
    renewalDate: column(state.renewalDate),
    noticeDeadline: column(state.noticeDeadline),
    noticePeriodDays: state.noticePeriodDays,
    autoRenew: state.autoRenew,
    allowsMidTermReduction: state.allowsMidTermReduction,
  };
}

/** The one writer of `subscriptions` (US-04-03): the subscriptions and perpetual purchases of the plans. */
@Injectable()
export class SubscriptionRepo {
  constructor(private readonly prisma: PrismaService) {}

  async insert(tx: DbTx, input: NewSubscription): Promise<SubscriptionRecord> {
    const { organizationId, planId, ownerDepartmentId, kind, ...state } = input;
    const row = await tx.subscription.create({
      data: { organizationId, planId, ownerDepartmentId, kind, ...columnsOf(state) },
      include: WITH_PLAN,
    });

    return toRecord(row);
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
   * The price a plan is bought at: the unit price and billing cycle of its newest active subscription that has both. A
   * draft has no price to rely on; two active subscriptions of one plan are told apart by the later start, then the id.
   */
  async findPricedOfPlan(
    planId: string,
    tx?: DbTx,
  ): Promise<{
    unitPriceMinor: bigint;
    currency: string;
    billingCycle: 'MONTHLY' | 'QUARTERLY' | 'ANNUAL' | 'OTHER';
  } | null> {
    const row = await (tx ?? this.prisma).subscription.findFirst({
      where: {
        planId,
        status: 'ACTIVE',
        unitPriceMinor: { not: null },
        unitPriceCurrency: { not: null },
        billingCycle: { not: null },
      },
      orderBy: [{ startDate: { sort: 'desc', nulls: 'last' } }, { id: 'asc' }],
      select: { unitPriceMinor: true, unitPriceCurrency: true, billingCycle: true },
    });
    if (!row || row.unitPriceMinor === null || row.unitPriceCurrency === null || row.billingCycle === null) return null;

    return { unitPriceMinor: row.unitPriceMinor, currency: row.unitPriceCurrency, billingCycle: row.billingCycle };
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
