import { PlanAdminConsoleNotApplicableError, PlanVendorAdminsInvalidError } from './plan.errors';
import type { ProvisioningType } from './plan.types';

/**
 * Whether the flag "the plan has an admin console" may be given at all (`R-53`, SPEC P29): only a `K4` plan (keys bought once, which may or may
 * not come with a console the company administers) says it; any other kind that gives the flag, true or false, is refused. A write that does not
 * give the flag is judged by nothing here. Throws PlanAdminConsoleNotApplicableError.
 */
export function assertAdminConsoleApplicable(provisioningType: ProvisioningType, given: boolean | undefined): void {
  if (given !== undefined && provisioningType !== 'K4') throw new PlanAdminConsoleNotApplicableError();
}

/**
 * Whether a plan needs at least two IT Admins who administer it at the vendor (`QĐ-110k`, `QĐ-110u`, `R-53`): a `K2` plan (a workspace) always,
 * a `K4` plan only when the IT Admin said it has an admin console; `K1` (a personal plan), `K3` and `K5` (internal software) never.
 */
export function needsVendorAdmins(provisioningType: ProvisioningType, hasAdminConsole: boolean): boolean {
  return provisioningType === 'K2' || (provisioningType === 'K4' && hasAdminConsole);
}

/** The fewest different IT Admins who administer a plan at the vendor (`QĐ-110k`): one may leave and the plan is still reachable. */
export const MIN_VENDOR_ADMINS = 2;

/** At least two different people administer the plan (`QĐ-110k`, SPEC P19). Throws PlanVendorAdminsInvalidError. */
export function assertVendorAdminsEnough(employeeIds: readonly string[]): void {
  const given = new Set(employeeIds).size;
  if (given < MIN_VENDOR_ADMINS) throw new PlanVendorAdminsInvalidError(given, MIN_VENDOR_ADMINS);
}
