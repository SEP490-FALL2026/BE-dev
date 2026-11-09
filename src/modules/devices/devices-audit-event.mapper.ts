import type { AuthenticatedPrincipal } from '../../infrastructure/security/tokens/access-token-verifier.port';
import type { AuditEventInput, AuditValue } from '../audit/public/audit.types';

type Snapshot = { [key: string]: AuditValue } | null;

/**
 * Who made a change: a person signed in, the system on its own account (a registration that ended because the person left), or a
 * collector acting with its own credential.
 */
export type DevicesActor =
  | { kind: 'USER'; principal: AuthenticatedPrincipal }
  | { kind: 'SYSTEM'; correlationId: string }
  | { kind: 'DEVICE'; credentialId: string };

export const byUser = (principal: AuthenticatedPrincipal): DevicesActor => ({ kind: 'USER', principal });

/** The audit event of a change; a person is correlated by their session, the system by what it was reacting to. */
export function devicesEvent(
  by: DevicesActor,
  organizationId: string,
  action: string,
  resourceType: string,
  resourceId: string,
  before: Snapshot,
  after: Snapshot,
): AuditEventInput {
  if (by.kind === 'DEVICE') {
    return {
      organizationId,
      actorKind: 'DEVICE',
      action,
      resourceType,
      resourceId,
      before,
      after,
      correlationId: by.credentialId,
    };
  }
  if (by.kind === 'SYSTEM') {
    return {
      organizationId,
      actorKind: 'SYSTEM',
      action,
      resourceType,
      resourceId,
      before,
      after,
      correlationId: by.correlationId,
    };
  }

  return {
    organizationId,
    actorKind: 'USER',
    actorAppUserId: by.principal.appUserId,
    actorRoles: by.principal.roles,
    action,
    resourceType,
    resourceId,
    before,
    after,
    correlationId: by.principal.sessionId,
  };
}
