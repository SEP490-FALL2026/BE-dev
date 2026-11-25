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
 * The one writer of `subscription_lines`: the lines of a subscription period (W3-15). The lock of a line (tier 6a, `FOR UPDATE`) comes after
 * the lock of its period and before the ledger row it guards; the database holds C1 (one live line per workspace and plan) and C2.
 */
@Injectable()
export class SubscriptionLineRepo {
  constructor(private readonly prisma: PrismaService) {}

  async find(id: string, tx?: DbTx): Promise<SubscriptionLineRecord | null> {
    const row = await (tx ?? this.prisma).subscriptionLine.findUnique({ where: { id } });

    return row ? toRecord(row) : null;
  }

  /** The line with this id, locked for writing (tier 6a); null when it does not exist. */
  async lock(tx: DbTx, id: string): Promise<SubscriptionLineRecord | null> {
    const locked = await tx.$queryRaw<
      { id: string }[]
    >`SELECT id FROM subscription_lines WHERE id = ${id}::uuid FOR UPDATE`;

    return locked.length === 0 ? null : this.find(id, tx);
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
  async close(tx: DbTx, id: string, closedOn: BusinessDate, reason: SubscriptionLineClosedReason): Promise<boolean> {
    const closed = await tx.subscriptionLine.updateMany({
      where: { id, closedReason: null },
      data: { closedOn: toDateColumn(closedOn), closedReason: reason, updatedAt: new Date() },
    });

    return closed.count === 1;
  }
}
