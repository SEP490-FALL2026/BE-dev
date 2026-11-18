import type { AuthenticatedPrincipal } from '../../infrastructure/security/tokens/access-token-verifier.port';
import type { AuditEventInput, AuditValue } from '../audit/public/audit.types';

/** Who does an act on a recommendation: the system (a run, a listener) or a person (the IT Admin, who may not be the one in charge). */
export type GhostSeatActor = { kind: 'SYSTEM' } | { kind: 'USER'; principal: AuthenticatedPrincipal };

/**
 * The audit event of an act on a recommendation (`GHOST_SEAT.CREATED`, `.G1_UPDATED`, `.CLOSED`, `.SUPERSEDED`, `.RECLAIM_OPENED`,
 * `.HOLDER_LEFT_MARKED`). The system acts as `SYSTEM` with no roles and a correlation key of its own; a person acts as themselves,
 * correlated by their session. Ids, states and counts only: no name, no account identifier.
 */
export function ghostSeatAuditEvent(
  actor: GhostSeatActor,
  organizationId: string,
  action: string,
  recommendationId: string,
  before: { [key: string]: AuditValue } | null,
  after: { [key: string]: AuditValue } | null,
): AuditEventInput {
  const common = {
    organizationId,
    action,
    resourceType: 'GHOST_SEAT_RECOMMENDATION',
    resourceId: recommendationId,
    before,
    after,
  };

  return actor.kind === 'SYSTEM'
    ? {
        ...common,
        actorKind: 'SYSTEM',
        actorAppUserId: null,
        actorRoles: [],
        correlationId: `ghost-seat:${recommendationId}`,
      }
    : {
        ...common,
        actorKind: 'USER',
        actorAppUserId: actor.principal.appUserId,
        actorRoles: actor.principal.roles,
        correlationId: actor.principal.sessionId,
      };
}
