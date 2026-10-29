import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../generated/prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import type { VersionStateName } from '../budget.policy';

export type HistoryKind = 'FIGURES_UPDATED' | 'LINE_UPDATED' | 'LINES_ADDED' | 'LINES_IMPORTED' | 'WINDOW_MOVED';

export interface HistoryEntryRecord {
  seq: number;
  kind: HistoryKind;
  versionState: VersionStateName;
  position: number | null;
  fromPosition: number | null;
  toPosition: number | null;
  lineCount: number | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | unknown[];
  changedByEmployeeId: string;
  changedAt: Date;
}

export interface NewHistoryEntry {
  organizationId: string;
  versionId: string;
  kind: HistoryKind;
  versionState: VersionStateName;
  position?: number;
  fromPosition?: number;
  toPosition?: number;
  lineCount?: number;
  before: Prisma.InputJsonObject | null;
  after: Prisma.InputJsonObject | Prisma.InputJsonArray;
  changedByEmployeeId: string;
  now: Date;
}

/** The one writer of `budget_version_history`, which is only ever appended to, and its reads (F66, spec J.4). */
@Injectable()
export class VersionHistoryRepo {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Appends the entry after the ones the version has, in the transaction of the edit. The number follows from the entries
   * already there, so the caller holds the row lock of the version: no other edit of it writes meanwhile.
   */
  async append(tx: DbTx, entry: NewHistoryEntry): Promise<number> {
    const last = await tx.budgetVersionHistoryEntry.aggregate({
      where: { versionId: entry.versionId },
      _max: { seq: true },
    });
    const seq = (last._max.seq ?? 0) + 1;
    await tx.budgetVersionHistoryEntry.create({
      data: {
        organizationId: entry.organizationId,
        versionId: entry.versionId,
        seq,
        kind: entry.kind,
        versionState: entry.versionState,
        position: entry.position ?? null,
        fromPosition: entry.fromPosition ?? null,
        toPosition: entry.toPosition ?? null,
        lineCount: entry.lineCount ?? null,
        before: entry.before ?? Prisma.DbNull,
        after: entry.after,
        changedByEmployeeId: entry.changedByEmployeeId,
        changedAt: entry.now,
      },
    });

    return seq;
  }

  /** One page of the history of the version, the newest edit first. */
  async page(versionId: string, skip: number, take: number): Promise<{ items: HistoryEntryRecord[]; total: number }> {
    const where = { versionId };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.budgetVersionHistoryEntry.findMany({ where, orderBy: { seq: 'desc' }, skip, take }),
      this.prisma.budgetVersionHistoryEntry.count({ where }),
    ]);

    return {
      total,
      items: rows.map((row) => ({
        seq: row.seq,
        kind: row.kind,
        versionState: row.versionState,
        position: row.position,
        fromPosition: row.fromPosition,
        toPosition: row.toPosition,
        lineCount: row.lineCount,
        before: (row.before as Record<string, unknown> | null) ?? null,
        after: row.after as Record<string, unknown> | unknown[],
        changedByEmployeeId: row.changedByEmployeeId,
        changedAt: row.changedAt,
      })),
    };
  }
}
