import { MIN_WORKSPACE_ADMINS } from '../workspace/workspace.policy';
import {
  LicenseLotContractReasonRequiredError,
  LicenseLotKeysExceedLicensesError,
  LicenseLotPlanNotK4Error,
  LicenseLotPriceLockedError,
  LicenseLotPurposeNotAvailableError,
  LicenseLotRequestRequiredError,
  LicenseLotVendorAdminsRequiredError,
} from './license-lot.errors';
import type { LicenseLotPurpose } from './license-lot.types';

type KeyBinding = 'ACCOUNT' | 'DEVICE_KEY' | 'DEVICE_BUNDLED' | null;

/**
 * Whether a lot of this purpose can be made for this plan (W3-24): the plan is a K4 plan, not bundled with the machine; a lot for a request is of a plan whose
 * key is given to an account and names its request; a lot kept in stock is of a plan whose key goes on a machine. Throws LicenseLotPlanNotK4Error,
 * LicenseLotPurposeNotAvailableError, LicenseLotRequestRequiredError.
 */
export function assertCreatable(input: {
  purpose: LicenseLotPurpose;
  planProvisioningType: string;
  keyBinding: KeyBinding;
  requestId: string | null | undefined;
}): void {
  if (input.planProvisioningType !== 'K4') throw new LicenseLotPlanNotK4Error();
  if (input.keyBinding === 'DEVICE_BUNDLED') throw new LicenseLotPurposeNotAvailableError();
  if (input.purpose === 'REQUEST' && input.keyBinding !== 'ACCOUNT') throw new LicenseLotPurposeNotAvailableError();
  if (input.purpose === 'STOCK' && input.keyBinding !== 'DEVICE_KEY') throw new LicenseLotPurposeNotAvailableError();
  if (input.purpose === 'REQUEST' && !input.requestId) throw new LicenseLotRequestRequiredError();
}

/**
 * What a change of the contract of a lot asks (QĐ-115au): leaving a contract for another, or for none, names the reason; putting the first one on a lot
 * that has none does not. Answers whether the contract changes at all. Throws LicenseLotContractReasonRequiredError.
 */
export function judgeContractChange(input: {
  current: string | null;
  next: string | null | undefined;
  reason: string | undefined;
}): 'UNCHANGED' | 'CHANGED' {
  if (input.next === undefined || input.next === input.current) return 'UNCHANGED';
  if (input.current !== null && (input.reason === undefined || input.reason.trim().length === 0)) {
    throw new LicenseLotContractReasonRequiredError();
  }

  return 'CHANGED';
}

/** The price of a lot is set until a key of it is given or an invoice of it is confirmed (W3-24). Throws LicenseLotPriceLockedError. */
export function assertPriceOpen(input: { invoiceActualMinor: bigint | null; keysAssigned: number }): void {
  if (input.invoiceActualMinor !== null || input.keysAssigned > 0) throw new LicenseLotPriceLockedError();
}

/**
 * The keys a lot of a plan bound to an account holds never pass its licenses (K-A6): the keys not withdrawn and the new ones. A lot whose key goes on a machine has no
 * limit of keys (its limit is the activations). Throws LicenseLotKeysExceedLicensesError.
 */
export function assertKeysWithinLicenses(input: {
  keyBinding: KeyBinding;
  licenseCount: number;
  keysNotWithdrawn: number;
  adding: number;
}): void {
  if (input.keyBinding !== 'ACCOUNT') return;
  if (input.keysNotWithdrawn + input.adding > input.licenseCount) {
    throw new LicenseLotKeysExceedLicensesError(input.licenseCount, input.keysNotWithdrawn);
  }
}

/** How a lot is cost-bound: a key bought for a request was charged then (false); the keys of every other purpose are borne (true). */
export const costBorneOf = (purpose: LicenseLotPurpose): boolean => purpose !== 'REQUEST';

/** The licenses a lot can still give out, and what they are worth, from the licenses taken. */
export function freeOf(
  licenseCount: number,
  taken: number,
  unitPriceMinor: bigint,
): { free: number; freeValueMinor: bigint } {
  const free = Math.max(0, licenseCount - taken);

  return { free, freeValueMinor: BigInt(free) * unitPriceMinor };
}

/** The keys that can be given at once: the licenses free and the keys in the store, whichever is the fewer; only for a plan whose key goes to an account. */
export function grantableOf(input: { keyBinding: KeyBinding; free: number; keysInStore: number }): number | null {
  return input.keyBinding === 'ACCOUNT' ? Math.min(input.free, input.keysInStore) : null;
}

/**
 * A lot of a K4 plan with an admin console needs at least two different working IT Admins on its workspace once the seat baseline is closed (`QĐ-110k`,
 * `QĐ-117e`). Throws LicenseLotVendorAdminsRequiredError.
 */
export function assertLotVendorAdminsRecorded(input: { needs: boolean; given: number; planId: string }): void {
  if (input.needs && input.given < MIN_WORKSPACE_ADMINS) {
    throw new LicenseLotVendorAdminsRequiredError(input.planId, input.given, MIN_WORKSPACE_ADMINS);
  }
}
