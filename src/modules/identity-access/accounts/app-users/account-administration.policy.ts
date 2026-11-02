import type { AuthenticatedPrincipal } from '../../../../infrastructure/security/tokens/access-token-verifier.port';
import type { AuditEventInput, AuditValue } from '../../../audit/public/audit.types';
import { AppRole } from '../../public/identity-access.types';

/** Role names a client may send. MANAGER and SPENDING_APPROVER exist only to be refused with a clear reason. */
export type RequestedRole = AppRole | 'MANAGER' | 'SPENDING_APPROVER';

export type RoleRequestViolation = 'ROLE_DERIVED' | 'SUPER_ADMIN_TRANSFER_ONLY';
export type RoleSetViolation = RoleRequestViolation | 'ROLE_COMBINATION_FORBIDDEN';

/**
 * A role cannot be granted by hand when it is derived from data (MANAGER from heading a
 * department, the spending approver from configuration — US-01-01 AC-4) or when it only moves
 * by the operations command outside the application (SUPER_ADMIN — US-01-09 AC-7).
 */
export function checkRoleRequest(role: RequestedRole): RoleRequestViolation | null {
  if (role === 'MANAGER' || role === 'SPENDING_APPROVER') return 'ROLE_DERIVED';
  if (role === 'SUPER_ADMIN') return 'SUPER_ADMIN_TRANSFER_ONLY';

  return null;
}

/**
 * The pairs of roles that are never held together (FR-8.7, QĐ-93b, US-01-01 AC-12, US-01-03 AC-11): SUPER_ADMIN with IT_ADMIN,
 * FINANCE or MANAGER, and SPENDING_APPROVER with SUPER_ADMIN, IT_ADMIN, FINANCE or MANAGER. EMPLOYEE goes with every role. The
 * database says the same in `role_grants_forbid_combination`.
 */
const FORBIDDEN_WITH: Readonly<Record<AppRole, readonly AppRole[]>> = {
  SUPER_ADMIN: ['IT_ADMIN', 'FINANCE', 'MANAGER', 'SPENDING_APPROVER'],
  SPENDING_APPROVER: ['SUPER_ADMIN', 'IT_ADMIN', 'FINANCE', 'MANAGER'],
  IT_ADMIN: ['SUPER_ADMIN', 'SPENDING_APPROVER'],
  FINANCE: ['SUPER_ADMIN', 'SPENDING_APPROVER'],
  MANAGER: ['SUPER_ADMIN', 'SPENDING_APPROVER'],
  EMPLOYEE: [],
};

/** The roles already held that cannot go with `adding`, in the order they are held (empty: it can be granted). */
export function conflictingRoles(held: readonly AppRole[], adding: AppRole): AppRole[] {
  return held.filter((role) => FORBIDDEN_WITH[adding].includes(role));
}

export function forbidsCombination(held: readonly AppRole[], adding: AppRole): boolean {
  return conflictingRoles(held, adding).length > 0;
}

/** The first pair in a set of roles asked for at creation that cannot be held together (the later role of the pair is the one added). */
export function forbiddenPairInSet(roles: readonly AppRole[]): [AppRole, AppRole] | null {
  const distinct = [...new Set(roles)];
  for (let index = 1; index < distinct.length; index += 1) {
    const [conflict] = conflictingRoles(distinct.slice(0, index), distinct[index]);
    if (conflict) return [conflict, distinct[index]];
  }

  return null;
}

/** The first violation in a set of roles requested at account creation, or null: one role at a time, then the combination. */
export function validateRoleSet(roles: readonly RequestedRole[]): RoleSetViolation | null {
  for (const role of new Set(roles)) {
    const violation = checkRoleRequest(role);
    if (violation) return violation;
  }

  return forbiddenPairInSet(roles) ? 'ROLE_COMBINATION_FORBIDDEN' : null;
}

/** US-01-01 AC-13: nobody changes their own account's lock state, roles or invitation. */
export function isSelfChange(actorAppUserId: string, targetAppUserId: string): boolean {
  return actorAppUserId === targetAppUserId;
}

/** AC-15, FR-8.10(b): the holder of SUPER_ADMIN cannot be locked, whoever asks. */
export function stopsLocking(heldRoles: readonly AppRole[]): boolean {
  return heldRoles.includes('SUPER_ADMIN');
}

/** The audit event for an account change made by `actor` (a Super Admin), correlated by the actor's session. */
export function accountAuditEvent(
  actor: AuthenticatedPrincipal,
  organizationId: string,
  action: string,
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
    resourceType: 'AppUser',
    resourceId,
    before,
    after,
    correlationId: actor.sessionId,
  };
}
