import { AppRole } from '../public/identity-access.types';

/**
 * The roles the guards check, from the roles the account was granted (QĐ-93a: no role is derived from data). MANAGER is a grant like
 * the others, but its powers belong to the person only while they head a department (US-01-02 AC-3, AC-10): a MANAGER who heads nothing
 * today authorizes nothing as a MANAGER, exactly as a head whose period ended yesterday. Every other granted role stays as it is.
 * The one exception is not made here: the budget routes of a head to come (`QĐ-106k`, `RequireRolesOrGrants`) admit the grant at the
 * guard and the services judge the unit; this function never widens a role.
 * Sorted, without duplicates.
 */
export function authorizingRoles(direct: readonly AppRole[], headsDepartmentToday: boolean): AppRole[] {
  return [...new Set(direct)].filter((role) => role !== 'MANAGER' || headsDepartmentToday).sort();
}
