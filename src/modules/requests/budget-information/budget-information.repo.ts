import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';

export type BudgetInformationState = 'OPEN' | 'ANSWERED' | 'CLOSED';
export type BudgetInformationAnswer = 'WITHIN_LIMIT' | 'OVER_LIMIT' | 'NO_BUDGET';
export type BudgetInformationCloseReason = 'REQUEST_WITHDRAWN' | 'REQUEST_CANCELLED' | 'STEP_CLOSED';

export interface BudgetInformationRecord {
  id: string;
  requestId: string;
  stepId: string;
  askedByEmployeeId: string;
  question: string;
  askedAt: Date;
  state: BudgetInformationState;
  answer: BudgetInformationAnswer | null;
  answerNote: string | null;
  answeredByEmployeeId: string | null;
  answeredAt: Date | null;
  closedAt: Date | null;
  closeReason: BudgetInformationCloseReason | null;
}

/**
 * The questions of the spending approver to Finance in `budget_information_requests`. A question is written open and ends
 * once, answered or closed, and the database refuses any other change (`INV-05`).
 */
@Injectable()
export class BudgetInformationRepo {
  constructor(private readonly prisma: PrismaService) {}

  async insert(
    tx: DbTx,
    input: { requestId: string; stepId: string; askedByEmployeeId: string; question: string; askedAt: Date },
  ): Promise<BudgetInformationRecord> {
    return await tx.budgetInformationRequest.create({ data: input });
  }

  async findById(tx: DbTx, id: string): Promise<BudgetInformationRecord | null> {
    return await tx.budgetInformationRequest.findUnique({ where: { id } });
  }

  /** The question, with its row locked so that two answers queue and the second finds it ended. */
  async lockById(tx: DbTx, id: string): Promise<BudgetInformationRecord | null> {
    const rows = await tx.$queryRaw<
      Array<{ id: string }>
    >`SELECT id FROM budget_information_requests WHERE id = ${id}::uuid FOR UPDATE`;
    if (rows.length === 0) return null;

    return await tx.budgetInformationRequest.findUnique({ where: { id } });
  }

  async findOpenOfStep(tx: DbTx, stepId: string): Promise<BudgetInformationRecord | null> {
    return await tx.budgetInformationRequest.findFirst({
      where: { stepId, state: 'OPEN' },
    });
  }

  async answer(
    tx: DbTx,
    id: string,
    input: { answer: BudgetInformationAnswer; note: string | null; answeredByEmployeeId: string; answeredAt: Date },
  ): Promise<BudgetInformationRecord> {
    return await tx.budgetInformationRequest.update({
      where: { id },
      data: {
        state: 'ANSWERED',
        answer: input.answer,
        answerNote: input.note,
        answeredByEmployeeId: input.answeredByEmployeeId,
        answeredAt: input.answeredAt,
      },
    });
  }

  /** Closes the questions of a request that wait, and says how many there were. */
  async closeOpenOfRequest(
    tx: DbTx,
    requestId: string,
    reason: BudgetInformationCloseReason,
    now: Date,
  ): Promise<BudgetInformationRecord[]> {
    const open = (await tx.budgetInformationRequest.findMany({
      where: { requestId, state: 'OPEN' },
    })) as BudgetInformationRecord[];
    for (const question of open) {
      await tx.budgetInformationRequest.update({
        where: { id: question.id },
        data: { state: 'CLOSED', closedAt: now, closeReason: reason },
      });
    }

    return open;
  }

  /** The last thing the request was asked. */
  async latestOfRequest(requestId: string): Promise<BudgetInformationRecord | null> {
    return await this.prisma.budgetInformationRequest.findFirst({
      where: { requestId },
      orderBy: [{ askedAt: 'desc' }, { id: 'desc' }],
    });
  }

  /** The questions of every request that Finance reads, the oldest first, with the request each is about. */
  async page(
    filter: { state?: BudgetInformationState; requestId?: string },
    skip: number,
    take: number,
  ): Promise<{ rows: BudgetInformationRecord[]; total: number }> {
    const where = {
      ...(filter.state ? { state: filter.state } : {}),
      ...(filter.requestId ? { requestId: filter.requestId } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.budgetInformationRequest.findMany({
        where,
        orderBy: [{ askedAt: 'asc' }, { id: 'asc' }],
        skip,
        take,
      }),
      this.prisma.budgetInformationRequest.count({ where }),
    ]);

    return { rows: rows, total };
  }
}
