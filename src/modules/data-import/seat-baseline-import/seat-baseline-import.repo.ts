import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import { seatBaselineImportCellsJson } from './seat-baseline-import-cells.json';
import { seatBaselineImportErrorsJson } from './seat-baseline-import-errors.json';
import { seatBaselineImportResultJson } from './seat-baseline-import-result.json';
import { seatBaselineImportSummaryJson } from './seat-baseline-import-summary.json';
import type {
  SeatCells,
  SeatImportResult,
  SeatImportStatus,
  SeatImportSummary,
  SeatRowError,
  SeatRowOutcome,
  StoredSeatRowError,
} from './seat-baseline-import.types';

export interface ImportRecord {
  id: string;
  organizationId: string;
  uploadedBy: string;
  fileName: string;
  contentHash: string;
  planId: string;
  subscriptionId: string | null;
  status: SeatImportStatus;
  previewVersion: number;
  ignoredColumns: string[];
  summary: SeatImportSummary;
  result: SeatImportResult | null;
  confirmKey: string | null;
  createdAt: Date;
  expiresAt: Date;
  confirmedAt: Date | null;
  cancelledAt: Date | null;
}

/** One row of the preview as it is written: only the codes the preview gives now, never one that was retired. */
export interface NewRow {
  lineNumber: number;
  cells: SeatCells;
  outcome: SeatRowOutcome;
  errors: SeatRowError[];
}

/** One row of the preview as it is kept, and as it reads back: an old row may carry a retired code. */
export interface StoredRow {
  lineNumber: number;
  cells: SeatCells;
  outcome: SeatRowOutcome;
  errors: StoredSeatRowError[];
}

type Row = Prisma.SeatBaselineImportGetPayload<object>;

const toRecord = (row: Row): ImportRecord => ({
  id: row.id,
  organizationId: row.organizationId,
  uploadedBy: row.uploadedBy,
  fileName: row.fileName,
  contentHash: row.contentHash,
  planId: row.planId,
  subscriptionId: row.subscriptionId,
  status: row.status,
  previewVersion: row.previewVersion,
  ignoredColumns: row.ignoredColumns,
  summary: seatBaselineImportSummaryJson.decode(row.summary),
  result: seatBaselineImportResultJson.decode(row.result),
  confirmKey: row.confirmKey,
  createdAt: row.createdAt,
  expiresAt: row.expiresAt,
  confirmedAt: row.confirmedAt,
  cancelledAt: row.cancelledAt,
});

const toStoredRow = (row: Prisma.SeatBaselineImportRowGetPayload<object>): StoredRow => ({
  lineNumber: row.lineNumber,
  cells: seatBaselineImportCellsJson.decode(row.cells),
  outcome: row.outcome as SeatRowOutcome,
  errors: seatBaselineImportErrorsJson.decode(row.errors),
});

/** The one writer of `seat_baseline_imports` and `seat_baseline_import_rows`. */
@Injectable()
export class SeatBaselineImportRepo {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    tx: DbTx,
    input: {
      organizationId: string;
      uploadedBy: string;
      fileName: string;
      contentHash: string;
      planId: string;
      subscriptionId: string | null;
      ignoredColumns: string[];
      summary: SeatImportSummary;
      expiresAt: Date;
      rows: readonly NewRow[];
    },
  ): Promise<string> {
    const created = await tx.seatBaselineImport.create({
      data: {
        organizationId: input.organizationId,
        uploadedBy: input.uploadedBy,
        fileName: input.fileName,
        contentHash: input.contentHash,
        planId: input.planId,
        subscriptionId: input.subscriptionId,
        ignoredColumns: input.ignoredColumns,
        summary: seatBaselineImportSummaryJson.encode(input.summary),
        expiresAt: input.expiresAt,
      },
      select: { id: true },
    });
    await tx.seatBaselineImportRow.createMany({
      data: input.rows.map((row) => ({
        importId: created.id,
        lineNumber: row.lineNumber,
        cells: seatBaselineImportCellsJson.encode(row.cells),
        outcome: row.outcome,
        errors: seatBaselineImportErrorsJson.encode(row.errors),
      })),
    });

    return created.id;
  }

  async find(id: string, tx?: DbTx): Promise<ImportRecord | null> {
    const row = await (tx ?? this.prisma).seatBaselineImport.findUnique({ where: { id } });

    return row ? toRecord(row) : null;
  }

  /** The import, locked `FOR UPDATE` for the rest of the transaction, or null. */
  async lock(tx: DbTx, id: string): Promise<ImportRecord | null> {
    const locked = await tx.$queryRaw<
      { id: string }[]
    >`SELECT id FROM seat_baseline_imports WHERE id = ${id}::uuid FOR UPDATE`;
    if (locked.length === 0) return null;

    return this.find(id, tx);
  }

  /** Every row of the import in the order of the file. */
  async rows(tx: DbTx | undefined, importId: string): Promise<StoredRow[]> {
    const rows = await (tx ?? this.prisma).seatBaselineImportRow.findMany({
      where: { importId },
      orderBy: { lineNumber: 'asc' },
    });

    return rows.map(toStoredRow);
  }

  /** One page of rows and the total for the same filter, from one snapshot. */
  async page(
    importId: string,
    filter: { outcome?: SeatRowOutcome; skip: number; take: number },
  ): Promise<{ items: StoredRow[]; total: number }> {
    const where = { importId, ...(filter.outcome ? { outcome: filter.outcome } : {}) };

    return this.prisma.$transaction(
      async (tx) => {
        const rows = await tx.seatBaselineImportRow.findMany({
          where,
          orderBy: { lineNumber: 'asc' },
          skip: filter.skip,
          take: filter.take,
        });

        return {
          items: rows.map(toStoredRow),
          total: await tx.seatBaselineImportRow.count({ where }),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async markCompleted(
    tx: DbTx,
    id: string,
    input: { result: SeatImportResult; confirmKey: string; now: Date },
  ): Promise<void> {
    await tx.seatBaselineImport.update({
      where: { id },
      data: {
        status: 'COMPLETED',
        result: seatBaselineImportResultJson.encode(input.result),
        confirmKey: input.confirmKey,
        confirmedAt: input.now,
      },
    });
  }

  async markCancelled(tx: DbTx, id: string, now: Date): Promise<void> {
    await tx.seatBaselineImport.update({ where: { id }, data: { status: 'CANCELLED', cancelledAt: now } });
  }
}
