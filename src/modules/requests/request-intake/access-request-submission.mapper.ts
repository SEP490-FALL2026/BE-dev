import type { BusinessDate } from '../../../core/business-date';
import type { AuditValue } from '../../audit/public/audit.types';
import type { SubmitBodyDto } from '../access-request/access-request.dto';
import { hasSpendStep } from '../access-request/access-request.policy';
import type { NewAccessRequest } from '../access-request/access-request.types';
import type { Assessment } from '../access-request/request-facts.service';

/** What a request that is sent is made of: who sent it, what they asked for, what it was judged by, and the day. */
export interface SubmittedRequest {
  actor: { employeeId: string; appUserId: string };
  organizationId: string;
  body: Pick<SubmitBodyDto, 'planId' | 'termMonths' | 'businessReason' | 'projectLabel'>;
  assessed: Pick<Assessment, 'unit' | 'policy' | 'pricing' | 'routing'>;
  now: Date;
  /** The day the access ends, when a renewal was sent after the end of the right. */
  expectedEndDate?: BusinessDate;
  /** The draft the request is sent from: its row becomes the request. */
  draftId?: string;
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
    termMonths: body.termMonths,
    projectLabel: body.projectLabel ?? null,
    expectedEndDate: facts.expectedEndDate ?? null,
    pricing,
    policy,
    createdByAppUserId: actor.appUserId,
    now: facts.now,
    needStep: {
      state: assigned ? 'PENDING' : 'WAITING',
      assigneeEmployeeId: assigned ? decision.assigneeEmployeeId : null,
      routingRow: decision.row,
      waitingReason: assigned ? null : decision.reason,
      samePersonAsSpend: assigned && decision.samePersonAsSpend,
      slaWorkingDays: policy.slaWorkingDays,
    },
    draftId: facts.draftId ?? null,
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
    termMonths: body.termMonths,
    requesterEmployeeId: actor.employeeId,
    beneficiaryEmployeeIds: [actor.employeeId],
    departmentId: unit.departmentId,
    costCenterId: unit.costCenter?.id ?? null,
    policyVersion: policy.version,
    hasSpendStep: hasSpendStep(policy),
    slaWorkingDays: policy.slaWorkingDays,
    pricingStatus: pricing.status,
    amountMinor: pricing.amount?.amountMinor.toString() ?? null,
    amountCurrency: pricing.amount?.currency ?? null,
    budgetYear: pricing.budgetYear,
    expectedSpendOn: pricing.expectedSpendOn,
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
    samePersonAsSpend: assigned && decision.samePersonAsSpend,
    requesterEmployeeId: facts.actor.employeeId,
    departmentId: unit.departmentId,
    departmentHeadEmployeeId: routing.departmentHeadEmployeeId,
  };
}
