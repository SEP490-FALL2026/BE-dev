import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { RequestFacts, StatusFacts } from './request-status.types';

/**
 * What the projection reads of the requests context to judge an event: the request with the people it is for, the decision on a
 * step, the refusal of the IT Admin, the holders of the steps a withdrawal closed. Reads only, in the transaction of the pass, and
 * only of committed data; nothing here writes (`request_status_cursor` has its own repo).
 */
@Injectable()
export class RequestStatusRepo {
  async requestFacts(tx: DbTx, requestId: string): Promise<RequestFacts | null> {
    const row = await tx.accessRequest.findUnique({
      where: { id: requestId },
      select: {
        id: true,
        organizationId: true,
        type: true,
        branch: true,
        requesterEmployeeId: true,
        departmentId: true,
        withdrawnByEmployeeId: true,
        withdrawalReason: true,
        beneficiaries: { select: { employeeId: true }, orderBy: { position: 'asc' } },
      },
    });
    if (!row) return null;

    return {
      id: row.id,
      organizationId: row.organizationId,
      type: row.type,
      branch: row.branch,
      requesterEmployeeId: row.requesterEmployeeId,
      beneficiaryEmployeeIds: row.beneficiaries.map((beneficiary) => beneficiary.employeeId),
      departmentId: row.departmentId,
      withdrawnByEmployeeId: row.withdrawnByEmployeeId,
      withdrawalReason: row.withdrawalReason,
    };
  }

  /** Who decided the step and why, from the record of the decision. */
  async decisionOf(tx: DbTx, stepId: string): Promise<StatusFacts['decision']> {
    const row = await tx.approvalRecord.findUnique({
      where: { stepId },
      select: { decidedByEmployeeId: true, reason: true },
    });

    return row ? { deciderEmployeeId: row.decidedByEmployeeId, reason: row.reason } : null;
  }

  /** The refusal of the IT Admin at the gate of the assessment, and the plan of the catalog recorded as doing the same work. */
  async assessmentOf(
    tx: DbTx,
    requestId: string,
  ): Promise<{ itRejection: StatusFacts['itRejection']; equivalentPlanId: string | null }> {
    const row = await tx.accessRequestAssessment.findUnique({
      where: { requestId },
      select: {
        rejectionKind: true,
        rejectionReason: true,
        alternativePlanId: true,
        alternativeNote: true,
        equivalentPlanId: true,
      },
    });
    const itRejection =
      row !== null && row.rejectionKind !== null && row.rejectionReason !== null
        ? {
            kind: row.rejectionKind,
            reason: row.rejectionReason,
            alternativePlanId: row.alternativePlanId,
            alternativeNote: row.alternativeNote,
          }
        : null;

    return { itRejection, equivalentPlanId: row?.equivalentPlanId ?? null };
  }

  /** The homepage the person declared when they proposed software that was not in the catalog; null for any other request. */
  async homepageOf(tx: DbTx, requestId: string): Promise<string | null> {
    const row = await tx.accessRequestProposal.findUnique({ where: { requestId }, select: { homepageUrl: true } });

    return row?.homepageUrl ?? null;
  }

  /** The holders of the steps that were closed when the request was withdrawn (they were decided at the moment of the withdrawal). */
  async closedStepHolders(tx: DbTx, requestId: string): Promise<StatusFacts['closedStepHolders']> {
    const request = await tx.accessRequest.findUnique({ where: { id: requestId }, select: { withdrawnAt: true } });
    if (request?.withdrawnAt == null) return [];
    const steps = await tx.accessRequestStep.findMany({
      where: { requestId, state: 'CLOSED', decidedAt: request.withdrawnAt, assigneeEmployeeId: { not: null } },
      orderBy: { sequence: 'asc' },
      select: { kind: true, assigneeEmployeeId: true },
    });

    return steps.flatMap((step) =>
      step.assigneeEmployeeId === null ? [] : [{ kind: step.kind, employeeId: step.assigneeEmployeeId }],
    );
  }

  /** Who holds the assessment step of the request now; null when it has none or nobody holds it. */
  async assessmentHolderOf(tx: DbTx, requestId: string): Promise<string | null> {
    const step = await tx.accessRequestStep.findFirst({
      where: { requestId, kind: 'IT_ASSESSMENT', state: { in: ['PENDING', 'WAITING'] } },
      orderBy: { sequence: 'desc' },
      select: { assigneeEmployeeId: true },
    });

    return step?.assigneeEmployeeId ?? null;
  }

  /** What the IT Admin wrote when they refused the boundary of a service account. */
  async serviceAccountOf(tx: DbTx, requestId: string): Promise<StatusFacts['serviceAccount']> {
    const row = await tx.accessRequestServiceAccount.findUnique({
      where: { requestId },
      select: { boundaryReason: true },
    });

    return row ? { boundaryReason: row.boundaryReason } : null;
  }

  /** Who approved the spend of the request; null when it had no spend step or none was approved. */
  async spendDeciderOf(tx: DbTx, requestId: string): Promise<string | null> {
    const row = await tx.spendDecision.findFirst({
      where: { requestId, decision: 'APPROVED' },
      orderBy: { decidedAt: 'desc' },
      select: { decidedByEmployeeId: true },
    });

    return row?.decidedByEmployeeId ?? null;
  }

  async returnRequestOf(tx: DbTx, returnRequestId: string): Promise<StatusFacts['returnRequest']> {
    const row = await tx.returnRequest.findUnique({
      where: { id: returnRequestId },
      select: { id: true, requestedByEmployeeId: true, holderEmployeeId: true },
    });

    return row
      ? { id: row.id, requestedByEmployeeId: row.requestedByEmployeeId, holderEmployeeId: row.holderEmployeeId }
      : null;
  }
}
