import type { BusinessDate } from '../../../core/business-date';
import { isBlockInForce } from '../access-block/access-block.policy';
import type { EmployeeStatus } from '../../organization/public/organization.types';

// Account rules several capabilities share: auth, accounts, access, approval-roles (the facts of the grant) and the module root.

/** An account works only while its Employee has not left (login, refresh, guard, invitations). */
export function employeeHasNotLeft<T extends { status: EmployeeStatus }>(
  employee: T | null | undefined,
): employee is T {
  return employee != null && employee.status !== 'TERMINATED';
}

/** The one rule of the sign-in, the refresh and the guard: the Employee has not left and no block is in force on `today`. */
export function accessAllowed<T extends { status: EmployeeStatus }>(
  employee: T | null | undefined,
  block: { blockedFrom: BusinessDate } | null | undefined,
  today: BusinessDate,
): employee is T {
  return employeeHasNotLeft(employee) && !isBlockInForce(block, today);
}

export interface ActionLinkState {
  purpose: 'INVITE' | 'RESET_PASSWORD';
  consumedAt: Date | null;
  revokedAt: Date | null;
  expiresAt: Date;
  appUser: { status: 'ACTIVE' | 'LOCKED'; activationState: 'INVITED' | 'ACTIVATED' };
}

/**
 * Whether the account side would still accept this emailed link: not used, not revoked, not
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
