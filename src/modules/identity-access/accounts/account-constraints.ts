import { isCheckViolation, isUniqueViolation } from '../../../infrastructure/database/unique-violation';
import {
  AccountAlreadyExistsError,
  FinanceAlreadyAssignedError,
  LoginEmailTakenError,
  RoleAlreadyGrantedError,
  RoleCombinationForbiddenError,
} from './account.errors';

/** Maps a constraint that caught a race to the same business error the pre-checks give. */
export function translateAccountWriteError(error: unknown): unknown {
  if (isUniqueViolation(error, 'role_grants_one_finance')) return new FinanceAlreadyAssignedError();
  if (isUniqueViolation(error, 'role_grants_one_effective_per_role')) return new RoleAlreadyGrantedError();
  if (isUniqueViolation(error, 'app_users_employee_id_key')) return new AccountAlreadyExistsError();
  if (isUniqueViolation(error, 'app_users_organization_id_normalized_login_email_key', 'normalized_login_email')) {
    return new LoginEmailTakenError();
  }
  if (isCheckViolation(error)) return new RoleCombinationForbiddenError();

  return error;
}
