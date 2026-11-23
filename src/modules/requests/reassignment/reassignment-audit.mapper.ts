import type { AuditEventInput, AuditValue } from '../../audit/public/audit.types';
import type { OperatorAuditActor } from '../../licensing/public/licensing.types';
import { reassignmentAuditEvent } from '../step-routing/step-audit-event.mapper';

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
