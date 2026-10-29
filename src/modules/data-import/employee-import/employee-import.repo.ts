import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import { EmployeeColumn, EmployeeRowOutcome, RowDifference, RowIssue } from './employee-import-row.types';

export type ImportStatus = 'PREVIEW' | 'COMPLETED' | 'CANCELLED';

export interface ImportRecord {
  id: string;
  organizationId: string;
  uploadedBy: string;
  fileName: string;
  contentHash: string;
  status: ImportStatus;
  previewVersion: number;
  ignoredColumns: string[];
  summary: unknown;
  result: unknown;
  confirmKey: string | null;
  createdAt: Date;
  expiresAt: Date;
  confirmedAt: Date | null;
  cancelledAt: Date | null;
}

export interface StoredRow {
  lineNumber: number;
  cells: Partial<Record<EmployeeColumn, string>>;
  outcome: EmployeeRowOutcome;
  errors: RowIssue[];
  differences: RowDifference[] | null;
}

const IMPORT_SELECT = {
  id: true,
  organizationId: true,
  uploadedBy: true,
  fileName: true,
  contentHash: true,
  status: true,
  previewVersion: true,
  ignoredColumns: true,
  summary: true,
  result: true,
  confirmKey: true,
  createdAt: true,
  expiresAt: true,
  confirmedAt: true,
  cancelledAt: true,
} as const;

/** Owns EmployeeImport and EmployeeImportRow (US-02-01). */
@Injectable()
export class EmployeeImportRepo {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    tx: DbTx,
    input: {
      organizationId: string;
      uploadedBy: string;
      fileName: string;
      contentHash: string;
      ignoredColumns: string[];
      summary: unknown;
      expiresAt: Date;
      rows: StoredRow[];
    },
  ): Promise<string> {
    const created = await tx.employeeImport.create({
      data: {
        organizationId: input.organizationId,
        uploadedBy: input.uploadedBy,
        fileName: input.fileName,
        contentHash: input.contentHash,
        ignoredColumns: input.ignoredColumns,
        summary: input.summary as Prisma.InputJsonValue,
        expiresAt: input.expiresAt,
      },
      select: { id: true },
    });
    await this.insertRows(tx, created.id, input.rows);

    return created.id;
  }

  private async insertRows(tx: DbTx, importId: string, rows: StoredRow[]): Promise<void> {
    if (rows.length === 0) return;
    await tx.employeeImportRow.createMany({
      data: rows.map((row) => ({
        importId,
        lineNumber: row.lineNumber,
        cells: row.cells,
        outcome: row.outcome,
        errors: row.errors as unknown as Prisma.InputJsonValue,
        differences: (row.differences ?? undefined) as unknown as Prisma.InputJsonValue | undefined,
      })),
    });
  }

  async find(id: string, tx?: DbTx): Promise<ImportRecord | null> {
    return (tx ?? this.prisma).employeeImport.findUnique({ where: { id }, select: IMPORT_SELECT });
  }

  /** Takes the import's row lock (`FOR UPDATE`) and reads it in a statement of its own. Null when there is none. */
  async lock(tx: DbTx, id: string): Promise<ImportRecord | null> {
    const rows = await tx.$queryRaw<
      { id: string }[]
    >`SELECT id FROM employee_imports WHERE id = ${id}::uuid FOR UPDATE`;
    if (rows.length === 0) return null;

    return this.find(id, tx);
  }

  async rows(tx: DbTx | undefined, importId: string): Promise<StoredRow[]> {
    const rows = await (tx ?? this.prisma).employeeImportRow.findMany({
      where: { importId },
      orderBy: { lineNumber: 'asc' },
    });

    return rows.map(toStoredRow);
  }

  async page(
    importId: string,
    filter: { outcome?: EmployeeRowOutcome; skip: number; take: number },
  ): Promise<{ items: StoredRow[]; total: number }> {
    const where = { importId, ...(filter.outcome ? { outcome: filter.outcome } : {}) };
    const [items, total] = await this.prisma.$transaction(
      [
        this.prisma.employeeImportRow.findMany({
          where,
          orderBy: { lineNumber: 'asc' },
          skip: filter.skip,
          take: filter.take,
        }),
        this.prisma.employeeImportRow.count({ where }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );

    return { items: items.map(toStoredRow), total };
  }

  /** Replaces the preview of an import still in preview: its rows, its summary, and a higher version. */
  async replacePreview(
    tx: DbTx,
    importId: string,
    input: { rows: StoredRow[]; summary: unknown; expiresAt: Date },
  ): Promise<number> {
    await tx.employeeImportRow.deleteMany({ where: { importId } });
    await this.insertRows(tx, importId, input.rows);
    const updated = await tx.employeeImport.update({
      where: { id: importId },
      data: {
        previewVersion: { increment: 1 },
        summary: input.summary as Prisma.InputJsonValue,
        expiresAt: input.expiresAt,
      },
      select: { previewVersion: true },
    });

    return updated.previewVersion;
  }

  async markCompleted(tx: DbTx, id: string, input: { result: unknown; confirmKey: string; now: Date }): Promise<void> {
    await tx.employeeImport.update({
      where: { id },
      data: {
        status: 'COMPLETED',
        result: input.result as Prisma.InputJsonValue,
        confirmKey: input.confirmKey,
        confirmedAt: input.now,
      },
    });
  }

  async markCancelled(tx: DbTx, id: string, now: Date): Promise<void> {
    await tx.employeeImport.update({ where: { id }, data: { status: 'CANCELLED', cancelledAt: now } });
  }

  /** The latest import that was not thrown away, with how many rows were wrong in it; null before the first. */
  async findLatestKept(organizationId: string): Promise<LatestImport | null> {
    const row = await this.prisma.employeeImport.findFirst({
      where: { organizationId, status: { not: 'CANCELLED' } },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      select: { id: true, status: true, createdAt: true, summary: true },
    });
    if (!row) return null;

    return {
      id: row.id,
      status: row.status,
      errorRows: (row.summary as { errors?: number } | null)?.errors ?? 0,
      createdAt: row.createdAt,
    };
  }

  /** The latest completed import of a file with this content, if any (to warn when it comes again). */
  async findCompletedWithContent(
    organizationId: string,
    contentHash: string,
    client?: DbTx,
  ): Promise<{ id: string; fileName: string; confirmedAt: Date } | null> {
    const row = await (client ?? this.prisma).employeeImport.findFirst({
      where: { organizationId, contentHash, status: 'COMPLETED' },
      orderBy: { confirmedAt: 'desc' },
      select: { id: true, fileName: true, confirmedAt: true },
    });

    return row && row.confirmedAt ? { id: row.id, fileName: row.fileName, confirmedAt: row.confirmedAt } : null;
  }
}

export interface LatestImport {
  id: string;
  status: ImportStatus;
  /** Rows the preview of that import judged wrong. */
  errorRows: number;
  createdAt: Date;
}

function toStoredRow(row: {
  lineNumber: number;
  cells: unknown;
  outcome: string;
  errors: unknown;
  differences: unknown;
}): StoredRow {
  return {
    lineNumber: row.lineNumber,
    cells: row.cells as StoredRow['cells'],
    outcome: row.outcome as EmployeeRowOutcome,
    errors: row.errors as RowIssue[],
    differences: (row.differences ?? null) as RowDifference[] | null,
  };
}
