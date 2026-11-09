import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { AuditEventInput, AuditValue } from '../../audit/public/audit.types';

/** The audit event for a change made by `actor` (a user acting as themselves), correlated by their session. */
export function accessRequestAuditEvent(
  actor: AuthenticatedPrincipal | null,
  organizationId: string,
  action: string,
  resourceType: string,
  resourceId: string,
  after: { [key: string]: AuditValue },
): AuditEventInput {
  return {
    organizationId,
    actorKind: actor === null ? 'SYSTEM' : 'USER',
    actorAppUserId: actor?.appUserId ?? null,
    actorRoles: actor?.roles ?? [],
    action,
    resourceType,
    resourceId,
    before: null,
    after,
    correlationId: actor?.sessionId ?? resourceId,
  };
}
