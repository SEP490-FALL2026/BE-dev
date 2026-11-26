import { Injectable } from '@nestjs/common';
import { fromDateColumn, toDateColumn, type BusinessDate } from '../../../core/business-date';
import { formatRate, parseRate } from '../../../core/money/rate';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { BaselineSubscription } from '../public/catalog.types';
import { pickPriceSource, type LivenessFacts } from './pool/subscription-pool.policy';
import { monthlyPriceOf } from './price/subscription-price.policy';
import { derivedMonthlyUnitPriceMinor } from './subscription.policy';
import {
  PLAN_KIND,
  PRICE_FIELDS,
  findPricedCyclesInDb,
  findPricedLineOfPlan,
  livePricedOf,
  pricedOn,
  toPricedOfPlan,
  withPriceSource,
  type PricedOfPlanResult,
} from './subscription-priced.repo';
import type {
  NewSubscription,
  OriginalPriceRecord,
  PriceSnapshotRecord,
  SubscriptionKind,
  SubscriptionListFilter,
  SubscriptionListScope,
  SubscriptionRecord,
  SubscriptionState,
  UnitPriceRecord,
} from './subscription.types';

/** The plan, its application and the vendor of it, only as far as a subscription is answered with them. */
const WITH_PLAN = {
  workspace: { select: { id: true, name: true } },
  plan: {
    select: {
      name: true,
      pricingModel: true,
      provisioningType: true,
      hasAdminConsole: true,
      application: {
        select: { id: true, name: true, logoUrl: true, kind: true, vendor: { select: { id: true, name: true } } },
      },
    },
  },
} as const;
type Row = Prisma.SubscriptionGetPayload<{ include: typeof WITH_PLAN }>;
/** The columns the payment days of a subscription are worked out from. */
export type PaidTermRow = Prisma.SubscriptionGetPayload<{
  select: {
    id: true;
    planId: true;
    responsibleItAdminEmployeeId: true;
    billingCycle: true;
    startDate: true;
    endDate: true;
    renewalDate: true;
    autoRenew: true;
    createdAt: true;
  };
}>;
/** A subscription that runs a period (`QĐ-111o`): not a purchase made once, not a draft, not a period a later one continues. */
const RUNS_A_PERIOD: Prisma.SubscriptionWhereInput = { kind: 'TERM', status: 'ACTIVE', renewedBy: null };

const date = (value: Date | null) => (value ? fromDateColumn(value) : null);
const column = (value: string | null) => (value ? toDateColumn(value) : null);

function unitPriceOf(row: Row): UnitPriceRecord | null {
  return row.unitPriceMinor !== null && row.unitPriceCurrency !== null && row.priceRecordedOn !== null
    ? {
        amountMinor: row.unitPriceMinor,
        currency: row.unitPriceCurrency,
        recordedOn: fromDateColumn(row.priceRecordedOn),
      }
    : null;
}

function priceSnapshotOf(row: Row): PriceSnapshotRecord | null {
  return row.priceRate !== null &&
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
}

function originalPriceOf(row: Row): OriginalPriceRecord | null {
  return row.originalUnitPriceMinor !== null && row.originalCurrency !== null
    ? { amountMinor: row.originalUnitPriceMinor, currency: row.originalCurrency }
    : null;
}

function toRecord(row: Row): SubscriptionRecord {
  const { application } = row.plan;
  if (!application.vendor) throw new Error('A subscription belongs to an application with a vendor');

  return {
    id: row.id,
    planId: row.planId,
    planName: row.plan.name,
    planPricingModel: row.plan.pricingModel,
    planProvisioningType: row.plan.provisioningType,
    planHasAdminConsole: row.plan.hasAdminConsole,
    applicationId: application.id,
    applicationName: application.name,
    applicationLogoUrl: application.logoUrl,
    applicationKind: application.kind,
    vendor: { id: application.vendor.id, name: application.vendor.name },
    kind: row.kind,
    status: row.status,
    purchasedQuantity: row.purchasedQuantity,
    unitPrice: unitPriceOf(row),
    monthlyUnitPriceMinor: row.monthlyUnitPriceMinor,
    priceSnapshot: priceSnapshotOf(row),
    originalPrice: originalPriceOf(row),
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
    workspace: row.workspace ? { id: row.workspace.id, name: row.workspace.name } : null,
    seatCounting: row.seatCounting === 'MEMBERS' ? 'MEMBERS' : 'FIXED',
    minimumSeatsTotal: row.minimumSeatsTotal,
    invoicedLater: row.invoicedLater,
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
    monthlyUnitPriceMinor:
      state.monthlyUnitPriceMinor !== undefined
        ? state.monthlyUnitPriceMinor
        : derivedMonthlyUnitPriceMinor(state.unitPrice, state.billingCycle),
    priceRecordedOn: state.unitPrice ? toDateColumn(state.unitPrice.recordedOn) : null,
    priceRate: state.priceSnapshot ? formatRate(state.priceSnapshot.rate) : null,
    priceRateDate: state.priceSnapshot ? toDateColumn(state.priceSnapshot.rateDate) : null,
    priceRateSource: state.priceSnapshot?.rateSource ?? null,
    priceReportingMinor: state.priceSnapshot?.reportingMinor ?? null,
    priceReportingCurrency: state.priceSnapshot?.reportingCurrency ?? null,
    priceExchangeRateId: state.priceSnapshot?.exchangeRateId ?? null,
    originalUnitPriceMinor: state.originalPrice?.amountMinor ?? null,
    originalCurrency: state.originalPrice?.currency ?? null,
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
    ...(state.workspaceId === undefined ? {} : { workspaceId: state.workspaceId }),
    ...(state.seatCounting === undefined ? {} : { seatCounting: state.seatCounting }),
    ...(state.minimumSeatsTotal === undefined ? {} : { minimumSeatsTotal: state.minimumSeatsTotal }),
    ...(state.invoicedLater === undefined ? {} : { invoicedLater: state.invoicedLater }),
  };
}

/** The one writer of `subscriptions` (US-04-03): the subscriptions and perpetual purchases of the plans. */
@Injectable()
export class SubscriptionRepo {
  constructor(private readonly prisma: PrismaService) {}

  async insert(tx: DbTx, input: NewSubscription): Promise<SubscriptionRecord> {
    const { organizationId, planId, kind, renewedFromId, ...state } = input;
    const row = await tx.subscription.create({
      data: {
        organizationId,
        planId,
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

  /** The ids of the subscriptions this IT Admin answers for, in one statement. */
  async idsResponsibleFor(employeeId: string, tx?: DbTx): Promise<string[]> {
    const rows = await (tx ?? this.prisma).subscription.findMany({
      where: { responsibleItAdminEmployeeId: employeeId },
      select: { id: true },
      orderBy: { id: 'asc' },
    });

    return rows.map((row) => row.id);
  }

  /** Distinct responsible IT Admin employee ids on active subscriptions of the plan, ordered by employee id. */
  async findActiveResponsibleItAdminIdsOfPlan(planId: string, tx?: DbTx): Promise<string[]> {
    const rows = await (tx ?? this.prisma).subscription.findMany({
      where: { planId, status: 'ACTIVE', responsibleItAdminEmployeeId: { not: null } },
      select: { responsibleItAdminEmployeeId: true },
      distinct: ['responsibleItAdminEmployeeId'],
      orderBy: { responsibleItAdminEmployeeId: 'asc' },
    });

    return rows.flatMap((row) => (row.responsibleItAdminEmployeeId !== null ? [row.responsibleItAdminEmployeeId] : []));
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

  /**
   * Locks every subscription currently marked primary for `planId` together with `extraIds` in one statement ordered by `id`,
   * so concurrent primary changes or renewal completions serialize before locking the plan.
   */
  async lockPrimaryCandidates(tx: DbTx, planId: string, extraIds: readonly string[]): Promise<void> {
    const uniqueIds = [...new Set(extraIds)];
    await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM subscriptions
       WHERE (plan_id = ${planId}::uuid AND is_primary_for_plan = true)
          OR id = ANY(${uniqueIds}::uuid[])
       ORDER BY id FOR UPDATE`;
  }

  /**
   * Hands every subscription that names `fromEmployeeId` responsible to `toEmployeeId` (`QĐ-111g`), in one statement: the rows are locked in
   * id order first, so two handing overs of the same IT Admin queue up and the second finds none. Returns the ids it moved, in id order.
   */
  async reassignResponsible(tx: DbTx, fromEmployeeId: string, toEmployeeId: string): Promise<string[]> {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      WITH held AS (
        SELECT id FROM subscriptions WHERE responsible_it_admin_employee_id = ${fromEmployeeId}::uuid ORDER BY id FOR UPDATE)
      UPDATE subscriptions s
         SET responsible_it_admin_employee_id = ${toEmployeeId}::uuid, updated_at = now()
        FROM held WHERE s.id = held.id
      RETURNING s.id`;

    return rows.map((row) => row.id).sort();
  }

  /**
   * Names `employeeId` as the IT Admin who answers for the subscription (`QĐ-118f`). The caller holds the row `FOR UPDATE` and has judged the
   * person; this only writes.
   */
  async setResponsible(tx: DbTx, id: string, employeeId: string): Promise<void> {
    await tx.$executeRaw`
      UPDATE subscriptions SET responsible_it_admin_employee_id = ${employeeId}::uuid, updated_at = now() WHERE id = ${id}::uuid`;
  }

  /** How many subscriptions name each of these IT Admins responsible (`QĐ-111g`); one who answers for none is absent. */
  async countResponsibleOf(employeeIds: readonly string[], tx?: DbTx): Promise<Map<string, number>> {
    if (employeeIds.length === 0) return new Map();
    const rows = await (tx ?? this.prisma).$queryRaw<{ employee_id: string; total: number }[]>`
      SELECT responsible_it_admin_employee_id AS employee_id, count(*)::int AS total
        FROM subscriptions WHERE responsible_it_admin_employee_id = ANY(${[...employeeIds]}::uuid[])
       GROUP BY responsible_it_admin_employee_id`;

    return new Map(rows.map((row) => [row.employee_id, row.total]));
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
      select: {
        id: true,
        planId: true,
        workspaceId: true,
        status: true,
        kind: true,
        endDate: true,
        lines: { select: { closedReason: true } },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });

    return rows.map((row) => ({
      id: row.id,
      planId: row.planId,
      workspaceId: row.workspaceId,
      status: row.status,
      kind: row.kind,
      endDate: date(row.endDate),
      renewed: row.lines.length > 0 && row.lines.every((line) => line.closedReason !== null),
    }));
  }

  /**
   * The price a plan is bought at: the unit price and billing cycle of the main subscription of the plan, the newest active one with
   * a price. The shared pool is the plan's, not a department's, so no department is asked (`BR-MF1-07`, S1-02). With `on`, the main one
   * among the periods that run on that day first: begun by it (or with no start), not ended before it, and not continued by a later
   * period that has begun by it, so a price recorded for a period that begins later is not used before its day. When no period
   * runs on the day (the period ended and its renewal is not recorded yet), the newest priced one as without `on`.
   */
  async findPricedOfPlan(planId: string, tx?: DbTx, on?: BusinessDate): Promise<PricedOfPlanResult | null> {
    const db = tx ?? this.prisma;
    const fromLines = await findPricedLineOfPlan(db, planId, on);
    if (fromLines) return fromLines;

    const select = { id: true, startDate: true, isPrimaryForPlan: true, ...PRICE_FIELDS, ...PLAN_KIND } as const;
    let row =
      on === undefined
        ? null
        : pickPriceSource(
            (await db.subscription.findMany({ where: { planId, ...pricedOn(on), lines: { none: {} } }, select })).map(
              withPriceSource,
            ),
          );
    row ??= pickPriceSource(
      (await db.subscription.findMany({ where: { planId, ...livePricedOf(), lines: { none: {} } }, select })).map(
        withPriceSource,
      ),
    );

    return row ? toPricedOfPlan(row) : null;
  }

  /** The billing cycles of the main subscriptions pricing these plans, one per plan (`ONE_TIME` for a perpetual purchase); no department is asked. */
  findPricedCyclesOfPlans(
    planIds: readonly string[],
    tx?: DbTx,
  ): Promise<Map<string, 'MONTHLY' | 'QUARTERLY' | 'ANNUAL' | 'OTHER' | 'ONE_TIME'>> {
    return findPricedCyclesInDb(tx ?? this.prisma, planIds);
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
   * Every active subscription of the company, with its plan and application, by id: one statement. Its cost follows the people who hold its
   * seats, not the department that may own it (`QĐ-103k`), so the baseline reads them all.
   */
  async baselineRows(tx?: DbTx): Promise<BaselineSubscription[]> {
    const rows = await (tx ?? this.prisma).subscription.findMany({
      where: { status: 'ACTIVE' },
      select: {
        id: true,
        planId: true,
        purchasedQuantity: true,
        priceReportingMinor: true,
        monthlyUnitPriceMinor: true,
        billingCycle: true,
        startDate: true,
        endDate: true,
        renewalDate: true,
        renewedBy: { select: { id: true } },
        plan: { select: { name: true, provisioningType: true, application: { select: { name: true } } } },
      },
      orderBy: { id: 'asc' },
    });

    return rows.map((row) => ({
      subscriptionId: row.id,
      planId: row.planId,
      planName: row.plan.name,
      applicationName: row.plan.application.name,
      provisioningType: row.plan.provisioningType,
      purchasedQuantity: row.purchasedQuantity,
      unitPriceReportingMinor: row.priceReportingMinor,
      monthlyPriceMinor: monthlyPriceOf(row),
      billingCycle: row.billingCycle,
      startDate: row.startDate ? fromDateColumn(row.startDate) : null,
      endDate: row.endDate ? fromDateColumn(row.endDate) : null,
      renewalDate: row.renewalDate ? fromDateColumn(row.renewalDate) : null,
      hasSuccessor: row.renewedBy !== null,
    }));
  }

  /**
   * A short label for each of these subscriptions, by id: the application and the plan, never a price or a person; "application / plan" unless
   * `label` words them (the notification text uses `applicationPlanName`). An id that does not exist is absent.
   */
  async labelsOf(
    ids: readonly string[],
    tx?: DbTx,
    label: (applicationName: string, planName: string) => string = (application, plan) => `${application} / ${plan}`,
  ): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const rows = await (tx ?? this.prisma).subscription.findMany({
      where: { id: { in: [...ids] } },
      select: { id: true, plan: { select: { name: true, application: { select: { name: true } } } } },
    });

    return new Map(rows.map((row) => [row.id, label(row.plan.application.name, row.plan.name)]));
  }

  /**
   * Every operating subscription the filters let through whose point of adjustment is read, to find the ones near or past it (`QĐ-111o`): not
   * a purchase made once, a draft or a period a later one continues. Not paged: they are few, and the point is a rule of the policy.
   */
  async findExpiryCandidates(scope: SubscriptionListScope): Promise<SubscriptionRecord[]> {
    const where: Prisma.SubscriptionWhereInput = { AND: [...this.conditionsOf(scope), RUNS_A_PERIOD] };

    return (await this.prisma.subscription.findMany({ where, include: WITH_PLAN, orderBy: { id: 'asc' } })).map(
      toRecord,
    );
  }

  /**
   * The subscriptions that run a period and are paid by a cycle from a start day, whose payment days an invoice follows (`PI-2`). Only the columns the payment days are worked out from, one
   * statement, by id.
   */
  async listPaidTerms(tx?: DbTx): Promise<PaidTermRow[]> {
    return (tx ?? this.prisma).subscription.findMany({
      where: {
        ...RUNS_A_PERIOD,
        startDate: { not: null },
        billingCycle: { in: ['MONTHLY', 'QUARTERLY', 'ANNUAL'] },
      },
      select: {
        id: true,
        planId: true,
        responsibleItAdminEmployeeId: true,
        billingCycle: true,
        startDate: true,
        endDate: true,
        renewalDate: true,
        autoRenew: true,
        createdAt: true,
      },
      orderBy: { id: 'asc' },
    });
  }

  private conditionsOf(filter: SubscriptionListScope & { ids?: readonly string[] }): Prisma.SubscriptionWhereInput[] {
    return [
      ...(filter.ids ? [{ id: { in: [...filter.ids] } }] : []),
      ...(filter.responsibleItAdminEmployeeId
        ? [{ responsibleItAdminEmployeeId: filter.responsibleItAdminEmployeeId }]
        : []),
      ...(filter.applicationId ? [{ plan: { applicationId: filter.applicationId } }] : []),
      ...(filter.planId ? [{ planId: filter.planId }] : []),
      ...(filter.workspaceId ? [{ workspaceId: filter.workspaceId }] : []),
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
  }

  /** One page by application, plan then creation, and the total for the same filter, from one snapshot. */
  async list(filter: SubscriptionListFilter): Promise<{ items: SubscriptionRecord[]; total: number }> {
    const where: Prisma.SubscriptionWhereInput = { AND: this.conditionsOf(filter) };

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
