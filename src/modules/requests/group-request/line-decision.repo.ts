import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { LineStage } from './group-request.types';

export interface NewLineDecision {
  requestId: string;
  employeeId: string;
  stage: LineStage;
  stepId: string;
  decision: 'APPROVED' | 'REJECTED';
  reason: string | null;
  decidedByEmployeeId: string;
  deciderRole: 'MANAGER' | 'SPENDING_APPROVER' | 'FALLBACK_APPROVER' | 'CONFLICT_SUBSTITUTE';
  decidedAt: Date;
}

export type LineDecisionRecord = NewLineDecision;

/** The one writer of `access_request_line_decisions` (`US-05-17` AC-4, AC-9): what was decided for a person at a stage, never changed. */
@Injectable()
export class LineDecisionRepo {
  constructor(private readonly prisma: PrismaService) {}

  async insertMany(tx: DbTx, decisions: readonly NewLineDecision[]): Promise<void> {
    if (decisions.length === 0) return;
    await tx.accessRequestLineDecision.createMany({ data: decisions.map((decision) => ({ ...decision })) });
  }

  /** The decisions taken for the people of a request, at most one for each person and stage. */
  async of(requestId: string, tx?: DbTx): Promise<LineDecisionRecord[]> {
    return (tx ?? this.prisma).accessRequestLineDecision.findMany({
      where: { requestId },
      orderBy: [{ employeeId: 'asc' }, { stage: 'asc' }],
    });
  }
}
