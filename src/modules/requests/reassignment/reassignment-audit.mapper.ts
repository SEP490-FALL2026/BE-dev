import type { AuditEventInput, AuditValue } from '../../audit/public/audit.types';
import type { OperatorAuditActor } from '../../licensing/public/licensing-handover.types';

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
