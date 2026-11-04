import type { AuthenticatedPrincipal } from '../../../../infrastructure/security/tokens/access-token-verifier.port';
import type { AuditEventInput, AuditValue } from '../../../audit/public/audit.types';
import { AppRole } from '../../public/identity-access.types';

/** Role names a client may send: the six roles (QĐ-93a). */
export type RequestedRole = AppRole;

export type RoleRequestViolation = 'SUPER_ADMIN_TRANSFER_ONLY';

/**
 * A role cannot be granted or revoked by hand when it only moves by the operations command outside the application (SUPER_ADMIN —
 * US-01-09 AC-7). MANAGER and SPENDING_APPROVER are granted like IT_ADMIN and FINANCE (QĐ-93a): the rules of each are in the grant.
 */
export function checkRoleRequest(role: RequestedRole): RoleRequestViolation | null {
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

/** An employee who can be the spending approver works: not left, not on long leave, not handing over (OD-3, rule 7 of the grant). */
export function canBeSpendingApprover(employee: { status: string; workState: string }): boolean {
  return employee.status === 'ACTIVE' && employee.workState === 'WORKING';
}

/** An account that can sign in: active and activated (rule 8 of the grant; `US-01-03` AC-6). */
export function accountIsUsable(account: { status: string; activationState: string }): boolean {
  return account.status === 'ACTIVE' && account.activationState === 'ACTIVATED';
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
