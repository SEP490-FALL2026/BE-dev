import { Injectable } from '@nestjs/common';
import { fromDateColumn, toDateColumn, type BusinessDate } from '../../../core/business-date';
import type { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { UsageIdentifierType } from '../vendor-source/vendor-source.types';
import { usageImportResultJson } from './vendor-import-result.json';
import { usageImportRowCellsJson } from './vendor-import-row-cells.json';
import { usageImportRowErrorsJson } from './vendor-import-row-errors.json';
import { usageImportSummaryJson } from './vendor-import-summary.json';
import {
  CHUNK_SIZE,
  type CoverageBasis,
  type EventClass,
  type ImportFormat,
  type ImportRecord,
  type ImportResult,
  type ImportSummary,
  type NoticeMode,
  type ActivityBasis,
  type RowOutcome,
  type StoredRow,
} from './vendor-import.types';

type Row = Prisma.UsageImportGetPayload<object>;

const toRecord = (row: Row): ImportRecord => ({
  id: row.id,
  organizationId: row.organizationId,
  sourceId: row.sourceId,
  format: row.format,
  status: row.status,
  coverageFrom: fromDateColumn(row.coverageFrom),
  coverageTo: fromDateColumn(row.coverageTo),
  coverageBasis: row.coverageBasis,
  contentHash: row.contentHash,
  previewVersion: row.previewVersion,
  summary: usageImportSummaryJson.decode(row.summary),
  result: usageImportResultJson.decode(row.result),
  confirmKey: row.confirmKey,
  noticeMode: row.noticeMode,
  noticeAt: row.noticeAt,
  expiresAt: row.expiresAt,
  uploadedByAppUserId: row.uploadedByAppUserId,
  confirmedByAppUserId: row.confirmedByAppUserId,
  createdAt: row.createdAt,
  confirmedAt: row.confirmedAt,
  cancelledAt: row.cancelledAt,
});

const toStoredRow = (row: Prisma.UsageImportRowGetPayload<object>): StoredRow => ({
  lineNumber: row.lineNumber,
  identifierRaw: row.identifierRaw,
  identifierNormalized: row.identifierNormalized,
  cells: usageImportRowCellsJson.decode(row.cells),
  outcome: row.outcome,
  employeeId: row.employeeId,
  matchMethod: row.matchMethod,
  errors: usageImportRowErrorsJson.decode(row.errors),
});

/** One day of a confirmed report as it is written: who it is is read through the mapping in force, never kept here. */
export interface NewDay {
  identifierNormalized: string;
  date: BusinessDate;
  eventClass: EventClass;
  basis: ActivityBasis;
}

/** The one writer of `usage_imports`, `usage_import_rows` and `usage_activity_days`. */
@Injectable()
export class VendorImportRepo {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    tx: DbTx,
    input: {
      organizationId: string;
      sourceId: string;
      format: ImportFormat;
      window: { from: BusinessDate; to: BusinessDate; basis: CoverageBasis };
      contentHash: string;
      summary: ImportSummary;
      expiresAt: Date;
      uploadedByAppUserId: string;
      rows: readonly StoredRow[];
    },
  ): Promise<string> {
    const created = await tx.usageImport.create({
      data: {
        organizationId: input.organizationId,
        sourceId: input.sourceId,
        format: input.format,
        coverageFrom: toDateColumn(input.window.from),
        coverageTo: toDateColumn(input.window.to),
        coverageBasis: input.window.basis,
        contentHash: input.contentHash,
        summary: usageImportSummaryJson.encode(input.summary),
        expiresAt: input.expiresAt,
        uploadedByAppUserId: input.uploadedByAppUserId,
      },
      select: { id: true },
    });
    for (let start = 0; start < input.rows.length; start += CHUNK_SIZE) {
      await this.insertRows(tx, created.id, input.rows.slice(start, start + CHUNK_SIZE));
    }

    return created.id;
  }

  /** Writes a chunk of rows in one statement; the JSON columns go through their codecs and arrive as text. */
  private async insertRows(tx: DbTx, importId: string, rows: readonly StoredRow[]): Promise<void> {
    await tx.$executeRaw`
      INSERT INTO usage_import_rows (import_id, line_number, cells, identifier_raw, identifier_normalized, outcome, employee_id, match_method, errors)
      SELECT ${importId}::uuid, t.line, t.cells::jsonb, t.raw, t.normalized, t.outcome::"UsageRowOutcome", NULLIF(t.employee, '')::uuid,
             NULLIF(t.method, '')::"UsageMatchMethod", t.errors::jsonb
        FROM unnest(${rows.map((row) => row.lineNumber)}::int[], ${rows.map((row) => JSON.stringify(usageImportRowCellsJson.encode(row.cells)))}::text[],
                    ${rows.map((row) => row.identifierRaw)}::text[], ${rows.map((row) => row.identifierNormalized)}::text[],
                    ${rows.map((row) => row.outcome)}::text[], ${rows.map((row) => row.employeeId ?? '')}::text[],
                    ${rows.map((row) => row.matchMethod ?? '')}::text[], ${rows.map((row) => JSON.stringify(usageImportRowErrorsJson.encode(row.errors)))}::text[])
             AS t(line, cells, raw, normalized, outcome, employee, method, errors)`;
  }

  async find(id: string, tx?: DbTx): Promise<ImportRecord | null> {
    const row = await (tx ?? this.prisma).usageImport.findUnique({ where: { id } });

    return row ? toRecord(row) : null;
  }

  /** The import, locked `FOR UPDATE` for the rest of the transaction, or null. */
  async lock(tx: DbTx, id: string): Promise<ImportRecord | null> {
    const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM usage_imports WHERE id = ${id}::uuid FOR UPDATE`;

    return locked.length === 0 ? null : this.find(id, tx);
  }

  async rows(tx: DbTx | undefined, importId: string): Promise<StoredRow[]> {
    const rows = await (tx ?? this.prisma).usageImportRow.findMany({
      where: { importId },
      orderBy: { lineNumber: 'asc' },
    });

    return rows.map(toStoredRow);
  }

  async pageRows(
    importId: string,
    filter: { outcome?: RowOutcome; skip: number; take: number },
  ): Promise<{ items: StoredRow[]; total: number }> {
    const where = { importId, ...(filter.outcome ? { outcome: filter.outcome } : {}) };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.usageImportRow.findMany({
        where,
        orderBy: { lineNumber: 'asc' },
        skip: filter.skip,
        take: filter.take,
      }),
      this.prisma.usageImportRow.count({ where }),
    ]);

    return { items: rows.map(toStoredRow), total };
  }

  /** Whether any import of any source of the application was confirmed: the first one needs the holders to be told. */
  async hasCompletedForApplication(applicationId: string, tx?: DbTx): Promise<boolean> {
    const found = await (tx ?? this.prisma).usageImport.findFirst({
      where: { status: 'COMPLETED', source: { applicationId } },
      select: { id: true },
    });

    return found !== null;
  }

  /** The confirmed imports of the source whose windows meet `[from, to]`, other than `exceptId`. */
  async completedOverlapping(
    tx: DbTx,
    input: { sourceId: string; from: BusinessDate; to: BusinessDate; exceptId: string },
  ): Promise<Array<{ id: string; coverageFrom: BusinessDate; coverageTo: BusinessDate }>> {
    const rows = await tx.usageImport.findMany({
      where: {
        sourceId: input.sourceId,
        status: 'COMPLETED',
        id: { not: input.exceptId },
        coverageFrom: { lte: toDateColumn(input.to) },
        coverageTo: { gte: toDateColumn(input.from) },
      },
      select: { id: true, coverageFrom: true, coverageTo: true },
    });

    return rows.map((row) => ({
      id: row.id,
      coverageFrom: fromDateColumn(row.coverageFrom),
      coverageTo: fromDateColumn(row.coverageTo),
    }));
  }

  /** The day the holders were told, set by the database clock before any day is written (`US-08-05` AC-3). */
  async markNotice(tx: DbTx, id: string, mode: NoticeMode | null): Promise<void> {
    await tx.$executeRaw`UPDATE usage_imports SET notice_at = clock_timestamp(), notice_mode = ${mode}::"UsageNoticeMode" WHERE id = ${id}::uuid`;
  }

  async markCompleted(
    tx: DbTx,
    id: string,
    input: { result: ImportResult; confirmKey: string; confirmedByAppUserId: string; now: Date },
  ): Promise<void> {
    await tx.usageImport.update({
      where: { id },
      data: {
        status: 'COMPLETED',
        result: usageImportResultJson.encode(input.result),
        confirmKey: input.confirmKey,
        confirmedByAppUserId: input.confirmedByAppUserId,
        confirmedAt: input.now,
      },
    });
  }

  async markCancelled(tx: DbTx, id: string, now: Date): Promise<void> {
    await tx.usageImport.update({ where: { id }, data: { status: 'CANCELLED', cancelledAt: now } });
  }

  /** Writes the days in chunks of 5 000; a day already there (the same import, identifier, date and class) is not written twice. */
  async writeDays(
    tx: DbTx,
    input: {
      organizationId: string;
      sourceId: string;
      importId: string;
      applicationId: string;
      identifierType: UsageIdentifierType;
      days: readonly NewDay[];
    },
  ): Promise<number> {
    let written = 0;
    for (let start = 0; start < input.days.length; start += CHUNK_SIZE) {
      const chunk = input.days.slice(start, start + CHUNK_SIZE);
      written += await tx.$executeRaw`
        INSERT INTO usage_activity_days (organization_id, source_id, import_id, application_id, identifier_type, normalized_identifier,
          activity_date, event_class, basis)
        SELECT ${input.organizationId}::uuid, ${input.sourceId}::uuid, ${input.importId}::uuid, ${input.applicationId}::uuid,
               ${input.identifierType}::"UsageIdentifierType", t.normalized, t.day::date, t.class::"UsageEventClass", t.basis::"UsageActivityBasis"
          FROM unnest(${chunk.map((day) => day.identifierNormalized)}::text[], ${chunk.map((day) => day.date)}::text[],
                      ${chunk.map((day) => day.eventClass)}::text[], ${chunk.map((day) => day.basis)}::text[]) AS t(normalized, day, class, basis)
        ON CONFLICT (import_id, identifier_type, normalized_identifier, activity_date, event_class) DO NOTHING`;
    }

    return written;
  }

  /** Marks the days of `loserImportId` that fall in `[from, to]` as given up to `winnerImportId`; returns how many. */
  async supersede(
    tx: DbTx,
    input: { loserImportId: string; winnerImportId: string; from: BusinessDate; to: BusinessDate },
  ): Promise<number> {
    return tx.$executeRaw`
      UPDATE usage_activity_days SET superseded_by_import_id = ${input.winnerImportId}::uuid
       WHERE import_id = ${input.loserImportId}::uuid AND superseded_by_import_id IS NULL
         AND activity_date BETWEEN ${input.from}::date AND ${input.to}::date`;
  }
}
