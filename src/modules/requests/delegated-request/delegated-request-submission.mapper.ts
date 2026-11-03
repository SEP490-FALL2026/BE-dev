import type { AuditValue } from '../../audit/public/audit.types';
import { hasSpendStep } from '../access-request/access-request.policy';
import type { NewAccessRequest, NewNeedStep } from '../access-request/access-request.types';
import type { Assessment } from '../access-request/request-facts.service';
import type { DelegatedBodyDto } from './delegated-request.dto';

/** The row of the routing table of `US-05-03` for a head who sends for somebody else of the department (`AC-6`). */
export const DELEGATED_ROW = 5;

/** What one request of a batch a head sends is made of: the person it is for, the tool, what it was judged by, and the day. */
export interface DelegatedSubmission {
  actor: { employeeId: string; appUserId: string };
  organizationId: string;
  beneficiaryId: string;
  /** The sending confirms the need (everyone but the head's own share, which the approver confirms, `AC-8`). */
  delegated: boolean;
  item: DelegatedBodyDto['items'][number];
  body: Pick<DelegatedBodyDto, 'businessReason' | 'termMonths' | 'expectedEndDate'>;
  batchId: string;
  now: Date;
  assessed: Pick<Assessment, 'unit' | 'policy' | 'pricing' | 'routing'>;
}

/** Pending when the head confirmed the need or the table named somebody; waiting under control when nobody valid exists. */
const startState = (facts: DelegatedSubmission): 'PENDING' | 'WAITING_CONTROLLED' =>
  facts.delegated || facts.assessed.routing.decision.outcome === 'ASSIGNED' ? 'PENDING' : 'WAITING_CONTROLLED';

/** The need step of the request: held by the head who confirms it by sending, or as the routing table gave it. */
function needStepOf(facts: DelegatedSubmission): NewNeedStep {
  const { policy, routing } = facts.assessed;
  const { decision } = routing;
  if (facts.delegated) {
    return {
      state: 'PENDING',
      assigneeEmployeeId: facts.actor.employeeId,
      routingRow: DELEGATED_ROW,
      waitingReason: null,
      samePersonAsSpend: false,
      slaWorkingDays: policy.slaWorkingDays,
    };
  }
  const assigned = decision.outcome === 'ASSIGNED';

  return {
    state: assigned ? 'PENDING' : 'WAITING',
    assigneeEmployeeId: assigned ? decision.assigneeEmployeeId : null,
    routingRow: decision.row,
    waitingReason: assigned ? null : decision.reason,
    samePersonAsSpend: assigned && decision.samePersonAsSpend,
    slaWorkingDays: policy.slaWorkingDays,
  };
}

/** The row of one request of the batch (`US-03-02`): the head asks, the person is the one it is for, the batch is the one sent. */
export function delegatedRequestOf(facts: DelegatedSubmission): NewAccessRequest {
  const { actor, body, item } = facts;
  const { unit, policy, pricing } = facts.assessed;

  return {
    organizationId: facts.organizationId,
    branch: policy.branch,
    state: startState(facts),
    planId: item.planId,
    requesterEmployeeId: actor.employeeId,
    beneficiaryEmployeeIds: [facts.beneficiaryId],
    departmentId: unit.departmentId,
    costCenterId: unit.costCenter?.id ?? null,
    businessReason: body.businessReason,
    termMonths: body.termMonths,
    pricing,
    policy,
    delegatedBatchId: facts.batchId,
    expectedEndDate: facts.delegated ? (body.expectedEndDate ?? null) : null,
    createdByAppUserId: actor.appUserId,
    now: facts.now,
    needStep: needStepOf(facts),
  };
}

/** What the audit entry `ACCESS_REQUEST.SUBMITTED` says: what was asked, for whom, in which batch, and what it was judged by. */
export function delegatedSubmittedDetail(facts: DelegatedSubmission): { [key: string]: AuditValue } {
  const { actor, body, item } = facts;
  const { unit, policy, pricing } = facts.assessed;

  return {
    branch: policy.branch,
    state: startState(facts),
    planId: item.planId,
    termMonths: body.termMonths,
    requesterEmployeeId: actor.employeeId,
    beneficiaryEmployeeIds: [facts.beneficiaryId],
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
    delegated: facts.delegated,
    delegatedBatchId: facts.batchId,
    expectedEndDate: body.expectedEndDate ?? null,
  };
}

/** What the audit entry `ACCESS_REQUEST.NEED_STEP_ROUTED` says: the need confirmed by sending, or who the table named and why not. */
export function delegatedRoutedDetail(facts: DelegatedSubmission, requestId: string): { [key: string]: AuditValue } {
  const { routing, unit } = facts.assessed;
  const { decision } = routing;
  const base = {
    requestId,
    requesterEmployeeId: facts.actor.employeeId,
    beneficiaryEmployeeId: facts.beneficiaryId,
    departmentId: unit.departmentId,
    departmentHeadEmployeeId: routing.departmentHeadEmployeeId,
  };
  if (facts.delegated) {
    return {
      ...base,
      routingRow: DELEGATED_ROW,
      outcome: 'CONFIRMED_BY_SENDING',
      assigneeEmployeeId: facts.actor.employeeId,
      role: 'MANAGER',
      waitingReason: null,
      samePersonAsSpend: false,
    };
  }
  const assigned = decision.outcome === 'ASSIGNED';

  return {
    ...base,
    routingRow: decision.row,
    outcome: decision.outcome,
    assigneeEmployeeId: assigned ? decision.assigneeEmployeeId : null,
    role: assigned ? decision.role : null,
    waitingReason: assigned ? null : decision.reason,
    samePersonAsSpend: assigned && decision.samePersonAsSpend,
  };
}
