import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client';
import { fromDateColumn, toDateColumn, type BusinessDate } from '../../../core/business-date';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { ProposalState, RepeatCycle } from './budget.policy';

export interface ProposalLineRecord {
  position: number;
  description: string;
  planId: string | null;
  seats: number | null;
  amountMinor: bigint;
  windowFrom: BusinessDate;
  windowTo: BusinessDate;
  servicePeriodMonths: number;
  repeatCycle: RepeatCycle;
  quoteValidUntil: BusinessDate | null;
  note: string | null;
}

export interface ProposalRecord {
  id: string;
  organizationId: string;
  costCenterId: string;
  year: number;
  state: ProposalState;
  previousProposalId: string | null;
  totalMinor: bigint;
  currency: string;
  submittedByEmployeeId: string;
  submittedAt: Date;
  returnedReason: string | null;
  returnedByEmployeeId: string | null;
  returnedAt: Date | null;
  withdrawnAt: Date | null;
}

export interface NewProposal {
  organizationId: string;
  costCenterId: string;
  year: number;
  previousProposalId: string | null;
  currency: string;
  totalMinor: bigint;
  submittedByEmployeeId: string;
  now: Date;
  lines: Omit<ProposalLineRecord, 'position'>[];
}

type LineRow = Prisma.BudgetProposalLineGetPayload<object>;

const toLine = (row: LineRow): ProposalLineRecord => ({
  position: row.position,
  description: row.description,
  planId: row.planId,
  seats: row.seats,
  amountMinor: row.amountMinor,
  windowFrom: fromDateColumn(row.windowFrom),
  windowTo: fromDateColumn(row.windowTo),
  servicePeriodMonths: row.servicePeriodMonths,
  repeatCycle: row.repeatCycle,
  quoteValidUntil: row.quoteValidUntil ? fromDateColumn(row.quoteValidUntil) : null,
  note: row.note,
});

const toRecord = (row: Prisma.BudgetProposalGetPayload<object>): ProposalRecord => ({
  id: row.id,
  organizationId: row.organizationId,
  costCenterId: row.costCenterId,
  year: row.year,
  state: row.state,
  previousProposalId: row.previousProposalId,
  totalMinor: row.totalMinor,
  currency: row.currency,
  submittedByEmployeeId: row.submittedByEmployeeId,
  submittedAt: row.submittedAt,
  returnedReason: row.returnedReason,
  returnedByEmployeeId: row.returnedByEmployeeId,
  returnedAt: row.returnedAt,
  withdrawnAt: row.withdrawnAt,
});

export interface ProposalFilter {
  /** Only these Cost Centers; absent for Finance, who read every proposal. */
  costCenterIds?: readonly string[];
  state?: ProposalState;
  year?: number;
  skip: number;
  take: number;
}

/** The one writer of `budget_proposals` and `budget_proposal_lines`, and their reads. */
@Injectable()
export class ProposalRepo {
  constructor(private readonly prisma: PrismaService) {}

  async insert(tx: DbTx, input: NewProposal): Promise<string> {
    const created = await tx.budgetProposal.create({
      data: {
        organizationId: input.organizationId,
        costCenterId: input.costCenterId,
        year: input.year,
        state: 'SUBMITTED',
        previousProposalId: input.previousProposalId,
        totalMinor: input.totalMinor,
        currency: input.currency,
        submittedByEmployeeId: input.submittedByEmployeeId,
        submittedAt: input.now,
        lines: {
          create: input.lines.map((line, index) => ({
            position: index + 1,
            description: line.description,
            planId: line.planId,
            seats: line.seats,
            amountMinor: line.amountMinor,
            windowFrom: toDateColumn(line.windowFrom),
            windowTo: toDateColumn(line.windowTo),
            servicePeriodMonths: line.servicePeriodMonths,
            repeatCycle: line.repeatCycle,
            quoteValidUntil: line.quoteValidUntil ? toDateColumn(line.quoteValidUntil) : null,
            note: line.note,
          })),
        },
      },
      select: { id: true },
    });

    return created.id;
  }

  async findById(id: string, tx?: DbTx): Promise<ProposalRecord | null> {
    const row = await (tx ?? this.prisma).budgetProposal.findUnique({ where: { id } });

    return row ? toRecord(row) : null;
  }

  /** Locked `FOR UPDATE` until the transaction ends, so a withdrawal and a return of the same proposal queue. */
  async lockById(tx: DbTx, id: string): Promise<ProposalRecord | null> {
    const locked = await tx.$queryRaw<
      { id: string }[]
    >`SELECT id FROM budget_proposals WHERE id = ${id}::uuid FOR UPDATE`;

    return locked.length === 0 ? null : this.findById(id, tx);
  }

  async allLines(proposalId: string, tx?: DbTx): Promise<ProposalLineRecord[]> {
    const rows = await (tx ?? this.prisma).budgetProposalLine.findMany({
      where: { proposalId },
      orderBy: { position: 'asc' },
    });

    return rows.map(toLine);
  }

  async pageLines(
    proposalId: string,
    skip: number,
    take: number,
  ): Promise<{ items: ProposalLineRecord[]; total: number }> {
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.budgetProposalLine.findMany({ where: { proposalId }, orderBy: { position: 'asc' }, skip, take }),
      this.prisma.budgetProposalLine.count({ where: { proposalId } }),
    ]);

    return { items: rows.map(toLine), total };
  }

  async page(filter: ProposalFilter): Promise<{ items: ProposalRecord[]; total: number }> {
    const where: Prisma.BudgetProposalWhereInput = {
      ...(filter.costCenterIds ? { costCenterId: { in: [...filter.costCenterIds] } } : {}),
      ...(filter.state ? { state: filter.state } : {}),
      ...(filter.year ? { year: filter.year } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.budgetProposal.findMany({
        where,
        orderBy: [{ submittedAt: 'desc' }, { id: 'asc' }],
        skip: filter.skip,
        take: filter.take,
      }),
      this.prisma.budgetProposal.count({ where }),
    ]);

    return { items: rows.map(toRecord), total };
  }

  /** The proposals of a Cost Center and a year, newest first: the history of what was sent, given back and sent again. */
  async chainOf(costCenterId: string, year: number, tx?: DbTx): Promise<ProposalRecord[]> {
    const rows = await (tx ?? this.prisma).budgetProposal.findMany({
      where: { costCenterId, year },
      orderBy: [{ submittedAt: 'desc' }, { id: 'asc' }],
    });

    return rows.map(toRecord);
  }

  async setWithdrawn(tx: DbTx, id: string, now: Date): Promise<void> {
    await tx.budgetProposal.update({ where: { id }, data: { state: 'WITHDRAWN', withdrawnAt: now } });
  }

  async setReturned(tx: DbTx, id: string, input: { reason: string; byEmployeeId: string; now: Date }): Promise<void> {
    await tx.budgetProposal.update({
      where: { id },
      data: {
        state: 'RETURNED',
        returnedReason: input.reason,
        returnedByEmployeeId: input.byEmployeeId,
        returnedAt: input.now,
      },
    });
  }

  async setReviewed(tx: DbTx, id: string): Promise<void> {
    await tx.budgetProposal.update({ where: { id }, data: { state: 'REVIEWED' } });
  }
}
