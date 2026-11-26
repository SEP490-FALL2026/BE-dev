import type { AuthenticatedPrincipal } from '../../infrastructure/security/tokens/access-token-verifier.port';
import type { AuditEventInput, AuditValue } from '../audit/public/audit.types';

export type CatalogAuditActor = AuthenticatedPrincipal | { systemCorrelationId: string };

/** The audit event for a change `actor` made as themselves or the system, correlated by session or run id. */
export function catalogAuditEvent(
  actor: CatalogAuditActor,
  organizationId: string,
  action: string,
  resourceType: string,
  resourceId: string,
  before: { [key: string]: AuditValue } | null,
  after: { [key: string]: AuditValue } | null,
): AuditEventInput {
  if ('systemCorrelationId' in actor) {
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
      correlationId: actor.systemCorrelationId,
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
