import type { AuthenticatedPrincipal } from '../../infrastructure/security/tokens/access-token-verifier.port';
import type { AuditEventInput, AuditValue } from '../audit/public/audit.types';
import { isSystemActor, type OperatorAuditActor, type SystemActor } from './public/licensing.types';

/**
 * The audit event for a change made by `actor` (a user acting as themselves), correlated by their session. With `operator` (the
 * controlled procedure) the event is `OPERATOR` instead: no account, the ticket code as the reference, the id of the
 * ticket row as the correlation, and the context of the command added to what the event says after the change.
 */
export function licensingAuditEvent(
  actor: AuthenticatedPrincipal | SystemActor,
  organizationId: string,
  action: string,
  resourceType: string,
  resourceId: string,
  before: { [key: string]: AuditValue } | null,
  after: { [key: string]: AuditValue } | null,
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
      after: operator.context ? { ...(after ?? {}), ...operator.context } : after,
      correlationId: operator.ticketId,
      operatorReference: operator.ticketRef,
    };
  }

  if (isSystemActor(actor)) {
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
      correlationId: actor.correlationId,
    };
  }

  return {
    organizationId,
    actorKind: 'USER',
    actorAppUserId: actor.appUserId,
    actorRoles: actor.roles,
    action,
    resourceType,
    resourceId,
    before,
    after,
    correlationId: actor.sessionId,
  };
}
