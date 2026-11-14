import { Injectable } from '@nestjs/common';
import { fromDateColumn, toDateColumn, type BusinessDate } from '../../../core/business-date';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { HeldTransfer, SweptRef } from './transfer-grace.types';
import {
  snapshotAfterJson,
  snapshotBeforeJson,
  type TransferSnapshotAfter,
  type TransferSnapshotBefore,
} from './transfer-snapshot.json';

/** The transfer of a person while its grace lasts, with what P8 shows of it. */
export interface TransferInGrace {
  id: string;
  fromDepartmentId: string;
  toDepartmentId: string;
  effectiveOn: BusinessDate;
  graceEndsOn: BusinessDate;
  graceReminderOn: BusinessDate;
  snapshotBefore: TransferSnapshotBefore | null;
}

/**
 * Reads and writes the grace of a transfer that took effect (`QĐ-110p`, P8): the one place the columns `grace_ends_on`, `grace_reminder_on` and
 * `snapshot_before` are written. The table keeps the transfer itself (`TransferRepo`); the guard of the table lets each of these columns be
 * written once, and the statements here ask for a transfer that has none yet, so doing them twice changes nothing.
 */
@Injectable()
export class TransferGraceRepo {
  constructor(private readonly prisma: PrismaService) {}

  /** The transfer that took effect and whose grace has not ended (the last day is still the grace), if the person has one; the latest if more. */
  async findInGraceOf(employeeId: string, today: BusinessDate, tx?: DbTx): Promise<TransferInGrace | null> {
    const row = await (tx ?? this.prisma).departmentTransfer.findFirst({
      where: { employeeId, status: 'EFFECTIVE', closedAt: null, graceEndsOn: { gte: toDateColumn(today) } },
      orderBy: [{ effectiveOn: 'desc' }, { id: 'desc' }],
    });
    if (row === null || row.graceEndsOn === null || row.graceReminderOn === null) return null;

    return {
      id: row.id,
      fromDepartmentId: row.fromDepartmentId,
      toDepartmentId: row.toDepartmentId,
      effectiveOn: fromDateColumn(row.effectiveOn),
      graceEndsOn: fromDateColumn(row.graceEndsOn),
      graceReminderOn: fromDateColumn(row.graceReminderOn),
      snapshotBefore: snapshotBeforeJson.decode(row.snapshotBefore),
    };
  }

  /** Opens the grace of the transfer: its last day and its reminder. False when it has one already, is not effective, or is closed. */
  async claim(tx: DbTx, id: string, grace: { endsOn: BusinessDate; reminderOn: BusinessDate }): Promise<boolean> {
    const { count } = await tx.departmentTransfer.updateMany({
      where: { id, status: 'EFFECTIVE', closedAt: null, graceEndsOn: null },
      data: { graceEndsOn: toDateColumn(grace.endsOn), graceReminderOn: toDateColumn(grace.reminderOn) },
    });

    return count === 1;
  }

  /**
   * Keeps the picture of the rights before, once. False when it has one: the settlement of the day wrote it, or an earlier pass of the sweep
   * did for a transfer that took effect before the grace existed (m-17).
   */
  async keepSnapshot(tx: DbTx, id: string, snapshot: TransferSnapshotBefore): Promise<boolean> {
    const { count } = await tx.departmentTransfer.updateMany({
      where: { id, status: 'EFFECTIVE', snapshotBefore: { equals: Prisma.DbNull } },
      data: { snapshotBefore: snapshotBeforeJson.encode(snapshot) },
    });

    return count === 1;
  }

  /** One page, by id after `afterId`, of the transfers whose person is to be told once more today (`reminded_at` empty, the day of the reminder come, the grace not over). */
  pageReminderDue(today: BusinessDate, page: SweepPage): Promise<SweptRef[]> {
    return this.page(
      {
        remindedAt: null,
        graceReminderOn: { lte: toDateColumn(today) },
        graceEndsOn: { gte: toDateColumn(today) },
      },
      page,
    );
  }

  /** One page of the transfers whose grace is over and that are not closed: the rights are to be taken back, or the transfer closed. */
  pageGraceOver(today: BusinessDate, page: SweepPage): Promise<SweptRef[]> {
    return this.page({ graceEndsOn: { lt: toDateColumn(today) } }, page);
  }

  /** One page of the transfers still in grace that have no picture of the rights: the ones the migration of m-17 gave a grace and nobody told. */
  pageUnannounced(today: BusinessDate, page: SweepPage): Promise<SweptRef[]> {
    return this.page({ graceEndsOn: { gte: toDateColumn(today) }, snapshotBefore: { equals: Prisma.DbNull } }, page);
  }

  /** The transfer held `FOR UPDATE` until the transaction ends (the caller holds the employee first), read after the lock; null when it is gone. */
  async lock(tx: DbTx, id: string): Promise<HeldTransfer | null> {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM department_transfers WHERE id = ${id}::uuid FOR UPDATE`;
    if (locked.length === 0) return null;
    const row = await tx.departmentTransfer.findUnique({ where: { id } });

    return row && toHeld(row);
  }

  /**
   * The transfer of the person that took effect and is not closed, held `FOR UPDATE` until the transaction ends (the caller holds the employee first),
   * the latest if there are more; null when there is none. With `skipLocked` it never waits for a transfer another command holds (null then), which a
   * listener in the transaction of a completion must not do.
   */
  async lockUnclosedOf(
    tx: DbTx,
    employeeId: string,
    options: { skipLocked: boolean } = { skipLocked: false },
  ): Promise<HeldTransfer | null> {
    const locked = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT id FROM department_transfers
       WHERE employee_id = ${employeeId}::uuid AND status = 'EFFECTIVE' AND closed_at IS NULL
       ORDER BY effective_on DESC, id DESC LIMIT 1 FOR UPDATE ${options.skipLocked ? Prisma.sql`SKIP LOCKED` : Prisma.empty}`);
    if (locked.length === 0) return null;
    const row = await tx.departmentTransfer.findUnique({ where: { id: locked[0].id } });

    return row && toHeld(row);
  }

  /**
   * The transfer a departure superseded, held `FOR UPDATE` until the transaction ends (the caller holds the employee first); null when that departure
   * superseded none.
   */
  async lockSupersededBy(tx: DbTx, caseId: string): Promise<HeldTransfer | null> {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM department_transfers WHERE superseded_by_case_id = ${caseId}::uuid FOR UPDATE`;
    if (locked.length === 0) return null;
    const row = await tx.departmentTransfer.findUnique({ where: { id: locked[0].id } });

    return row && toHeld(row);
  }

  /** Whether the person has a transfer after this one (waiting or taken effect, not cancelled): the order the person is read by, `effective_on` then id. */
  async hasNewerThan(tx: DbTx, held: HeldTransfer): Promise<boolean> {
    const rows = await tx.$queryRaw<{ one: number }[]>`
      SELECT 1 AS one FROM department_transfers
       WHERE employee_id = ${held.employeeId}::uuid AND id <> ${held.id}::uuid AND status <> 'CANCELLED'
         AND (effective_on, id) > (${toDateColumn(held.effectiveOn)}::date, ${held.id}::uuid)
       LIMIT 1`;

    return rows.length > 0;
  }

  /**
   * Opens a transfer again that a departure had superseded: the closing and the picture after are undone, nothing else changes (the guard of the table
   * allows exactly this). False when it was not superseded by that case any more.
   */
  async reopen(tx: DbTx, id: string, caseId: string): Promise<boolean> {
    const { count } = await tx.departmentTransfer.updateMany({
      where: { id, status: 'EFFECTIVE', supersededByCaseId: caseId },
      data: {
        closedAt: null,
        closedBySystem: false,
        closedByAppUserId: null,
        supersededByCaseId: null,
        snapshotAfter: Prisma.DbNull,
      },
    });

    return count === 1;
  }

  /**
   * The system closes the transfer, once, with no account (`closed_by_system`) and the picture of what became of the rights; `supersededByCaseId`
   * names the departure that took them over. False when it was closed meanwhile.
   */
  async close(
    tx: DbTx,
    id: string,
    closing: { at: Date; after: TransferSnapshotAfter; supersededByCaseId: string | null },
  ): Promise<boolean> {
    const { count } = await tx.departmentTransfer.updateMany({
      where: { id, status: 'EFFECTIVE', closedAt: null },
      data: {
        closedAt: closing.at,
        closedBySystem: true,
        closedByAppUserId: null,
        snapshotAfter: snapshotAfterJson.encode(closing.after),
        ...(closing.supersededByCaseId === null ? {} : { supersededByCaseId: closing.supersededByCaseId }),
      },
    });

    return count === 1;
  }

  /** The person is told once more: written once, the guard of the table lets `reminded_at` change from empty only. False when it was written. */
  async claimReminder(tx: DbTx, id: string, at: Date): Promise<boolean> {
    const { count } = await tx.departmentTransfer.updateMany({
      where: { id, status: 'EFFECTIVE', closedAt: null, remindedAt: null },
      data: { remindedAt: at },
    });

    return count === 1;
  }

  private async page(where: Prisma.DepartmentTransferWhereInput, page: SweepPage): Promise<SweptRef[]> {
    return this.prisma.departmentTransfer.findMany({
      where: { status: 'EFFECTIVE', closedAt: null, ...where, ...(page.afterId ? { id: { gt: page.afterId } } : {}) },
      orderBy: { id: 'asc' },
      take: page.take,
      select: { id: true, employeeId: true },
    });
  }
}

/** Where a page of the sweep starts and how long it is. */
export interface SweepPage {
  afterId: string | null;
  take: number;
}

const toHeld = (row: Prisma.DepartmentTransferGetPayload<Record<string, never>>): HeldTransfer => ({
  id: row.id,
  organizationId: row.organizationId,
  employeeId: row.employeeId,
  fromDepartmentId: row.fromDepartmentId,
  toDepartmentId: row.toDepartmentId,
  effectiveOn: fromDateColumn(row.effectiveOn),
  status: row.status,
  closed: row.closedAt !== null,
  graceEndsOn: row.graceEndsOn === null ? null : fromDateColumn(row.graceEndsOn),
  graceReminderOn: row.graceReminderOn === null ? null : fromDateColumn(row.graceReminderOn),
  reminded: row.remindedAt !== null,
  snapshotBefore: snapshotBeforeJson.decode(row.snapshotBefore),
});
