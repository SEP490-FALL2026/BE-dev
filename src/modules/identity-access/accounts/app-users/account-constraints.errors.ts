import { isCheckViolation, isUniqueViolation } from '../../../../infrastructure/database/unique-violation';
import {
  AccountAlreadyExistsError,
  FinanceAlreadyAssignedError,
  LoginEmailTakenError,
  ManagerStillHeadingError,
  SpendingApproverAlreadyAssignedError,
  SpendingApproverHeadsDepartmentError,
} from '../account.errors';

/** Maps a constraint that caught a race to the same business error the pre-checks give. */
export function translateAccountWriteError(error: unknown): unknown {
  if (isUniqueViolation(error, 'role_grants_one_finance')) return new FinanceAlreadyAssignedError();
  if (isUniqueViolation(error, 'role_grants_one_spending_approver')) return new SpendingApproverAlreadyAssignedError();
  if (isUniqueViolation(error, 'app_users_employee_id_key')) return new AccountAlreadyExistsError();
  if (isUniqueViolation(error, 'app_users_organization_id_normalized_login_email_key', 'normalized_login_email')) {
    return new LoginEmailTakenError();
  }
  // The two triggers of the new roles name themselves; unrecognized constraints remain internal errors.
  if (isCheckViolation(error, 'role_grants_manager_revoke_guard')) return new ManagerStillHeadingError();
  if (isCheckViolation(error, 'role_grants_spending_approver_not_head'))
    return new SpendingApproverHeadsDepartmentError();

  return error;
}
