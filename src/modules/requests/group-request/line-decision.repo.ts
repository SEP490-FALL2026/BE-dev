import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { DeciderRole as ReadDeciderRole } from '../access-request/access-request.types';
import type { LineStage } from '../access-request/group-request.types';

export interface NewLineDecision {
  requestId: string;
  employeeId: string;
  stage: LineStage;
  stepId: string;
  decision: 'APPROVED' | 'REJECTED';
  reason: string | null;
  decidedByEmployeeId: string;
  /** What a decision is written with now (`QĐ-93c`): the head or the spending approver, nobody in their place. */
  deciderRole: 'MANAGER' | 'SPENDING_APPROVER';
  decidedAt: Date;
}

/** A decision as it is read: the fallback approver and the substitute for a conflict appear in the history of before `QĐ-93`. */
export type LineDecisionRecord = Omit<NewLineDecision, 'deciderRole'> & { deciderRole: ReadDeciderRole };

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
    const rows = await (tx ?? this.prisma).accessRequestLineDecision.findMany({
      where: { requestId },
      orderBy: [{ employeeId: 'asc' }, { stage: 'asc' }],
    });
    return rows.map((row) => ({ ...row, deciderRole: row.deciderRole === 'MANAGER' ? 'MANAGER' : 'SPENDING_APPROVER' }));
  }
}
