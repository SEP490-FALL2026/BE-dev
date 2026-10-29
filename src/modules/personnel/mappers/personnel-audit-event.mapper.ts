import type { AuditEventInput, AuditValue } from '../../audit/public/audit.types';
import type { PersonnelActor } from '../public/personnel.types';

type Snapshot = { [key: string]: AuditValue } | null;

/**
 * The audit event for a change made by `actor`. A person signed in is `USER`, correlated by their session. The controlled procedure
 * is `OPERATOR` (spec L.2): no account, the ticket code as the operator reference, the id of the ticket row as the correlation, and
 * the context of the command (ticket, approver, operator, environment, mode, basis) added to what the event says after the change.
 */
export function personnelAuditEvent(
  actor: PersonnelActor,
  organizationId: string,
  action: string,
  resourceType: string,
  resourceId: string,
  before: Snapshot,
  after: Snapshot,
): AuditEventInput {
  if (actor.kind === 'USER') {
    return {
      organizationId,
      actorKind: 'USER',
      actorAppUserId: actor.principal.appUserId,
      actorRoles: actor.principal.roles,
      action,
      resourceType,
      resourceId,
      before,
      after,
      correlationId: actor.principal.sessionId,
    };
  }

  return {
    organizationId,
    actorKind: 'OPERATOR',
    actorAppUserId: null,
    actorRoles: [],
    action,
    resourceType,
    resourceId,
    before,
    after: actor.context ? { ...(after ?? {}), ...actor.context } : after,
    correlationId: actor.ticketId,
    operatorReference: actor.ticketRef,
  };
}

/** The audit event of something the system did on its own account: a transfer that reached its day. */
export function personnelSystemAuditEvent(
  organizationId: string,
  action: string,
  resourceType: string,
  resourceId: string,
  correlationId: string,
  before: Snapshot,
  after: Snapshot,
): AuditEventInput {
  return { organizationId, actorKind: 'SYSTEM', action, resourceType, resourceId, before, after, correlationId };
}
