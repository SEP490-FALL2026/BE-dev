import type { AuditEventInput, AuditValue } from '../../audit/public/audit.types';
import type { OperatorAuditActor } from '../../licensing/public/licensing.types';

/**
 * The audit event of a change the system made to who holds a step: nobody acted, an event of the organization or a role did,
 * so the actor is the system and the event names where it came from in `correlationId`. With `operator` (the conversion command,
 * `QĐ-93k`) the event is `OPERATOR` instead: no account, the reference of the approval as `operatorReference`, and the context of
 * the command added to what the event says after the change.
 */
export function reassignmentAuditEvent(
  organizationId: string,
  action: string,
  resourceType: string,
  resourceId: string,
  after: { [key: string]: AuditValue },
  correlationId: string,
  before: { [key: string]: AuditValue } | null = null,
  operator?: OperatorAuditActor,
): AuditEventInput {
  if (operator) {
    return {
      organizationId,
      actorKind: 'OPERATOR',
      actorAppUserId: null,
      actorRoles: [],
      action,
      resourceType,
      resourceId,
      before,
      after: operator.context ? { ...after, ...operator.context } : after,
      correlationId,
      operatorReference: operator.ticketRef,
    };
  }

  return {
    organizationId,
    actorKind: 'SYSTEM',
    actorAppUserId: null,
    actorRoles: [],
    action,
    resourceType,
    resourceId,
    before,
    after,
    correlationId,
  };
}

/** Builds the `STEP_NOT_REQUIRED` audit event when a requester becomes head for a queued paid request. */
export function queuedSpendNotRequiredEvent(input: {
  request: { id: string; organizationId: string };
  needStep?: { id: string; assigneeEmployeeId: string | null; waitingReason: string | null; createdAt: Date };
  triggerKind: string;
  correlationId: string;
  operator?: OperatorAuditActor;
}): AuditEventInput {
  const { request, needStep, triggerKind, correlationId, operator } = input;
  const after: { [key: string]: AuditValue } = {
    requestId: request.id,
    stepKind: 'NEED',
    trigger: triggerKind,
    source: correlationId,
    oneStepReason: 'REQUESTER_IS_HEAD',
    requesterBecameHead: true,
  };
  if (needStep) after.stepCreatedAt = needStep.createdAt.toISOString();

  const target = needStep
    ? {
        resourceType: 'ACCESS_REQUEST_STEP',
        resourceId: needStep.id,
        before: { assigneeEmployeeId: needStep.assigneeEmployeeId, waitingReason: needStep.waitingReason },
      }
    : {
        resourceType: 'ACCESS_REQUEST',
        resourceId: request.id,
        before: { assigneeEmployeeId: null, waitingReason: null },
      };

  return reassignmentAuditEvent(
    request.organizationId,
    'ACCESS_REQUEST.STEP_NOT_REQUIRED',
    target.resourceType,
    target.resourceId,
    after,
    correlationId,
    target.before,
    operator,
  );
}

/** Builds the audit event when a waiting step changes its waiting reason or enters waiting under control. */
export function stepWaitingAuditEvent(input: {
  organizationId: string;
  action: 'ACCESS_REQUEST.STEP_WAITING_REASON_CHANGED' | 'ACCESS_REQUEST.STEP_WAITING';
  step: { id: string; kind: string; createdAt: Date };
  requestId: string;
  triggerKind: string;
  waitingReason: string;
  before: { [key: string]: AuditValue };
  correlationId: string;
  requestState?: string;
  operator?: OperatorAuditActor;
}): AuditEventInput {
  const {
    organizationId,
    action,
    step,
    requestId,
    triggerKind,
    waitingReason,
    before,
    correlationId,
    requestState,
    operator,
  } = input;
  const after: { [key: string]: AuditValue } = {
    requestId,
    stepKind: step.kind,
    trigger: triggerKind,
    source: correlationId,
    waitingReason,
    stepCreatedAt: step.createdAt.toISOString(),
  };
  if (requestState) after.requestState = requestState;

  return reassignmentAuditEvent(
    organizationId,
    action,
    'ACCESS_REQUEST_STEP',
    step.id,
    after,
    correlationId,
    before,
    operator,
  );
}
