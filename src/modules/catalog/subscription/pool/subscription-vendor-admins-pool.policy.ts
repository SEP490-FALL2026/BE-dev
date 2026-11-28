import { SubscriptionVendorAdminsRequiredError } from '../subscription.errors';

/** The fewest different working IT Admins at the vendor a plan that needs them has before it is activated. */
const MIN_RECORDED_VENDOR_ADMINS = 2;

/**
 * A subscription of a plan that needs admins at the vendor (`K2`, or `K4` with an admin console) is not activated, nor a pool made, while
 * fewer than two different IT Admins who administer it at the vendor are still working (outside the open seat-baseline phase). Throws
 * SubscriptionVendorAdminsRequiredError.
 */
export function assertVendorAdminsRecorded(input: { needs: boolean; given: number; planId: string }): void {
  if (input.needs && input.given < MIN_RECORDED_VENDOR_ADMINS) {
    throw new SubscriptionVendorAdminsRequiredError(input.planId, input.given, MIN_RECORDED_VENDOR_ADMINS);
  }
}

/**
 * What a reader sees of the vendor admins of a subscription, never a refusal (`QĐ-110k`, `QĐ-110u`): fewer than two of the admins recorded still
 * work, and no email of the company account that owns the plan at the vendor is recorded. A plan that needs no admins raises neither; a
 * subscription older than the rule has the flags and nothing blocks it.
 */
export function vendorAdminFlags(input: {
  needs: boolean;
  admins: ReadonlyArray<{ employeeId: string; working: boolean }>;
  ownerAccountEmail: string | null;
}): { vendorAdminsBelowMinimum: boolean; ownerAccountEmailMissing: boolean } {
  if (!input.needs) return { vendorAdminsBelowMinimum: false, ownerAccountEmailMissing: false };
  const working = new Set(input.admins.filter((admin) => admin.working).map((admin) => admin.employeeId)).size;

  return {
    vendorAdminsBelowMinimum: working < MIN_RECORDED_VENDOR_ADMINS,
    ownerAccountEmailMissing: input.ownerAccountEmail === null,
  };
}

/**
 * A subscription as someone who is not an IT Admin reads it (Finance reads subscriptions too, SPEC P19): who administers the plan at the vendor, the email
 * of the company account that owns it there and the note are the IT Admin's alone, so they are emptied; the shape and the two flags stay.
 */
export function withoutVendorAdminDetail<
  T extends { vendorAdmins: unknown[]; ownerAccountEmail: string | null; adminNote: string | null },
>(view: T): T {
  return { ...view, vendorAdmins: [], ownerAccountEmail: null, adminNote: null };
}
