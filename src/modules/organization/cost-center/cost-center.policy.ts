import { CostCenterForbiddenError } from './cost-center.errors';

/**
 * Who may do what with the Cost Center catalogue, decided in the service so no route is the only thing between a caller and the
 * data. Finance creates, renames and retires; the Super Admin, who owns the departments the Cost Centers belong to, may
 * read the catalogue to see which department is still without one; the IT Admin has no operation on it (`QĐ-87a`, `US-04-09`).
 * Pure: no store, no clock.
 */

/** Creating, renaming and retiring a Cost Center, and reading the people in its scope: Finance alone. Throws CostCenterForbiddenError. */
export function assertMayMaintainCostCenters(roles: readonly string[]): void {
  if (!roles.includes('FINANCE')) throw new CostCenterForbiddenError();
}

/** Reading the catalogue: Finance, and the Super Admin. Throws CostCenterForbiddenError. */
export function assertMayReadCostCenters(roles: readonly string[]): void {
  if (!roles.includes('FINANCE') && !roles.includes('SUPER_ADMIN')) throw new CostCenterForbiddenError();
}
