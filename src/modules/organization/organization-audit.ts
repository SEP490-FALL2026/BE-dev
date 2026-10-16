import type { AuthenticatedPrincipal } from '../../infrastructure/security/tokens/access-token-verifier.port';
import type { AuditEventInput, AuditValue } from '../audit/audit.types';

/** The audit event for a change made by `actor` (an IT Admin acting as themselves, never as an operator), correlated by their session. */
export function organizationAuditEvent(
  actor: AuthenticatedPrincipal,
  organizationId: string,
  action: string,
  resourceType: string,
  resourceId: string,
  before: { [key: string]: AuditValue } | null,
  after: { [key: string]: AuditValue } | null,
): AuditEventInput {
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
