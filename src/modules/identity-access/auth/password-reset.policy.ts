import type { EmployeeStatus } from '../../organization/public/organization.types';
import { employeeHasNotLeft } from '../accounts/account.policy';

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
