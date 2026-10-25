import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { LineAmountRecord } from './group-request.types';

export interface NewLineAmount {
  requestId: string;
  employeeId: string;
  budgetYear: number;
  amountMinor: bigint;
  currency: string;
}

/**
 * The one writer of `access_request_line_amounts` (`US-05-17` AC-9, AC-10): the share of each approved person in the commitment of
 * each year. The shares of a year add up to the commitment of the year; giving one back is setting `releasedAt` once.
 */
@Injectable()
export class LineAmountRepo {
  constructor(private readonly prisma: PrismaService) {}

  async insertMany(tx: DbTx, shares: readonly NewLineAmount[]): Promise<void> {
    if (shares.length === 0) return;
    await tx.accessRequestLineAmount.createMany({ data: shares.map((share) => ({ ...share })) });
  }

  /** The shares of a person of the request, the years in order; of everybody when no person is named. */
  async of(
    requestId: string,
    employeeId: string | null,
    tx?: DbTx,
  ): Promise<(LineAmountRecord & { requestId: string })[]> {
    const rows = await (tx ?? this.prisma).accessRequestLineAmount.findMany({
      where: { requestId, ...(employeeId === null ? {} : { employeeId }) },
      orderBy: [{ employeeId: 'asc' }, { budgetYear: 'asc' }],
    });

    return rows.map((row) => ({
      requestId: row.requestId,
      employeeId: row.employeeId,
      budgetYear: row.budgetYear,
      amountMinor: row.amountMinor,
      currency: row.currency,
      releasedAt: row.releasedAt,
    }));
  }

  /** Marks the shares of a person as given back, once: a share already given back is not touched. */
  async markReleased(tx: DbTx, requestId: string, employeeId: string, now: Date): Promise<void> {
    await tx.accessRequestLineAmount.updateMany({
      where: { requestId, employeeId, releasedAt: null },
      data: { releasedAt: now },
    });
  }
}
