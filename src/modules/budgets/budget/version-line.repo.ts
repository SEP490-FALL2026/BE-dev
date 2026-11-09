import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { versionLineZbbJson } from './budget-line-zbb.json';
import type { LineType, ZbbExplanation } from './budget-line-zbb.json';

export interface VersionLineRecord {
  position: number;
  proposalId: string | null;
  proposalPosition: number | null;
  description: string;
  planId: string | null;
  seats: number | null;
  amountMinor: bigint;
  financeComment: string | null;
  adjustmentReason: string | null;
  lineType: LineType;
  zbb: ZbbExplanation | null;
  /** Copied from the proposal line; null for a line Finance added with none. */
  priorityRank: number | null;
}

export interface LinePatch {
  description?: string;
  planId?: string | null;
  seats?: number | null;
  amountMinor?: bigint;
  financeComment?: string | null;
  adjustmentReason?: string | null;
  lineType?: LineType;
  zbb?: ZbbExplanation | null;
  priorityRank?: number | null;
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
  financeComment: row.financeComment,
  adjustmentReason: row.adjustmentReason,
  lineType: row.lineType,
  zbb: versionLineZbbJson.decode(row.zbb),
  priorityRank: row.priorityRank,
});

export const lineData = (line: Omit<VersionLineRecord, 'position'>) => ({
  proposalId: line.proposalId,
  proposalPosition: line.proposalPosition,
  description: line.description,
  planId: line.planId,
  seats: line.seats,
  amountMinor: line.amountMinor,
  financeComment: line.financeComment,
  adjustmentReason: line.adjustmentReason,
  lineType: line.lineType,
  zbb: versionLineZbbJson.encode(line.zbb),
  priorityRank: line.priorityRank,
});

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
        ...(patch.financeComment !== undefined ? { financeComment: patch.financeComment } : {}),
        ...(patch.adjustmentReason !== undefined ? { adjustmentReason: patch.adjustmentReason } : {}),
        ...(patch.lineType !== undefined ? { lineType: patch.lineType } : {}),
        ...(patch.zbb !== undefined ? { zbb: versionLineZbbJson.encode(patch.zbb) } : {}),
        ...(patch.priorityRank !== undefined ? { priorityRank: patch.priorityRank } : {}),
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
}
