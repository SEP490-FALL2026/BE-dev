import { Injectable } from '@nestjs/common';
import { fromDateColumn, toDateColumn, type BusinessDate } from '../../../core/business-date';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';

export interface CycleRecord {
  id: string;
  organizationId: string;
  year: number;
  submissionDeadline: BusinessDate;
  decisionDeadline: BusinessDate;
  annualCeilingMinor: bigint;
  /** Null for a cycle written before the reserve was entered with the cycle; counted as nothing. */
  sharedPoolReserveMinor: bigint | null;
  currency: string;
  priorities: string | null;
  /** NULL while the cycle is a draft (`QĐ-111z`). */
  openedByEmployeeId: string | null;
  openedAt: Date | null;
}

export interface NewCycle {
  organizationId: string;
  year: number;
  submissionDeadline: BusinessDate;
  decisionDeadline: BusinessDate;
  annualCeilingMinor: bigint;
  sharedPoolReserveMinor: bigint;
  currency: string;
  priorities: string | null;
}

type Row = NonNullable<Awaited<ReturnType<PrismaService['budgetCycle']['findFirst']>>>;

const toRecord = (row: Row): CycleRecord => ({
  id: row.id,
  organizationId: row.organizationId,
  year: row.year,
  submissionDeadline: fromDateColumn(row.submissionDeadline),
  decisionDeadline: fromDateColumn(row.decisionDeadline),
  annualCeilingMinor: row.annualCeilingMinor,
  sharedPoolReserveMinor: row.sharedPoolReserveMinor,
  currency: row.currency,
  priorities: row.priorities,
  openedByEmployeeId: row.openedByEmployeeId,
  openedAt: row.openedAt,
});

/**
 * The one writer of `budget_cycles` (`QĐ-103i`, `QĐ-111z`). The columns `published_*` and the table `budget_department_ceilings` of the cycles
 * written before are neither read nor written any more (`QĐ-111aa`).
 */
@Injectable()
export class CycleRepo {
  constructor(private readonly prisma: PrismaService) {}

  /** The cycles of this year and the years to come, oldest first: what the deadlines are watched for. */
  async upcomingOf(organizationId: string, fromYear: number, tx?: DbTx): Promise<CycleRecord[]> {
    const rows = await (tx ?? this.prisma).budgetCycle.findMany({
      where: { organizationId, year: { gte: fromYear } },
      orderBy: { year: 'asc' },
    });

    return rows.map(toRecord);
  }

  /** Whether the organization has any cycle at all, whatever the year or the state. */
  async anyExists(organizationId: string, tx?: DbTx): Promise<boolean> {
    return (await (tx ?? this.prisma).budgetCycle.count({ where: { organizationId }, take: 1 })) > 0;
  }

  async findByYear(organizationId: string, year: number, tx?: DbTx): Promise<CycleRecord | null> {
    const row = await (tx ?? this.prisma).budgetCycle.findUnique({
      where: { organizationId_year: { organizationId, year } },
    });

    return row ? toRecord(row) : null;
  }

  /** The cycle of the year with its row locked for the rest of the transaction: `UPDATE` to write it, `SHARE` to read what a write rests on. */
  async lockByYear(
    tx: DbTx,
    organizationId: string,
    year: number,
    mode: 'UPDATE' | 'SHARE',
  ): Promise<CycleRecord | null> {
    const locked =
      mode === 'UPDATE'
        ? await tx.$queryRaw<
            { id: string }[]
          >`SELECT id FROM budget_cycles WHERE organization_id = ${organizationId}::uuid AND year = ${year} FOR UPDATE`
        : await tx.$queryRaw<
            { id: string }[]
          >`SELECT id FROM budget_cycles WHERE organization_id = ${organizationId}::uuid AND year = ${year} FOR SHARE`;
    if (locked.length === 0) return null;

    return this.findByYear(organizationId, year, tx);
  }

  /** One page of the cycles, the latest year first, and how many there are, from one snapshot. */
  async page(organizationId: string, skip: number, take: number): Promise<{ items: CycleRecord[]; total: number }> {
    return this.prisma.$transaction(
      async (tx) => {
        const rows = await tx.budgetCycle.findMany({
          where: { organizationId },
          orderBy: [{ year: 'desc' }, { id: 'asc' }],
          skip,
          take,
        });

        return { items: rows.map(toRecord), total: await tx.budgetCycle.count({ where: { organizationId } }) };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  /** A new cycle is a draft: nobody opened it. */
  async insert(tx: DbTx, input: NewCycle): Promise<CycleRecord> {
    const row = await tx.budgetCycle.create({
      data: {
        organizationId: input.organizationId,
        year: input.year,
        submissionDeadline: toDateColumn(input.submissionDeadline),
        decisionDeadline: toDateColumn(input.decisionDeadline),
        annualCeilingMinor: input.annualCeilingMinor,
        sharedPoolReserveMinor: input.sharedPoolReserveMinor,
        currency: input.currency,
        priorities: input.priorities,
      },
    });

    return toRecord(row);
  }

  /** Changes the deadlines, the priorities, the annual ceiling and the reserve; what the call does not give is left as it is. */
  async update(
    tx: DbTx,
    id: string,
    change: {
      submissionDeadline?: BusinessDate;
      decisionDeadline?: BusinessDate;
      priorities?: string | null;
      annualCeilingMinor?: bigint;
      sharedPoolReserveMinor?: bigint;
    },
  ): Promise<void> {
    await tx.budgetCycle.update({
      where: { id },
      data: {
        ...(change.submissionDeadline ? { submissionDeadline: toDateColumn(change.submissionDeadline) } : {}),
        ...(change.decisionDeadline ? { decisionDeadline: toDateColumn(change.decisionDeadline) } : {}),
        ...(change.priorities !== undefined ? { priorities: change.priorities } : {}),
        ...(change.annualCeilingMinor !== undefined ? { annualCeilingMinor: change.annualCeilingMinor } : {}),
        ...(change.sharedPoolReserveMinor !== undefined
          ? { sharedPoolReserveMinor: change.sharedPoolReserveMinor }
          : {}),
      },
    });
  }

  /** The draft becomes open: when and by whom. */
  async open(tx: DbTx, id: string, by: string, at: Date): Promise<void> {
    await tx.budgetCycle.update({ where: { id }, data: { openedByEmployeeId: by, openedAt: at } });
  }

  async remove(tx: DbTx, id: string): Promise<void> {
    await tx.budgetCycle.delete({ where: { id } });
  }
}
