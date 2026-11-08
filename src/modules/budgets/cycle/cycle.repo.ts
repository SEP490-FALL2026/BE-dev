import { Injectable } from '@nestjs/common';
import { fromDateColumn, toDateColumn, type BusinessDate } from '../../../core/business-date';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { CeilingParts, StoredCeiling } from './cycle.policy';

export interface CycleRecord {
  id: string;
  organizationId: string;
  year: number;
  submissionDeadline: BusinessDate;
  decisionDeadline: BusinessDate;
  annualCeilingMinor: bigint;
  sharedPoolReserveMinor: bigint | null;
  currency: string;
  priorities: string | null;
  openedByEmployeeId: string;
  openedAt: Date;
  publishedByEmployeeId: string | null;
  publishedAt: Date | null;
  firstPublishedAt: Date | null;
  ceilings: StoredCeiling[];
}

export interface NewCycle {
  organizationId: string;
  year: number;
  submissionDeadline: BusinessDate;
  decisionDeadline: BusinessDate;
  annualCeilingMinor: bigint;
  currency: string;
  priorities: string | null;
  openedByEmployeeId: string;
  openedAt: Date;
}

const WITH_CEILINGS = { ceilings: { orderBy: { departmentId: 'asc' as const } } } as const;
type Row = NonNullable<Awaited<ReturnType<PrismaService['budgetCycle']['findFirst']>>> & {
  ceilings: {
    departmentId: string;
    signedCommitmentsMinor: bigint;
    plannedSeatsMinor: bigint;
    priorityMinor: bigint;
    totalMinor: bigint;
    publishedTotalMinor: bigint | null;
  }[];
};

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
  publishedByEmployeeId: row.publishedByEmployeeId,
  publishedAt: row.publishedAt,
  firstPublishedAt: row.firstPublishedAt,
  ceilings: row.ceilings.map((ceiling) => ({
    departmentId: ceiling.departmentId,
    signedCommitmentsMinor: ceiling.signedCommitmentsMinor,
    plannedSeatsMinor: ceiling.plannedSeatsMinor,
    priorityMinor: ceiling.priorityMinor,
    totalMinor: ceiling.totalMinor,
    publishedTotalMinor: ceiling.publishedTotalMinor,
  })),
});

/** The one writer of `budget_cycles` and `budget_department_ceilings` (`QĐ-103i`). */
@Injectable()
export class CycleRepo {
  constructor(private readonly prisma: PrismaService) {}

  async findByYear(organizationId: string, year: number, tx?: DbTx): Promise<CycleRecord | null> {
    const row = await (tx ?? this.prisma).budgetCycle.findUnique({
      where: { organizationId_year: { organizationId, year } },
      include: WITH_CEILINGS,
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

  async list(organizationId: string): Promise<CycleRecord[]> {
    const rows = await this.prisma.budgetCycle.findMany({
      where: { organizationId },
      include: WITH_CEILINGS,
      orderBy: { year: 'desc' },
    });

    return rows.map((row) => toRecord(row));
  }

  async insert(tx: DbTx, input: NewCycle): Promise<CycleRecord> {
    const row = await tx.budgetCycle.create({
      data: {
        organizationId: input.organizationId,
        year: input.year,
        submissionDeadline: toDateColumn(input.submissionDeadline),
        decisionDeadline: toDateColumn(input.decisionDeadline),
        annualCeilingMinor: input.annualCeilingMinor,
        currency: input.currency,
        priorities: input.priorities,
        openedByEmployeeId: input.openedByEmployeeId,
        openedAt: input.openedAt,
      },
      include: WITH_CEILINGS,
    });

    return toRecord(row);
  }

  /** Changes the deadlines, the priorities and the annual ceiling; a change of the ceiling unpublishes the cycle (it is checked again). */
  async update(
    tx: DbTx,
    id: string,
    change: {
      submissionDeadline?: BusinessDate;
      decisionDeadline?: BusinessDate;
      priorities?: string | null;
      annualCeilingMinor?: bigint;
      unpublish: boolean;
    },
  ): Promise<void> {
    await tx.budgetCycle.update({
      where: { id },
      data: {
        ...(change.submissionDeadline ? { submissionDeadline: toDateColumn(change.submissionDeadline) } : {}),
        ...(change.decisionDeadline ? { decisionDeadline: toDateColumn(change.decisionDeadline) } : {}),
        ...(change.priorities !== undefined ? { priorities: change.priorities } : {}),
        ...(change.annualCeilingMinor !== undefined ? { annualCeilingMinor: change.annualCeilingMinor } : {}),
        ...(change.unpublish ? { publishedAt: null, publishedByEmployeeId: null } : {}),
      },
    });
  }

  /** Replaces the division of the ceiling and the reserve; the total each department was told is kept for a department that stays. */
  async replaceCeilings(
    tx: DbTx,
    cycle: CycleRecord,
    reserveMinor: bigint,
    rows: readonly (CeilingParts & { departmentId: string; totalMinor: bigint })[],
  ): Promise<void> {
    const told = new Map(cycle.ceilings.map((ceiling) => [ceiling.departmentId, ceiling.publishedTotalMinor]));
    await tx.budgetDepartmentCeiling.deleteMany({ where: { cycleId: cycle.id } });
    await tx.budgetDepartmentCeiling.createMany({
      data: rows.map((row) => ({
        cycleId: cycle.id,
        departmentId: row.departmentId,
        signedCommitmentsMinor: row.signedCommitmentsMinor,
        plannedSeatsMinor: row.plannedSeatsMinor,
        priorityMinor: row.priorityMinor,
        totalMinor: row.totalMinor,
        publishedTotalMinor: told.get(row.departmentId) ?? null,
      })),
    });
    await tx.budgetCycle.update({
      where: { id: cycle.id },
      data: { sharedPoolReserveMinor: reserveMinor, publishedAt: null, publishedByEmployeeId: null },
    });
  }

  /** Marks the cycle published and records, for every department, the total its head was told. */
  async publish(tx: DbTx, cycle: CycleRecord, by: string, at: Date): Promise<void> {
    await tx.budgetCycle.update({
      where: { id: cycle.id },
      data: { publishedAt: at, publishedByEmployeeId: by, firstPublishedAt: cycle.firstPublishedAt ?? at },
    });
    for (const ceiling of cycle.ceilings) {
      await tx.budgetDepartmentCeiling.update({
        where: { cycleId_departmentId: { cycleId: cycle.id, departmentId: ceiling.departmentId } },
        data: { publishedTotalMinor: ceiling.totalMinor },
      });
    }
  }
}
