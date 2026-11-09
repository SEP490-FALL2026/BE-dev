import { Injectable } from '@nestjs/common';
import { fromDateColumn, toDateColumn, type BusinessDate } from '../../../core/business-date';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';

export interface SupplementRecord {
  number: number;
  reason: string;
  changedByEmployeeId: string;
  createdAt: Date;
  beforeExpectedSpendOn: BusinessDate | null;
  afterExpectedSpendOn: BusinessDate | null;
  beforeBudgetYear: number | null;
  afterBudgetYear: number | null;
  beforeAmountMinor: bigint | null;
  afterAmountMinor: bigint | null;
  currency: string | null;
}

export type NewSupplement = Omit<SupplementRecord, 'number' | 'createdAt'> & {
  organizationId: string;
  requestId: string;
  now: Date;
};

/** The one writer of `request_supplements`, which the database keeps append-only (`INV-05`), and its reads. */
@Injectable()
export class SupplementRepo {
  constructor(private readonly prisma: PrismaService) {}

  async insert(tx: DbTx, input: NewSupplement): Promise<SupplementRecord> {
    const last = await tx.requestSupplement.aggregate({
      where: { requestId: input.requestId },
      _max: { number: true },
    });
    const row = await tx.requestSupplement.create({
      data: {
        organizationId: input.organizationId,
        requestId: input.requestId,
        number: (last._max.number ?? 0) + 1,
        reason: input.reason,
        changedByEmployeeId: input.changedByEmployeeId,
        createdAt: input.now,
        beforeExpectedSpendOn: input.beforeExpectedSpendOn ? toDateColumn(input.beforeExpectedSpendOn) : null,
        afterExpectedSpendOn: input.afterExpectedSpendOn ? toDateColumn(input.afterExpectedSpendOn) : null,
        beforeBudgetYear: input.beforeBudgetYear,
        afterBudgetYear: input.afterBudgetYear,
        beforeAmountMinor: input.beforeAmountMinor,
        afterAmountMinor: input.afterAmountMinor,
        currency: input.currency,
      },
    });

    return this.toRecord(row);
  }

  /** One page of the supplements of a request, oldest first. */
  async page(requestId: string, skip: number, take: number): Promise<{ items: SupplementRecord[]; total: number }> {
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.requestSupplement.findMany({ where: { requestId }, orderBy: { number: 'asc' }, skip, take }),
      this.prisma.requestSupplement.count({ where: { requestId } }),
    ]);

    return { items: rows.map((row) => this.toRecord(row)), total };
  }

  private toRecord(row: {
    number: number;
    reason: string;
    changedByEmployeeId: string;
    createdAt: Date;
    beforeExpectedSpendOn: Date | null;
    afterExpectedSpendOn: Date | null;
    beforeBudgetYear: number | null;
    afterBudgetYear: number | null;
    beforeAmountMinor: bigint;
    afterAmountMinor: bigint;
    currency: string | null;
  }): SupplementRecord {
    return {
      number: row.number,
      reason: row.reason,
      changedByEmployeeId: row.changedByEmployeeId,
      createdAt: row.createdAt,
      beforeExpectedSpendOn: row.beforeExpectedSpendOn ? fromDateColumn(row.beforeExpectedSpendOn) : null,
      afterExpectedSpendOn: row.afterExpectedSpendOn ? fromDateColumn(row.afterExpectedSpendOn) : null,
      beforeBudgetYear: row.beforeBudgetYear ?? 0,
      afterBudgetYear: row.afterBudgetYear ?? 0,
      beforeAmountMinor: row.beforeAmountMinor,
      afterAmountMinor: row.afterAmountMinor,
      currency: row.currency ?? 'VND',
    };
  }
}
