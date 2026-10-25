import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client';
import { fromDateColumn, toDateColumn, type BusinessDate } from '../../../core/business-date';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { RepeatCycle } from './budget.policy';

export interface VersionLineRecord {
  position: number;
  proposalId: string | null;
  proposalPosition: number | null;
  description: string;
  planId: string | null;
  seats: number | null;
  amountMinor: bigint;
  windowFrom: BusinessDate;
  windowTo: BusinessDate;
  servicePeriodMonths: number;
  repeatCycle: RepeatCycle;
  quoteValidUntil: BusinessDate | null;
  financeComment: string | null;
  adjustmentReason: string | null;
}

export interface LinePatch {
  description?: string;
  planId?: string | null;
  seats?: number | null;
  amountMinor?: bigint;
  windowFrom?: BusinessDate;
  windowTo?: BusinessDate;
  servicePeriodMonths?: number;
  repeatCycle?: RepeatCycle;
  quoteValidUntil?: BusinessDate | null;
  financeComment?: string | null;
  adjustmentReason?: string | null;
}

type LineRow = Prisma.BudgetVersionLineGetPayload<object>;

const toLine = (row: LineRow): VersionLineRecord => ({
  position: row.position,
  proposalId: row.proposalId,
  proposalPosition: row.proposalPosition,
  description: row.description,
  planId: row.planId,
  seats: row.seats,
  amountMinor: row.amountMinor,
  windowFrom: fromDateColumn(row.windowFrom),
  windowTo: fromDateColumn(row.windowTo),
  servicePeriodMonths: row.servicePeriodMonths,
  repeatCycle: row.repeatCycle,
  quoteValidUntil: row.quoteValidUntil ? fromDateColumn(row.quoteValidUntil) : null,
  financeComment: row.financeComment,
  adjustmentReason: row.adjustmentReason,
});

export const lineData = (line: Omit<VersionLineRecord, 'position'>) => ({
  proposalId: line.proposalId,
  proposalPosition: line.proposalPosition,
  description: line.description,
  planId: line.planId,
  seats: line.seats,
  amountMinor: line.amountMinor,
  windowFrom: toDateColumn(line.windowFrom),
  windowTo: toDateColumn(line.windowTo),
  servicePeriodMonths: line.servicePeriodMonths,
  repeatCycle: line.repeatCycle,
  quoteValidUntil: line.quoteValidUntil ? toDateColumn(line.quoteValidUntil) : null,
  financeComment: line.financeComment,
  adjustmentReason: line.adjustmentReason,
});

export interface LineChangeRecord {
  before: { windowFrom: BusinessDate; windowTo: BusinessDate };
  after: { windowFrom: BusinessDate; windowTo: BusinessDate };
  reason: string;
  changedByEmployeeId: string;
  changedAt: Date;
}

/** The one writer of `budget_version_lines` and the history of their windows, and their reads. */
@Injectable()
export class VersionLineRepo {
  constructor(private readonly prisma: PrismaService) {}

  async allLines(versionId: string, tx?: DbTx): Promise<VersionLineRecord[]> {
    const rows = await (tx ?? this.prisma).budgetVersionLine.findMany({
      where: { versionId },
      orderBy: { position: 'asc' },
    });

    return rows.map(toLine);
  }

  async findLine(versionId: string, position: number, tx?: DbTx): Promise<VersionLineRecord | null> {
    const row = await (tx ?? this.prisma).budgetVersionLine.findUnique({
      where: { versionId_position: { versionId, position } },
    });

    return row ? toLine(row) : null;
  }

  async pageLines(
    versionId: string,
    skip: number,
    take: number,
  ): Promise<{ items: VersionLineRecord[]; total: number }> {
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.budgetVersionLine.findMany({ where: { versionId }, orderBy: { position: 'asc' }, skip, take }),
      this.prisma.budgetVersionLine.count({ where: { versionId } }),
    ]);

    return { items: rows.map(toLine), total };
  }

  async patchLine(tx: DbTx, versionId: string, position: number, patch: LinePatch): Promise<void> {
    await tx.budgetVersionLine.update({
      where: { versionId_position: { versionId, position } },
      data: {
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.planId !== undefined ? { planId: patch.planId } : {}),
        ...(patch.seats !== undefined ? { seats: patch.seats } : {}),
        ...(patch.amountMinor !== undefined ? { amountMinor: patch.amountMinor } : {}),
        ...(patch.windowFrom !== undefined ? { windowFrom: toDateColumn(patch.windowFrom) } : {}),
        ...(patch.windowTo !== undefined ? { windowTo: toDateColumn(patch.windowTo) } : {}),
        ...(patch.servicePeriodMonths !== undefined ? { servicePeriodMonths: patch.servicePeriodMonths } : {}),
        ...(patch.repeatCycle !== undefined ? { repeatCycle: patch.repeatCycle } : {}),
        ...(patch.quoteValidUntil !== undefined
          ? { quoteValidUntil: patch.quoteValidUntil ? toDateColumn(patch.quoteValidUntil) : null }
          : {}),
        ...(patch.financeComment !== undefined ? { financeComment: patch.financeComment } : {}),
        ...(patch.adjustmentReason !== undefined ? { adjustmentReason: patch.adjustmentReason } : {}),
      },
    });
  }

  /** Adds lines after the ones the version has; returns the position of the first. */
  async addLines(tx: DbTx, versionId: string, lines: Omit<VersionLineRecord, 'position'>[]): Promise<number> {
    const last = await tx.budgetVersionLine.aggregate({ where: { versionId }, _max: { position: true } });
    const first = (last._max.position ?? 0) + 1;
    await tx.budgetVersionLine.createMany({
      data: lines.map((line, index) => ({ versionId, position: first + index, ...lineData(line) })),
    });

    return first;
  }

  async addLineChange(
    tx: DbTx,
    change: {
      versionId: string;
      position: number;
      before: { windowFrom: BusinessDate; windowTo: BusinessDate };
      after: { windowFrom: BusinessDate; windowTo: BusinessDate };
      reason: string;
      changedByEmployeeId: string;
      now: Date;
    },
  ): Promise<void> {
    await tx.budgetVersionLineChange.create({
      data: {
        versionId: change.versionId,
        position: change.position,
        windowFromBefore: toDateColumn(change.before.windowFrom),
        windowToBefore: toDateColumn(change.before.windowTo),
        windowFromAfter: toDateColumn(change.after.windowFrom),
        windowToAfter: toDateColumn(change.after.windowTo),
        reason: change.reason,
        changedByEmployeeId: change.changedByEmployeeId,
        changedAt: change.now,
      },
    });
  }

  async pageLineChanges(
    versionId: string,
    position: number,
    skip: number,
    take: number,
  ): Promise<{ items: LineChangeRecord[]; total: number }> {
    const where = { versionId, position };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.budgetVersionLineChange.findMany({
        where,
        orderBy: [{ changedAt: 'desc' }, { id: 'asc' }],
        skip,
        take,
      }),
      this.prisma.budgetVersionLineChange.count({ where }),
    ]);

    return {
      items: rows.map((row) => ({
        before: { windowFrom: fromDateColumn(row.windowFromBefore), windowTo: fromDateColumn(row.windowToBefore) },
        after: { windowFrom: fromDateColumn(row.windowFromAfter), windowTo: fromDateColumn(row.windowToAfter) },
        reason: row.reason,
        changedByEmployeeId: row.changedByEmployeeId,
        changedAt: row.changedAt,
      })),
      total,
    };
  }
}
