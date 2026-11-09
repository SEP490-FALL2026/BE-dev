import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AccessRequestState } from '../access-request/access-request.types';

export interface SpendDecisionRecord {
  stepId: string;
  requestId: string;
  checkId: string | null;
  decision: 'APPROVED' | 'REJECTED';
  decidedByEmployeeId: string;
  decidedAt: Date;
}

export interface NewSpendDecision {
  organizationId: string;
  requestId: string;
  stepId: string;
  departmentId: string;
  decision: 'APPROVED' | 'REJECTED';
  /** The spending approver: nobody decides in their place any more (`QĐ-93c`). */
  deciderRole: 'SPENDING_APPROVER';
  reason: string | null;
  checkId: string | null;
  decidedByEmployeeId: string;
  decidedAt: Date;
  requestState: AccessRequestState;
}

/**
 * The one writer of what the spending approver decided: the step, the request, the electronic approval record and the
 * snapshot, written together. The record and the snapshot are never changed (`INV-05`).
 */
@Injectable()
export class SpendDecisionRepo {
  constructor(private readonly prisma: PrismaService) {}

  async record(tx: DbTx, input: NewSpendDecision): Promise<void> {
    await tx.accessRequestStep.update({
      where: { id: input.stepId },
      data: { state: input.decision, decidedAt: input.decidedAt },
    });
    await tx.accessRequest.update({ where: { id: input.requestId }, data: { state: input.requestState } });
    await tx.approvalRecord.create({
      data: {
        organizationId: input.organizationId,
        requestId: input.requestId,
        stepId: input.stepId,
        decision: input.decision,
        decidedByEmployeeId: input.decidedByEmployeeId,
        deciderRole: input.deciderRole,
        departmentId: input.departmentId,
        reason: input.reason,
        decidedAt: input.decidedAt,
      },
    });
    await tx.spendDecision.create({
      data: {
        stepId: input.stepId,
        requestId: input.requestId,
        checkId: input.checkId,
        decision: input.decision,
        decidedByEmployeeId: input.decidedByEmployeeId,
        decidedAt: input.decidedAt,
      },
    });
  }

  /** What the approver decided, the newest if the request was decided more than once. */
  async latest(
    requestId: string,
    tx?: DbTx,
  ): Promise<(SpendDecisionRecord & { reason: string | null; bySubstitute: boolean }) | null> {
    const db = tx ?? this.prisma;
    const row = await db.spendDecision.findFirst({
      where: { requestId },
      orderBy: { decidedAt: 'desc' },
      include: { step: { select: { approvalRecord: { select: { reason: true, deciderRole: true } } } } },
    });
    if (!row) return null;
    const { step, ...decision } = row;

    return {
      ...decision,
      reason: step.approvalRecord?.reason ?? null,
      bySubstitute: step.approvalRecord?.deciderRole === 'CONFLICT_SUBSTITUTE',
    };
  }
}
