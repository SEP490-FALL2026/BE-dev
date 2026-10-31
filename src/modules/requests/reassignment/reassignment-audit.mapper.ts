import type { AuditEventInput, AuditValue } from '../../audit/public/audit.types';

/**
 * The audit event of a change the system made to who holds a step: nobody acted, an event of the organization or a role did,
 * so the actor is the system and the event names where it came from in `correlationId`.
 */
export function reassignmentAuditEvent(
  organizationId: string,
  action: string,
  resourceType: string,
  resourceId: string,
  after: { [key: string]: AuditValue },
  correlationId: string,
  before: { [key: string]: AuditValue } | null = null,
): AuditEventInput {
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
