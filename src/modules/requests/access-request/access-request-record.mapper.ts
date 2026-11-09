import type { Prisma } from '../../../generated/prisma/client';
import { fromDateColumn } from '../../../core/business-date';
import { toPricing } from './access-request-pricing.mapper';
import type { NeedStepState, AccessRequestRecord, ReadableNeedWaitingReason } from './access-request.types';
import { requestPolicyJson } from './access-request.json';

/** What a request is read as: the columns, the people it is for, its need steps with their decisions, and the lines of a group. */
export const SELECT_REQUEST = {
  id: true,
  organizationId: true,
  type: true,
  branch: true,
  state: true,
  planId: true,
  requesterEmployeeId: true,
  departmentId: true,
  costCenterId: true,
  businessReason: true,
  termMonths: true,
  pricingStatus: true,
  priceMissingReason: true,
  priceKind: true,
  expectedSpendOn: true,
  budgetYear: true,
  amountMonths: true,
  amountMinor: true,
  amountCurrency: true,
  unitPriceMinor: true,
  billingCycle: true,
  paymentSchedule: true,
  expectedEndDate: true,
  planLinePosition: true,
  planLineConfirmed: true,
  offPlan: true,
  expectedEndDate: true,
  policy: true,
  submittedAt: true,
  withdrawalRequestedAt: true,
  withdrawnByEmployeeId: true,
  withdrawalReason: true,
  withdrawnAt: true,
  cancelledAt: true,
  cancelledByEmployeeId: true,
  cancelCause: true,
  cancelNote: true,
  serviceAccount: {
    select: {
      purpose: true,
      expectedIdentifier: true,
      responsibleEmployeeId: true,
      boundaryState: true,
      boundaryReason: true,
      boundaryDecidedByEmployeeId: true,
      boundaryDecidedAt: true,
      boundarySelfExecuted: true,
    },
  },
  renewal: {
    select: {
      assignmentId: true,
      previousExpectedEndDate: true,
      newExpectedEndDate: true,
      consecutiveMonths: true,
      successorAssignmentId: true,
      appliedAt: true,
    },
  },
  beneficiaries: { select: { employeeId: true }, orderBy: { position: 'asc' } },
  steps: {
    where: { kind: 'NEED' },
    select: {
      id: true,
      state: true,
      assigneeEmployeeId: true,
      routingRow: true,
      waitingReason: true,
      samePersonAsSpend: true,
      slaWorkingDays: true,
      createdAt: true,
      assignedAt: true,
      decidedAt: true,
      approvalRecord: {
        select: {
          decision: true,
          decidedByEmployeeId: true,
          deciderRole: true,
          reason: true,
          decidedAt: true,
        },
      },
    },
    orderBy: { sequence: 'asc' },
  },
  lines: {
    select: {
      employeeId: true,
      state: true,
      needStepId: true,
      expectedEndDate: true,
      endedAt: true,
      endedByEmployeeId: true,
      endReason: true,
      cancelCause: true,
      withdrawalRequestedAt: true,
      beneficiary: { select: { position: true } },
    },
    orderBy: { beneficiary: { position: 'asc' } },
  },
} satisfies Prisma.AccessRequestSelect;

export type RequestRow = Prisma.AccessRequestGetPayload<{ select: typeof SELECT_REQUEST }>;

/**
 * A request that is read as a request has been sent, so it has the moment it was sent: only a draft has none (the table checks it),
 * and a draft is never read here (`AccessRequestRepo.findById` leaves it out). Its Cost Center is the one it is charged to; a free
 * internal request of a department that has none carries none (the table checks that too).
 */
function sentColumns(row: RequestRow): { costCenterId: string | null; submittedAt: Date } {
  if (row.submittedAt === null) {
    throw new Error(
      `The request ${row.id} has not been sent: it is a draft and is read as one only by the draft operations.`,
    );
  }

  return { costCenterId: row.costCenterId, submittedAt: row.submittedAt };
}

export function toRecord(row: RequestRow): AccessRequestRecord {
  const sent = sentColumns(row);
  const needSteps = row.steps.map((step) => ({
    id: step.id,
    // A need step is only ever held, waiting, approved or refused.
    state: step.state as NeedStepState,
    assigneeEmployeeId: step.assigneeEmployeeId,
    routingRow: step.routingRow,
    waitingReason: step.waitingReason as ReadableNeedWaitingReason | null,
    samePersonAsSpend: step.samePersonAsSpend,
    slaWorkingDays: step.slaWorkingDays,
    createdAt: step.createdAt,
    assignedAt: step.assignedAt,
    decidedAt: step.decidedAt,
    decision: step.approvalRecord,
  }));
  const first = needSteps[0];
  if (!first) throw new Error(`The request ${row.id} has no need step.`);
  const { decision: firstDecision, ...step } = first;

  return {
    id: row.id,
    organizationId: row.organizationId,
    type: row.type,
    branch: row.branch,
    state: row.state,
    planId: row.planId,
    requesterEmployeeId: row.requesterEmployeeId,
    departmentId: row.departmentId,
    costCenterId: sent.costCenterId,
    businessReason: row.businessReason,
    termMonths: row.termMonths ?? 0,
    pricing: toPricing(row),
    planLine:
      row.planLineVersionId !== null && row.planLinePosition !== null
        ? { versionId: row.planLineVersionId, position: row.planLinePosition, confirmed: row.planLineConfirmed }
        : null,
    offPlan: row.offPlan,
    expectedEndDate: row.expectedEndDate ? fromDateColumn(row.expectedEndDate) : null,
    policy: requestPolicyJson.decode(row.policy),
    submittedAt: sent.submittedAt,
    withdrawal:
      row.withdrawalRequestedAt !== null && row.withdrawnByEmployeeId !== null
        ? {
            requestedAt: row.withdrawalRequestedAt,
            requestedByEmployeeId: row.withdrawnByEmployeeId,
            reason: row.withdrawalReason,
            withdrawnAt: row.withdrawnAt,
          }
        : null,
    cancellation:
      row.cancelledAt !== null && row.cancelCause !== null
        ? {
            cancelledAt: row.cancelledAt,
            cancelledByEmployeeId: row.cancelledByEmployeeId,
            cause: row.cancelCause,
            note: row.cancelNote,
          }
        : null,
    serviceAccount: row.serviceAccount,
    renewal:
      row.renewal === null
        ? null
        : {
            assignmentId: row.renewal.assignmentId,
            previousExpectedEndDate: fromDateColumn(row.renewal.previousExpectedEndDate),
            newExpectedEndDate: fromDateColumn(row.renewal.newExpectedEndDate),
            consecutiveMonths: row.renewal.consecutiveMonths,
            successorAssignmentId: row.renewal.successorAssignmentId,
            appliedAt: row.renewal.appliedAt,
          },
    beneficiaryEmployeeIds: row.beneficiaries.map((beneficiary) => beneficiary.employeeId),
    needStep: step,
    needSteps,
    needDecision: firstDecision,
    lines: row.lines.map((line) => ({
      requestId: row.id,
      employeeId: line.employeeId,
      position: line.beneficiary.position,
      state: line.state,
      needStepId: line.needStepId,
      expectedEndDate: line.expectedEndDate ? fromDateColumn(line.expectedEndDate) : null,
      endedAt: line.endedAt,
      endedByEmployeeId: line.endedByEmployeeId,
      endReason: line.endReason,
      cancelCause: line.cancelCause,
      withdrawalRequestedAt: line.withdrawalRequestedAt,
    })),
  };
}
