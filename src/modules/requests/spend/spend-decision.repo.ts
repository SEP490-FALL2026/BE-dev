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

/** A spend step the spending approver sent back (`QĐ-111ap`): the step closes, the request goes back, and the record of approval says why. */
export interface NewSpendReturn {
  organizationId: string;
  requestId: string;
  stepId: string;
  departmentId: string;
  reason: string;
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

  /** The return of the step: no snapshot and no decision of spend, only the step, the request and the record of approval (never changed). */
  async recordReturn(tx: DbTx, input: NewSpendReturn): Promise<void> {
    await tx.accessRequestStep.update({
      where: { id: input.stepId },
      data: { state: 'CLOSED', decidedAt: input.decidedAt },
    });
    await tx.accessRequest.update({ where: { id: input.requestId }, data: { state: input.requestState } });
    await tx.approvalRecord.create({
      data: {
        organizationId: input.organizationId,
        requestId: input.requestId,
        stepId: input.stepId,
        decision: 'RETURNED',
        decidedByEmployeeId: input.decidedByEmployeeId,
        deciderRole: 'SPENDING_APPROVER',
        departmentId: input.departmentId,
        reason: input.reason,
        decidedAt: input.decidedAt,
      },
    });
  }

  /**
   * What this person decided on the newest spend step of the request (approved, refused or sent back), read from the record of approval of that step; null when the
   * newest step has no record or the record is somebody else's. A batch sent again asks it for a request that has no open step any more.
   */
  async decisionOfLatestStep(
    requestId: string,
    employeeId: string,
    tx?: DbTx,
  ): Promise<'APPROVED' | 'REJECTED' | 'RETURNED' | null> {
    const step = await (tx ?? this.prisma).accessRequestStep.findFirst({
      where: { requestId, kind: 'SPEND_APPROVAL' },
      orderBy: { sequence: 'desc' },
      select: { approvalRecord: { select: { decision: true, decidedByEmployeeId: true } } },
    });
    const record = step?.approvalRecord;

    return record && record.decidedByEmployeeId === employeeId ? record.decision : null;
  }

  /** Timestamp of the newest SPEND_APPROVAL RETURNED approval record for the request, or null if none. */
  async latestSpendReturnAt(requestId: string, tx?: DbTx): Promise<Date | null> {
    const row = await (tx ?? this.prisma).approvalRecord.findFirst({
      where: { requestId, decision: 'RETURNED', step: { kind: 'SPEND_APPROVAL' } },
      orderBy: { decidedAt: 'desc' },
      select: { decidedAt: true },
    });

    return row?.decidedAt ?? null;
  }

  /** What the approver decided, the newest if the request was decided more than once. */
  async latest(requestId: string, tx?: DbTx): Promise<(SpendDecisionRecord & { reason: string | null }) | null> {
    const db = tx ?? this.prisma;
    const row = await db.spendDecision.findFirst({
      where: { requestId },
      orderBy: { decidedAt: 'desc' },
      include: { step: { select: { approvalRecord: { select: { reason: true } } } } },
    });
    if (!row) return null;
    const { step, ...decision } = row;

    if (decision.decision === 'RETURNED') throw new Error('The spend decision of a step is never returned.');

    return {
      ...decision,
      decision: decision.decision,
      reason: step.approvalRecord?.reason ?? null,
    };
  }
}
