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
  /** The proposal this one follows, when the version made from that one was refused and the need changed. */
  successorOfProposalId: string | null;
  /** The proposal that follows this one, if any: at most one. */
  successorProposalId: string | null;
  totalMinor: bigint;
  currency: string;
  submittedByEmployeeId: string;
  submittedAt: Date;
  returnedReason: string | null;
  returnedByEmployeeId: string | null;
  returnedAt: Date | null;
  withdrawnAt: Date | null;
  /** When a successor was sent; null while there is none. */
  succeededAt: Date | null;
  /** When the closure of the year closed it. */
  closedAt: Date | null;
}

export interface NewProposal {
  organizationId: string;
  costCenterId: string;
  year: number;
  previousProposalId: string | null;
  /** Set by the system when this proposal follows a reviewed one whose version was refused; never by a client. */
  successorOfProposalId?: string | null;
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

const WITH_SUCCESSOR = { successor: { select: { id: true } } } as const;

const toRecord = (row: Prisma.BudgetProposalGetPayload<{ include: typeof WITH_SUCCESSOR }>): ProposalRecord => ({
  id: row.id,
  organizationId: row.organizationId,
  costCenterId: row.costCenterId,
  year: row.year,
  state: row.state,
  previousProposalId: row.previousProposalId,
  successorOfProposalId: row.successorOfProposalId,
  successorProposalId: row.successor?.id ?? null,
  totalMinor: row.totalMinor,
  currency: row.currency,
  submittedByEmployeeId: row.submittedByEmployeeId,
  submittedAt: row.submittedAt,
  returnedReason: row.returnedReason,
  returnedByEmployeeId: row.returnedByEmployeeId,
  returnedAt: row.returnedAt,
  withdrawnAt: row.withdrawnAt,
  succeededAt: row.succeededAt,
  closedAt: row.closedAt,
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
        successorOfProposalId: input.successorOfProposalId ?? null,
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
    const row = await (tx ?? this.prisma).budgetProposal.findUnique({ where: { id }, include: WITH_SUCCESSOR });

    return row ? toRecord(row) : null;
  }

  /** Locked `FOR NO KEY UPDATE` until the transaction ends, so a withdrawal and a return of the same proposal queue (no lock that conflicts with a `KEY SHARE` of a foreign key). */
  async lockById(tx: DbTx, id: string): Promise<ProposalRecord | null> {
    const locked = await tx.$queryRaw<
      { id: string }[]
    >`SELECT id FROM budget_proposals WHERE id = ${id}::uuid FOR NO KEY UPDATE`;

    return locked.length === 0 ? null : this.findById(id, tx);
  }

  /**
   * Locks every proposal the Cost Center has for the year, in the order of their ids, and reads them: what the closure of the
   * year changes more than one of. The proposal rows are taken before the version rows (`BudgetYearLockRepo`).
   */
  async lockAllOfYear(tx: DbTx, costCenterId: string, year: number): Promise<ProposalRecord[]> {
    await tx.$queryRaw<
      { id: string }[]
    >`SELECT id FROM budget_proposals WHERE cost_center_id = ${costCenterId}::uuid AND year = ${year} ORDER BY id FOR NO KEY UPDATE`;
    const rows = await tx.budgetProposal.findMany({
      where: { costCenterId, year },
      include: WITH_SUCCESSOR,
      orderBy: { id: 'asc' },
    });

    return rows.map(toRecord);
  }

  /**
   * The proposals Finance gave back that nobody has sent again or withdrawn, of every Cost Center, by id: what waits for the head of
   * a department. There is at most one for each Cost Center and year, so the list is as long as the number of heads with work to send.
   */
  async returned(tx: DbTx): Promise<ProposalRecord[]> {
    const rows = await tx.budgetProposal.findMany({
      where: { state: 'RETURNED' },
      include: WITH_SUCCESSOR,
      orderBy: { id: 'asc' },
    });

    return rows.map(toRecord);
  }

  /** The reviewed proposal of the Cost Center and year that nobody has followed yet, if any: at most one (the open key). */
  async reviewedWithoutSuccessor(costCenterId: string, year: number, tx?: DbTx): Promise<ProposalRecord | null> {
    const row = await (tx ?? this.prisma).budgetProposal.findFirst({
      where: { costCenterId, year, state: 'REVIEWED', succeededAt: null },
      include: WITH_SUCCESSOR,
    });

    return row ? toRecord(row) : null;
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
        include: WITH_SUCCESSOR,
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
      include: WITH_SUCCESSOR,
      orderBy: [{ submittedAt: 'desc' }, { id: 'asc' }],
    });

    return rows.map(toRecord);
  }

  /** The Cost Centers and years before `fiscalYear` that still hold a proposal the closure of the year closes. */
  async endedYearsToClose(fiscalYear: number): Promise<{ costCenterId: string; year: number }[]> {
    return this.prisma.budgetProposal.findMany({
      where: { year: { lt: fiscalYear }, state: { in: ['SUBMITTED', 'RETURNED'] } },
      distinct: ['costCenterId', 'year'],
      select: { costCenterId: true, year: true },
      orderBy: [{ year: 'asc' }, { costCenterId: 'asc' }],
    });
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

  /** The closure of the year closes a proposal that was sent or given back and never used (F62); a return it had stays on it. */
  async setClosed(tx: DbTx, id: string, now: Date): Promise<void> {
    await tx.budgetProposal.update({ where: { id }, data: { state: 'CLOSED_FISCAL_YEAR_ENDED', closedAt: now } });
  }
}
