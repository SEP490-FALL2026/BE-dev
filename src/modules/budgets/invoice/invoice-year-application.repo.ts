import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';

/** What made the application of an invoice to a year: its confirmation, the start of the year, a transfer between Cost Centers, a withdrawal. */
export type InvoiceYearApplicationSource = 'CONFIRMATION' | 'YEAR_START' | 'TRANSFER' | 'WITHDRAWAL';

export interface InvoiceYearApplicationRecord {
  id: string;
  invoiceId: string;
  year: number;
  costCenterId: string;
  commitmentId: string | null;
  source: InvoiceYearApplicationSource;
  /** What was applied to the commitment of the Cost Center and year; signed (a withdrawal or a transfer out is negative). */
  appliedMinor: bigint;
  taxVarianceMinor: bigint;
  createdAt: Date;
}

export interface NewInvoiceYearApplication {
  invoiceId: string;
  year: number;
  costCenterId: string;
  commitmentId?: string | null;
  source: InvoiceYearApplicationSource;
  appliedMinor: bigint;
  taxVarianceMinor?: bigint;
}

type Row = Prisma.InvoiceYearApplicationGetPayload<object>;

const toRecord = (row: Row): InvoiceYearApplicationRecord => ({
  id: row.id,
  invoiceId: row.invoiceId,
  year: row.year,
  costCenterId: row.costCenterId,
  commitmentId: row.commitmentId,
  source: row.source as InvoiceYearApplicationSource,
  appliedMinor: row.appliedMinor,
  taxVarianceMinor: row.taxVarianceMinor,
  createdAt: row.createdAt,
});

/**
 * The one writer of `invoice_year_applications`: what an invoice was applied to a Cost Center for in a year, as rows that are added and never changed
 * (a trigger). The sum by invoice, year and Cost Center is the amount applied, the source of the rule of the pair of invoice and year.
 */
@Injectable()
export class InvoiceYearApplicationRepo {
  constructor(private readonly prisma: PrismaService) {}

  async insert(tx: DbTx, input: NewInvoiceYearApplication): Promise<InvoiceYearApplicationRecord> {
    const row = await tx.invoiceYearApplication.create({
      data: {
        invoiceId: input.invoiceId,
        year: input.year,
        costCenterId: input.costCenterId,
        commitmentId: input.commitmentId ?? null,
        source: input.source,
        appliedMinor: input.appliedMinor,
        taxVarianceMinor: input.taxVarianceMinor ?? 0n,
      },
    });

    return toRecord(row);
  }

  /** The rows of an invoice, oldest first. */
  async ofInvoice(invoiceId: string, tx?: DbTx): Promise<InvoiceYearApplicationRecord[]> {
    const rows = await (tx ?? this.prisma).invoiceYearApplication.findMany({
      where: { invoiceId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });

    return rows.map(toRecord);
  }

  /** All application rows for a batch of invoices, oldest first. */
  async ofInvoices(invoiceIds: readonly string[], tx?: DbTx): Promise<InvoiceYearApplicationRecord[]> {
    if (invoiceIds.length === 0) return [];
    const rows = await (tx ?? this.prisma).invoiceYearApplication.findMany({
      where: { invoiceId: { in: [...new Set(invoiceIds)] } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });

    return rows.map(toRecord);
  }

  /** What an invoice was applied to a Cost Center for in a year, summed over its rows; zero when it was not. */
  async appliedOf(invoiceId: string, year: number, costCenterId: string, tx?: DbTx): Promise<bigint> {
    const sum = await (tx ?? this.prisma).invoiceYearApplication.aggregate({
      where: { invoiceId, year, costCenterId },
      _sum: { appliedMinor: true },
    });

    return sum._sum.appliedMinor ?? 0n;
  }

  /** Total negated `applied_minor` across negative `TRANSFER` rows linked to `commitmentId` (`D-16`). */
  async sumTransferNegativeOfCommitment(tx: DbTx, commitmentId: string): Promise<bigint> {
    const sum = await tx.invoiceYearApplication.aggregate({
      where: { commitmentId, source: 'TRANSFER', appliedMinor: { lt: 0n } },
      _sum: { appliedMinor: true },
    });
    const raw = sum._sum.appliedMinor ?? 0n;

    return raw < 0n ? -raw : 0n;
  }
}
