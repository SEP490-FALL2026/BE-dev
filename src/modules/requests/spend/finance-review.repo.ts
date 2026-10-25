import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';

export type ReviewOutcome = 'ASSESSED' | 'RETURNED_TO_HEAD' | 'BUDGET_REVISION_NEEDED' | 'LINE_UPDATED';
export type ReviewDirection = 'RECOMMEND_APPROVE' | 'RECOMMEND_OVERRIDE' | 'RECOMMEND_REJECT';

export interface FinanceReviewRecord {
  stepId: string;
  requestId: string;
  checkId: string;
  outcome: ReviewOutcome;
  opinion: string | null;
  direction: ReviewDirection | null;
  reason: string | null;
  decidedByEmployeeId: string;
  decidedAt: Date;
}

/** The one writer of `request_finance_reviews`, which the database keeps append-only (`INV-05`), and its reads. */
@Injectable()
export class FinanceReviewRepo {
  constructor(private readonly prisma: PrismaService) {}

  async insert(tx: DbTx, input: FinanceReviewRecord): Promise<void> {
    await tx.requestFinanceReview.create({ data: input });
  }

  /** The way the newest review of the request ended, if one has. */
  async latest(requestId: string, tx?: DbTx): Promise<FinanceReviewRecord | null> {
    return (tx ?? this.prisma).requestFinanceReview.findFirst({
      where: { requestId },
      orderBy: { decidedAt: 'desc' },
    });
  }

  /** The way the newest review of each of the requests ended, in one read. */
  async latestOf(requestIds: readonly string[]): Promise<Map<string, FinanceReviewRecord>> {
    if (requestIds.length === 0) return new Map();
    const rows = await this.prisma.requestFinanceReview.findMany({
      where: { requestId: { in: [...requestIds] } },
      orderBy: [{ requestId: 'asc' }, { decidedAt: 'desc' }],
      distinct: ['requestId'],
    });

    return new Map(rows.map((row) => [row.requestId, row]));
  }

  async ofStep(stepId: string, tx?: DbTx): Promise<FinanceReviewRecord | null> {
    return (tx ?? this.prisma).requestFinanceReview.findUnique({ where: { stepId } });
  }
}
