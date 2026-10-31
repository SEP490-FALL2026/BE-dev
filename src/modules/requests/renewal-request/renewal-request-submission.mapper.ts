import type { BusinessDate } from '../../../core/business-date';
import type { AuditValue } from '../../audit/public/audit.types';
import { hasSpendStep } from '../access-request/access-request.policy';
import type { NewAccessRequest, NewNeedStep } from '../access-request/access-request.types';
import type { Assessment } from '../access-request/request-facts.service';
import type { RenewalBodyDto } from './renewal-request.dto';

/** The row of the routing table of `US-05-03` for a head who sends for somebody else of the department. */
export const DELEGATED_ROW = 5;

/** What the request that asks to renew a right is made of: who sent it, whose seat it is, what it was judged by, and the day. */
export interface RenewalSubmission {
  actor: { employeeId: string; appUserId: string };
  organizationId: string;
  /** The person who holds the seat and the plan of it. */
  holder: { employeeId: string; planId: string };
  body: Pick<RenewalBodyDto, 'businessReason' | 'projectLabel'>;
  termMonths: number;
  newEnd: BusinessDate;
  /** The head of the department sends it for the holder, so the sending confirms the need. */
  byHead: boolean;
  now: Date;
  assessed: Pick<Assessment, 'unit' | 'policy' | 'pricing' | 'routing'>;
}

/** Pending when the head confirmed the need or the table named somebody; waiting under control when nobody valid exists. */
export const renewalStateOf = (byHead: boolean, tableNamedSomebody: boolean): 'PENDING' | 'WAITING_CONTROLLED' =>
  byHead || tableNamedSomebody ? 'PENDING' : 'WAITING_CONTROLLED';

/** The need step: held by the head who confirms it by sending, or as the routing table gave it. */
function needStepOf(facts: RenewalSubmission): NewNeedStep {
  const { policy, routing } = facts.assessed;
  const { decision } = routing;
  if (facts.byHead) {
    return {
      state: 'PENDING',
      assigneeEmployeeId: facts.actor.employeeId,
      routingRow: DELEGATED_ROW,
      waitingReason: null,
      samePersonAsSpend: false,
      slaWorkingDays: policy.slaWorkingDays,
    };
  }
  const named = decision.outcome === 'ASSIGNED';

  return {
    state: named ? 'PENDING' : 'WAITING',
    assigneeEmployeeId: named ? decision.assigneeEmployeeId : null,
    routingRow: decision.row,
    waitingReason: named ? null : decision.reason,
    samePersonAsSpend: named && decision.samePersonAsSpend,
    slaWorkingDays: policy.slaWorkingDays,
  };
}

/** The row of the request of the kind RENEWAL (`US-05-14`): for the tool and the person who holds the seat, ending on the day asked for. */
export function renewalRequestOf(facts: RenewalSubmission): NewAccessRequest {
  const { actor, holder, body } = facts;
  const { unit, policy, pricing, routing } = facts.assessed;

  return {
    type: 'RENEWAL',
    organizationId: facts.organizationId,
    branch: policy.branch,
    state: renewalStateOf(facts.byHead, routing.decision.outcome === 'ASSIGNED'),
    planId: holder.planId,
    requesterEmployeeId: actor.employeeId,
    beneficiaryEmployeeIds: [holder.employeeId],
    departmentId: unit.departmentId,
    costCenterId: unit.costCenter?.id ?? null,
    businessReason: body.businessReason,
    termMonths: facts.termMonths,
    projectLabel: body.projectLabel ?? null,
    pricing,
    policy,
    expectedEndDate: facts.newEnd,
    createdByAppUserId: actor.appUserId,
    now: facts.now,
    needStep: needStepOf(facts),
  };
}

/** The seat the renewal is for and the ends it moves between. */
export interface RenewedSeat {
  assignmentId: string;
  previousEnd: BusinessDate;
  consecutiveMonths: number;
}

/** What the audit entry `ACCESS_REQUEST.SUBMITTED` says of a renewal: what was asked, the seat, the ends, what it was judged by. */
export function renewalSubmittedDetail(facts: RenewalSubmission, seat: RenewedSeat): { [key: string]: AuditValue } {
  const { actor, holder } = facts;
  const { unit, policy, pricing, routing } = facts.assessed;

  return {
    type: 'RENEWAL',
    branch: policy.branch,
    state: renewalStateOf(facts.byHead, routing.decision.outcome === 'ASSIGNED'),
    planId: holder.planId,
    termMonths: facts.termMonths,
    requesterEmployeeId: actor.employeeId,
    beneficiaryEmployeeIds: [holder.employeeId],
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
    delegated: facts.byHead,
    assignmentId: seat.assignmentId,
    previousExpectedEndDate: seat.previousEnd,
    newExpectedEndDate: facts.newEnd,
    consecutiveMonths: seat.consecutiveMonths,
  };
}

/** What the audit entry `ACCESS_REQUEST.NEED_STEP_ROUTED` says of a renewal: the need confirmed by sending, or who the table named and why not. */
export function renewalRoutedDetail(facts: RenewalSubmission, requestId: string): { [key: string]: AuditValue } {
  const { routing, unit } = facts.assessed;
  const { decision } = routing;
  const base = {
    type: 'RENEWAL',
    requestId,
    requesterEmployeeId: facts.actor.employeeId,
    beneficiaryEmployeeId: facts.holder.employeeId,
    departmentId: unit.departmentId,
    departmentHeadEmployeeId: routing.departmentHeadEmployeeId,
  };
  if (facts.byHead) {
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
  const named = decision.outcome === 'ASSIGNED';

  return {
    ...base,
    routingRow: decision.row,
    outcome: decision.outcome,
    assigneeEmployeeId: named ? decision.assigneeEmployeeId : null,
    role: named ? decision.role : null,
    waitingReason: named ? null : decision.reason,
    samePersonAsSpend: named && decision.samePersonAsSpend,
  };
}
