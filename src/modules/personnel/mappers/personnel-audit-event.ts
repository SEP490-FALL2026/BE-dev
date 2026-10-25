import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { AuditEventInput, AuditValue } from '../../audit/audit.types';

type Snapshot = { [key: string]: AuditValue } | null;

/** The audit event for a change made by `actor` (an IT Admin acting as themselves), correlated by their session. */
export function personnelAuditEvent(
  actor: AuthenticatedPrincipal,
  organizationId: string,
  action: string,
  resourceType: string,
  resourceId: string,
  before: Snapshot,
  after: Snapshot,
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
