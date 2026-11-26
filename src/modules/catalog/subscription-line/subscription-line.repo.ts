import { Injectable } from '@nestjs/common';
import { fromDateColumn, toDateColumn, type BusinessDate } from '../../../core/business-date';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { isCheckViolation, isUniqueViolation } from '../../../infrastructure/database/unique-violation';
import {
  SubscriptionLineLiveTakenError,
  SubscriptionLineMismatchError,
  SubscriptionLinePlanTakenError,
} from './subscription-line.errors';
import type {
  NewSubscriptionLine,
  SubscriptionLineChanges,
  SubscriptionLineClosedReason,
  SubscriptionLineRecord,
} from './subscription-line.types';

type Row = Prisma.SubscriptionLineGetPayload<object>;

const toRecord = (row: Row): SubscriptionLineRecord => ({
  id: row.id,
  organizationId: row.organizationId,
  subscriptionId: row.subscriptionId,
  workspaceId: row.workspaceId,
  planId: row.planId,
  monthlyUnitPriceMinor: row.monthlyUnitPriceMinor,
  minimumSeats: row.minimumSeats,
  ledgerOpenedOn: row.ledgerOpenedOn ? fromDateColumn(row.ledgerOpenedOn) : null,
  renewedFromLineId: row.renewedFromLineId,
  closedOn: row.closedOn ? fromDateColumn(row.closedOn) : null,
  closedReason: row.closedReason as SubscriptionLineClosedReason | null,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

const ORDER: Prisma.SubscriptionLineOrderByWithRelationInput[] = [{ createdAt: 'asc' }, { id: 'asc' }];

/** Maps what the database says of a line (the unique indexes of C1, the guard of C2) to the error of the rule. */
function asLineError(error: unknown): unknown {
  if (isUniqueViolation(error, 'subscription_lines_workspace_plan_live')) return new SubscriptionLineLiveTakenError();
  if (isUniqueViolation(error, 'subscription_id', 'plan_id')) return new SubscriptionLinePlanTakenError();
  if (isCheckViolation(error, 'subscription_lines_workspace_matches_period'))
    return new SubscriptionLineMismatchError('WORKSPACE');
  if (isCheckViolation(error, 'subscription_lines_plan_is_k2'))
    return new SubscriptionLineMismatchError('PLAN_NOT_SEATS');
  if (isCheckViolation(error, 'subscription_lines_plan_vendor'))
    return new SubscriptionLineMismatchError('PLAN_VENDOR');

  return error;
}

/**
 * The one writer of `subscription_lines`: the lines of a subscription period. The lock of a line (tier 6a, `FOR UPDATE`) comes after
 * the lock of its period and before the ledger row it guards; the database holds C1 (one live line per workspace and plan) and C2.
 */
interface PeriodLockSqlRow {
  id: string;
  organization_id: string;
  workspace_id: string | null;
  kind: string;
  status: string;
  start_date: Date | null;
  end_date: Date | null;
  responsible_it_admin_employee_id: string | null;
  updated_at: Date;
}

const toPeriodLockRecord = (row: PeriodLockSqlRow) => ({
  id: row.id,
  organizationId: row.organization_id,
  workspaceId: row.workspace_id,
  kind: row.kind as 'TERM' | 'PERPETUAL',
  status: row.status as 'DRAFT' | 'ACTIVE',
  startDate: row.start_date ? fromDateColumn(row.start_date) : null,
  endDate: row.end_date ? fromDateColumn(row.end_date) : null,
  responsibleItAdminEmployeeId: row.responsible_it_admin_employee_id,
  updatedAt: row.updated_at,
});

@Injectable()
export class SubscriptionLineRepo {
  constructor(private readonly prisma: PrismaService) {}

  async find(id: string, tx?: DbTx): Promise<SubscriptionLineRecord | null> {
    const row = await (tx ?? this.prisma).subscriptionLine.findUnique({ where: { id } });

    return row ? toRecord(row) : null;
  }

  /** The line with this id, locked for writing (tier 6c); null when it does not exist. */
  async lock(tx: DbTx, id: string): Promise<SubscriptionLineRecord | null> {
    const locked = await tx.$queryRaw<
      { id: string }[]
    >`SELECT id FROM subscription_lines WHERE id = ${id}::uuid FOR UPDATE`;

    return locked.length === 0 ? null : this.find(id, tx);
  }

  /** The line of a period for a plan, locked for writing (tier 6c); null when it does not exist. */
  async lockByPeriodAndPlan(tx: DbTx, subscriptionId: string, planId: string): Promise<SubscriptionLineRecord | null> {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM subscription_lines
       WHERE subscription_id = ${subscriptionId}::uuid AND plan_id = ${planId}::uuid
       FOR UPDATE`;

    return locked.length === 0 ? null : this.find(locked[0].id, tx);
  }

  /** Billing cycle and late-invoicing flag of the line's parent period; null when the line does not exist. */
  async periodFactsOf(
    lineId: string,
    tx?: DbTx,
  ): Promise<{ billingCycle: 'MONTHLY' | 'QUARTERLY' | 'ANNUAL' | 'OTHER' | null; invoicedLater: boolean } | null> {
    const row = await (tx ?? this.prisma).subscriptionLine.findUnique({
      where: { id: lineId },
      select: { subscription: { select: { billingCycle: true, invoicedLater: true } } },
    });

    return row ? { billingCycle: row.subscription.billingCycle, invoicedLater: row.subscription.invoicedLater } : null;
  }

  /** Full context of a subscription line needed for seat purchase & correction checks; null when line not found. */
  async findWithPurchaseContext(lineId: string, tx?: DbTx) {
    const row = await (tx ?? this.prisma).subscriptionLine.findUnique({
      where: { id: lineId },
      include: {
        plan: { select: { id: true, name: true, provisioningType: true } },
        subscription: {
          select: {
            id: true,
            organizationId: true,
            workspaceId: true,
            kind: true,
            status: true,
            seatCounting: true,
            allowsMidTermReduction: true,
            commitmentTermMonths: true,
            billingCycle: true,
            invoicedLater: true,
            startDate: true,
            endDate: true,
            renewalDate: true,
            responsibleItAdminEmployeeId: true,
          },
        },
      },
    });
    if (!row) return null;

    return {
      line: toRecord(row),
      plan: { id: row.plan.id, name: row.plan.name, provisioningType: row.plan.provisioningType },
      period: {
        id: row.subscription.id,
        organizationId: row.subscription.organizationId,
        workspaceId: row.subscription.workspaceId,
        kind: row.subscription.kind,
        status: row.subscription.status,
        seatCounting: row.subscription.seatCounting,
        allowsMidTermReduction: row.subscription.allowsMidTermReduction,
        commitmentTermMonths: row.subscription.commitmentTermMonths,
        billingCycle: row.subscription.billingCycle,
        invoicedLater: row.subscription.invoicedLater,
        startDate: row.subscription.startDate ? fromDateColumn(row.subscription.startDate) : null,
        endDate: row.subscription.endDate ? fromDateColumn(row.subscription.endDate) : null,
        renewalDate: row.subscription.renewalDate ? fromDateColumn(row.subscription.renewalDate) : null,
        responsibleItAdminEmployeeId: row.subscription.responsibleItAdminEmployeeId,
      },
    };
  }

  /** Finds a line by `(subscriptionId, planId)` and loads its purchase/period context. */
  async findLineWithPeriodByPlan(subscriptionId: string, planId: string, tx?: DbTx) {
    const found = await this.findOfPlan(subscriptionId, planId, tx);

    return found ? this.findWithPurchaseContext(found.id, tx) : null;
  }

  /** Locks multiple subscription periods (`ORDER BY id FOR UPDATE`, tier 6) in one statement. */
  async lockPeriods(tx: DbTx, subscriptionIds: readonly string[]): Promise<void> {
    const ids = [...new Set(subscriptionIds)].sort();
    if (ids.length === 0) return;
    await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM subscriptions WHERE id = ANY(${ids}::uuid[]) ORDER BY id FOR UPDATE`;
  }

  /** Locks multiple subscription lines (`ORDER BY id FOR UPDATE`, tier 6c) in one statement. */
  async lockMany(tx: DbTx, lineIds: readonly string[]): Promise<SubscriptionLineRecord[]> {
    const ids = [...new Set(lineIds)].sort();
    if (ids.length === 0) return [];
    await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM subscription_lines WHERE id = ANY(${ids}::uuid[]) ORDER BY id FOR UPDATE`;

    return this.ofIds(ids, tx);
  }

  /** Batch read of line ledger opening dates and parent period fallback quantities for `seatsOnDays`. */
  async findManyWithPeriod(
    lineIds: readonly string[],
    tx?: DbTx,
  ): Promise<{ id: string; ledgerOpenedOn: BusinessDate | null; fallbackQuantity: number | null }[]> {
    if (lineIds.length === 0) return [];
    const rows = await (tx ?? this.prisma).subscriptionLine.findMany({
      where: { id: { in: [...lineIds] } },
      select: {
        id: true,
        ledgerOpenedOn: true,
        subscription: { select: { purchasedQuantity: true } },
      },
      orderBy: ORDER,
    });

    return rows.map((row) => ({
      id: row.id,
      ledgerOpenedOn: row.ledgerOpenedOn ? fromDateColumn(row.ledgerOpenedOn) : null,
      fallbackQuantity: row.subscription.purchasedQuantity,
    }));
  }

  /** The lines of these periods in one read, oldest first within a period (the first of a period is the one `subscriptions.plan_id` follows). */
  async ofSubscriptions(subscriptionIds: readonly string[], tx?: DbTx): Promise<Map<string, SubscriptionLineRecord[]>> {
    const byPeriod = new Map<string, SubscriptionLineRecord[]>();
    if (subscriptionIds.length === 0) return byPeriod;
    const rows = await (tx ?? this.prisma).subscriptionLine.findMany({
      where: { subscriptionId: { in: [...subscriptionIds] } },
      orderBy: ORDER,
    });
    for (const row of rows) {
      const lines = byPeriod.get(row.subscriptionId) ?? [];
      lines.push(toRecord(row));
      byPeriod.set(row.subscriptionId, lines);
    }

    return byPeriod;
  }

  /** Maps each `lineId` in `lineIds` to its parent `subscriptionId`. */
  async findLinePeriodIds(lineIds: readonly string[], tx?: DbTx): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    if (lineIds.length === 0) return result;
    const rows = await (tx ?? this.prisma).subscriptionLine.findMany({
      where: { id: { in: [...lineIds] } },
      select: { id: true, subscriptionId: true },
    });
    for (const row of rows) result.set(row.id, row.subscriptionId);

    return result;
  }

  /** Returns lines for the given `lineIds` with their parent `subscriptionId` and `monthlyUnitPriceMinor`. */
  async ofIds(lineIds: readonly string[], tx?: DbTx): Promise<SubscriptionLineRecord[]> {
    if (lineIds.length === 0) return [];
    const rows = await (tx ?? this.prisma).subscriptionLine.findMany({
      where: { id: { in: [...lineIds] } },
      orderBy: ORDER,
    });

    return rows.map(toRecord);
  }

  /** The line of a period for a plan, if it has one. */
  async findOfPlan(subscriptionId: string, planId: string, tx?: DbTx): Promise<SubscriptionLineRecord | null> {
    const row = await (tx ?? this.prisma).subscriptionLine.findUnique({
      where: { subscriptionId_planId: { subscriptionId, planId } },
    });

    return row ? toRecord(row) : null;
  }

  /** The live line (not renewed, ended or removed) of a plan in a workspace: at most one, as the unique index holds. */
  async findLive(workspaceId: string, planId: string, tx?: DbTx): Promise<SubscriptionLineRecord | null> {
    const row = await (tx ?? this.prisma).subscriptionLine.findFirst({
      where: { workspaceId, planId, closedReason: null },
    });

    return row ? toRecord(row) : null;
  }

  /** The line that serves `day` for a plan of a workspace: the one whose last day is not before it, with the ledger of that line. */
  async findServing(
    workspaceId: string,
    planId: string,
    day: BusinessDate,
    tx?: DbTx,
  ): Promise<SubscriptionLineRecord | null> {
    const row = await (tx ?? this.prisma).subscriptionLine.findFirst({
      where: {
        workspaceId,
        planId,
        OR: [{ closedOn: null }, { closedOn: { gte: toDateColumn(day) } }],
        subscription: { startDate: { lte: toDateColumn(day) } },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });

    return row ? toRecord(row) : null;
  }

  /** Writes a line. Throws SubscriptionLineLiveTakenError, SubscriptionLinePlanTakenError or SubscriptionLineMismatchError. */
  async insert(tx: DbTx, input: NewSubscriptionLine): Promise<SubscriptionLineRecord> {
    try {
      const row = await tx.subscriptionLine.create({
        data: {
          organizationId: input.organizationId,
          subscriptionId: input.subscriptionId,
          workspaceId: input.workspaceId,
          planId: input.planId,
          monthlyUnitPriceMinor: input.monthlyUnitPriceMinor,
          minimumSeats: input.minimumSeats ?? null,
          ledgerOpenedOn: input.ledgerOpenedOn ? toDateColumn(input.ledgerOpenedOn) : null,
          renewedFromLineId: input.renewedFromLineId ?? null,
        },
      });

      return toRecord(row);
    } catch (error) {
      throw asLineError(error);
    }
  }

  /** Changes the price or the least seats of a line and moves its version on. */
  async update(tx: DbTx, id: string, changes: SubscriptionLineChanges): Promise<SubscriptionLineRecord> {
    const row = await tx.subscriptionLine.update({
      where: { id },
      data: {
        ...(changes.monthlyUnitPriceMinor === undefined
          ? {}
          : { monthlyUnitPriceMinor: changes.monthlyUnitPriceMinor }),
        ...(changes.minimumSeats === undefined ? {} : { minimumSeats: changes.minimumSeats }),
        updatedAt: new Date(),
      },
    });

    return toRecord(row);
  }

  /** Opens the ledger of a line on `day`, once: false when it was open already (the first day stays). */
  async openLedger(tx: DbTx, id: string, day: BusinessDate): Promise<boolean> {
    const opened = await tx.subscriptionLine.updateMany({
      where: { id, ledgerOpenedOn: null },
      data: { ledgerOpenedOn: toDateColumn(day), updatedAt: new Date() },
    });

    return opened.count === 1;
  }

  /** Ends the service of a line on its last day, once: false when it was closed already. */
  async readPeriodWorkspace(subscriptionId: string, tx?: DbTx): Promise<string | null | undefined> {
    const row = await (tx ?? this.prisma).subscription.findUnique({
      where: { id: subscriptionId },
      select: { workspaceId: true },
    });

    return row ? row.workspaceId : undefined;
  }

  async lockPeriod(tx: DbTx, subscriptionId: string, mode: 'UPDATE' | 'SHARE' = 'UPDATE') {
    const query =
      mode === 'SHARE'
        ? tx.$queryRaw<PeriodLockSqlRow[]>`
            SELECT id, organization_id, workspace_id, kind::text, status::text, start_date, end_date,
                   responsible_it_admin_employee_id, updated_at
              FROM subscriptions WHERE id = ${subscriptionId}::uuid FOR SHARE`
        : tx.$queryRaw<PeriodLockSqlRow[]>`
            SELECT id, organization_id, workspace_id, kind::text, status::text, start_date, end_date,
                   responsible_it_admin_employee_id, updated_at
              FROM subscriptions WHERE id = ${subscriptionId}::uuid FOR UPDATE`;
    const rows = await query;

    return rows[0] ? toPeriodLockRecord(rows[0]) : null;
  }

  async close(tx: DbTx, id: string, closedOn: BusinessDate, reason: SubscriptionLineClosedReason): Promise<boolean> {
    const closed = await tx.subscriptionLine.updateMany({
      where: { id, closedReason: null },
      data: { closedOn: toDateColumn(closedOn), closedReason: reason, updatedAt: new Date() },
    });

    return closed.count === 1;
  }

  /** Bumps `updated_at = now()` inside the caller's transaction so concurrent/subsequent optimistic checks see ledger writes. */
  async touchUpdatedAt(tx: DbTx, id: string): Promise<void> {
    await tx.$executeRaw`UPDATE subscription_lines SET updated_at = now() WHERE id = ${id}::uuid`;
  }
}
