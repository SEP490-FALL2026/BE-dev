import type { AuthenticatedPrincipal } from '../../infrastructure/security/tokens/access-token-verifier.port';
import type { AuditEventInput, AuditValue } from '../audit/public/audit.types';

type Snapshot = { [key: string]: AuditValue } | null;

/** The audit event of a change to the library or of an acknowledgement: a person signed in, correlated by their session. */
export function policiesEvent(
  principal: AuthenticatedPrincipal,
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
    actorAppUserId: principal.appUserId,
    actorRoles: principal.roles,
    action,
    resourceType,
    resourceId,
    before,
    after,
    correlationId: principal.sessionId,
  };
}
