import type { AuditValue } from '../../audit/public/audit.types';
import type { SubmitBodyDto } from '../access-request/access-request.dto';
import { hasSpendStep } from '../access-request/access-request.policy';
import type { NewAccessRequest } from '../access-request/access-request.types';
import type { Assessment } from '../access-request/request-facts.service';
import type { TransferGraceHolding } from '../public/requests.extension-points';

/** What a request that is sent is made of: who sent it, what they asked for, what it was judged by, and the day. */
export interface SubmittedRequest {
  actor: { employeeId: string; appUserId: string };
  organizationId: string;
  body: Pick<SubmitBodyDto, 'planId' | 'businessReason'>;
  assessed: Pick<Assessment, 'unit' | 'policy' | 'pricing' | 'routing' | 'term'>;
  now: Date;
  /** The draft the request is sent from: its row becomes the request. */
  draftId?: string;
  /** The grace of a transfer in which the person asks again for a right they hold from before it: left out of GH-1/GH-2, and the old right it replaces (`QĐ-110q`, R-49). */
  graceHold?: TransferGraceHolding | null;
}

/** The state the request starts in: pending with the person the table named, or waiting under control when nobody valid exists. */
const startState = (routing: Assessment['routing']): 'PENDING' | 'WAITING_CONTROLLED' =>
  routing.decision.outcome === 'ASSIGNED' ? 'PENDING' : 'WAITING_CONTROLLED';

/** The row of a request that a person sends for themselves, with its first need step (`US-05-02`, `US-05-03`). */
export function newRequestOf(facts: SubmittedRequest): NewAccessRequest {
  const { actor, body, assessed } = facts;
  const { unit, policy, pricing, routing } = assessed;
  const { decision } = routing;
  const assigned = decision.outcome === 'ASSIGNED';

  return {
    organizationId: facts.organizationId,
    branch: policy.branch,
    state: startState(routing),
    planId: body.planId,
    requesterEmployeeId: actor.employeeId,
    beneficiaryEmployeeIds: [actor.employeeId],
    departmentId: unit.departmentId,
    costCenterId: unit.costCenter?.id ?? null,
    businessReason: body.businessReason,
    // The time of use asked for; the end of the seat is worked out from the day it is granted (`QĐ-111i`), so the request carries no end date.
    termMonths: assessed.term.months,
    expectedEndDate: null,
    pricing,
    policy,
    createdByAppUserId: actor.appUserId,
    now: facts.now,
    needStep: {
      state: decision.outcome === 'NOT_REQUIRED' ? 'NOT_REQUIRED' : assigned ? 'PENDING' : 'WAITING',
      assigneeEmployeeId: assigned ? decision.assigneeEmployeeId : null,
      routingRow: decision.row,
      waitingReason: assigned ? null : decision.reason,
      slaWorkingDays: policy.slaWorkingDays,
    },
    draftId: facts.draftId ?? null,
    ...(facts.graceHold
      ? { limitExemption: 'TRANSFER_GRACE' as const, replacesAssignmentId: facts.graceHold.assignmentId }
      : {}),
  };
}

/** What the audit entry `ACCESS_REQUEST.SUBMITTED` says: what was asked, and what the request was judged by. */
export function submittedAuditDetail(facts: SubmittedRequest): { [key: string]: AuditValue } {
  const { actor, body, assessed } = facts;
  const { unit, policy, pricing } = assessed;

  return {
    branch: policy.branch,
    state: startState(assessed.routing),
    planId: body.planId,
    termMonths: assessed.term.months,
    termCutAt: assessed.term.cutAt,
    requesterEmployeeId: actor.employeeId,
    beneficiaryEmployeeIds: [actor.employeeId],
    departmentId: unit.departmentId,
    costCenterId: unit.costCenter?.id ?? null,
    policyVersion: policy.version,
    hasSpendStep: hasSpendStep(policy),
    slaWorkingDays: policy.slaWorkingDays,
    pricingStatus: pricing.status,
    priceSource: pricing.priceSource ?? null,
    amountMinor: pricing.amount?.amountMinor.toString() ?? null,
    amountCurrency: pricing.amount?.currency ?? null,
    budgetYear: pricing.budgetYear,
    // The grace of a transfer (`QĐ-110q`, R-49): the request is left out of GH-1/GH-2 and replaces the right the person holds from before it.
    ...(facts.graceHold
      ? {
          limitExemption: 'TRANSFER_GRACE',
          replacesAssignmentId: facts.graceHold.assignmentId,
          transferId: facts.graceHold.transferId,
        }
      : {}),
  };
}

/** What the audit entry `ACCESS_REQUEST.NEED_STEP_ROUTED` says: who the table named and in which role, or why nobody. */
export function routedAuditDetail(facts: SubmittedRequest, requestId: string): { [key: string]: AuditValue } {
  const { routing, unit } = facts.assessed;
  const { decision } = routing;
  const assigned = decision.outcome === 'ASSIGNED';

  return {
    requestId,
    routingRow: decision.row,
    outcome: decision.outcome,
    assigneeEmployeeId: assigned ? decision.assigneeEmployeeId : null,
    role: assigned ? decision.role : null,
    waitingReason: assigned ? null : decision.reason,
    requesterEmployeeId: facts.actor.employeeId,
    departmentId: unit.departmentId,
    departmentHeadEmployeeId: routing.departmentHeadEmployeeId,
  };
}
