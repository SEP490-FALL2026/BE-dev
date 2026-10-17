import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { AuditEventInput, AuditValue } from '../../audit/audit.types';
import type { EmployeeStatus } from '../../organization/organization.types';
import { AppRole } from '../identity-access.types';

/** Role names a client may send. MANAGER and SPENDING_APPROVER exist only to be refused with a clear reason. */
export type RequestedRole = AppRole | 'MANAGER' | 'SPENDING_APPROVER';

export type RoleRequestViolation = 'ROLE_DERIVED' | 'SUPER_ADMIN_TRANSFER_ONLY';

/**
 * A role cannot be granted by hand when it is derived from data (MANAGER from heading a
 * department, the spending approver from configuration — US-01-01 AC-4) or when it only moves
 * through the transfer procedure (SUPER_ADMIN — AC-14).
 */
export function checkRoleRequest(role: RequestedRole): RoleRequestViolation | null {
  if (role === 'MANAGER' || role === 'SPENDING_APPROVER') return 'ROLE_DERIVED';
  if (role === 'SUPER_ADMIN') return 'SUPER_ADMIN_TRANSFER_ONLY';

  return null;
}

/** FR-8.7: SUPER_ADMIN is never held together with IT_ADMIN or FINANCE. */
export function forbidsCombination(held: readonly AppRole[], adding: AppRole): boolean {
  const workRoles: AppRole[] = ['IT_ADMIN', 'FINANCE'];
  if (adding === 'SUPER_ADMIN') return held.some((role) => workRoles.includes(role));
  if (workRoles.includes(adding)) return held.includes('SUPER_ADMIN');

  return false;
}

/** The first violation in a set of roles requested at account creation, or null. */
export function validateRoleSet(roles: readonly RequestedRole[]): RoleRequestViolation | null {
  for (const role of new Set(roles)) {
    const violation = checkRoleRequest(role);
    if (violation) return violation;
  }

  return null;
}

/** US-01-01 AC-13: nobody changes their own account's lock state, roles or invitation. */
export function isSelfChange(actorAppUserId: string, targetAppUserId: string): boolean {
  return actorAppUserId === targetAppUserId;
}

/** AC-15, FR-8.10(b): the holder of SUPER_ADMIN cannot be locked, whoever asks. */
export function stopsLocking(heldRoles: readonly AppRole[]): boolean {
  return heldRoles.includes('SUPER_ADMIN');
}

/** Facts about an account that make roles appear without a grant. Each is read afresh on every request. */
export interface DerivedRoleFacts {
  /** The employee heads a department today (US-01-02). */
  headsDepartment: boolean;
  /** The employee is the configured spending approver (US-01-03). */
  isSpendingApprover?: boolean;
}

export interface EffectiveRoles {
  /** Roles granted to the account directly and still in force. */
  direct: AppRole[];
  /**
   * Roles inferred from data rather than granted: MANAGER from heading a department today (US-01-02) and the
   * spending approver from configuration (US-01-03).
   */
  derived: string[];
  effective: string[];
}

export function resolveEffectiveRoles(
  direct: readonly AppRole[],
  facts: DerivedRoleFacts = { headsDepartment: false },
): EffectiveRoles {
  const derived: string[] = [];
  // FR-8.7: the Super Admin is never a department head, so never a MANAGER, whatever the data says.
  if (facts.headsDepartment && !direct.includes('SUPER_ADMIN')) derived.push('MANAGER');
  // US-01-03 AC-2: a Super Admin never holds an approval role, so the role never shows for one either.
  if (facts.isSpendingApprover && !direct.includes('SUPER_ADMIN')) derived.push('SPENDING_APPROVER');
  const effective = [...new Set<string>([...direct, ...derived])].sort();

  return { direct: [...direct].sort(), derived, effective };
}

/** An account works only while its Employee has not left (login, refresh, guard, invitations). */
export function employeeHasNotLeft<T extends { status: EmployeeStatus }>(
  employee: T | null | undefined,
): employee is T {
  return employee != null && employee.status !== 'TERMINATED';
}

/**
 * Whether a password-reset link may be issued or redeemed for this account: active, activated, and
 * its Employee has not left (AC-3, AC-6). The one place the conditions live, so the recovery flow
 * (US-01-09, AC-10) adds its own refusal here and not at each caller.
 */
export function canReceiveResetMail(
  account: { status: 'ACTIVE' | 'LOCKED'; activationState: 'INVITED' | 'ACTIVATED' },
  employee: { status: EmployeeStatus } | null | undefined,
): boolean {
  return account.status === 'ACTIVE' && account.activationState === 'ACTIVATED' && employeeHasNotLeft(employee);
}

export interface ActionLinkState {
  purpose: 'INVITE' | 'RESET_PASSWORD';
  consumedAt: Date | null;
  revokedAt: Date | null;
  expiresAt: Date;
  appUser: { status: 'ACTIVE' | 'LOCKED'; activationState: 'INVITED' | 'ACTIVATED' };
}

/**
 * Whether the account side would still accept this emailed link (T-10): not used, not revoked, not
 * expired, the account active, and in the activation state its purpose needs — an invitation is for an
 * account not yet activated, a reset for one that already is. Whether the Employee has left is the
 * organization module's to say, so the caller asks it.
 */
export function isActionLinkRedeemable(link: ActionLinkState, now: Date): boolean {
  const neededState = link.purpose === 'INVITE' ? 'INVITED' : 'ACTIVATED';

  return (
    link.consumedAt === null &&
    link.revokedAt === null &&
    link.expiresAt > now &&
    link.appUser.status === 'ACTIVE' &&
    link.appUser.activationState === neededState
  );
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
