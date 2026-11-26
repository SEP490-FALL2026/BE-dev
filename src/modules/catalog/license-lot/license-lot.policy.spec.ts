import {
  LicenseLotContractReasonRequiredError,
  LicenseLotPlanNotK4Error,
  LicenseLotPriceLockedError,
  LicenseLotPurposeNotAvailableError,
  LicenseLotRequestRequiredError,
  LicenseLotVendorAdminsRequiredError,
} from './license-lot.errors';
import { toLicenseLotApiException } from './license-lot.http-errors';
import {
  assertCreatable,
  assertLotVendorAdminsRecorded,
  assertPriceOpen,
  freeOf,
  grantableOf,
  judgeContractChange,
} from './license-lot.policy';

describe('what a lot of licenses may be (W3-24)', () => {
  const account = { planProvisioningType: 'K4', keyBinding: 'ACCOUNT' as const, requestId: undefined };
  const machine = { planProvisioningType: 'K4', keyBinding: 'DEVICE_KEY' as const, requestId: undefined };

  it('is made for a K4 plan whose key goes to an account (a request, replacement, or stock) or on a machine (stock or replacement)', () => {
    expect(() => assertCreatable({ ...account, purpose: 'REQUEST', requestId: 'r-1' })).not.toThrow();
    expect(() => assertCreatable({ ...account, purpose: 'REPLACEMENT' })).not.toThrow();
    expect(() => assertCreatable({ ...account, purpose: 'STOCK' })).not.toThrow();
    expect(() => assertCreatable({ ...machine, purpose: 'STOCK' })).not.toThrow();
    expect(() => assertCreatable({ ...machine, purpose: 'REPLACEMENT' })).not.toThrow();
  });

  it('refuses a plan that is not K4, with the code of the rule', () => {
    expect(() => assertCreatable({ ...account, planProvisioningType: 'K2', purpose: 'STOCK' })).toThrow(
      LicenseLotPlanNotK4Error,
    );
    expect(() => assertCreatable({ ...account, planProvisioningType: 'NONE', purpose: 'REPLACEMENT' })).toThrow(
      LicenseLotPlanNotK4Error,
    );
  });

  it('refuses a purpose the plan cannot take: a request for a key on a machine, stock without key binding, or a plan bundled with the machine', () => {
    expect(() => assertCreatable({ ...machine, purpose: 'REQUEST', requestId: 'r-1' })).toThrow(
      LicenseLotPurposeNotAvailableError,
    );
    expect(() => assertCreatable({ ...account, keyBinding: null, purpose: 'STOCK' })).toThrow(
      LicenseLotPurposeNotAvailableError,
    );
    expect(() => assertCreatable({ ...account, keyBinding: 'DEVICE_BUNDLED', purpose: 'STOCK' })).toThrow(
      LicenseLotPurposeNotAvailableError,
    );
    expect(() => assertCreatable({ ...account, keyBinding: 'DEVICE_BUNDLED', purpose: 'REPLACEMENT' })).toThrow(
      LicenseLotPurposeNotAvailableError,
    );
  });

  it('asks a lot for a request to name the request', () => {
    expect(() => assertCreatable({ ...account, purpose: 'REQUEST' })).toThrow(LicenseLotRequestRequiredError);
  });
});

describe('the contract of a lot (QĐ-115au)', () => {
  it('asks the reason to leave a contract for another or for none, and not for the first one', () => {
    expect(() => judgeContractChange({ current: 'c-1', next: 'c-2', reason: undefined })).toThrow(
      LicenseLotContractReasonRequiredError,
    );
    expect(() => judgeContractChange({ current: 'c-1', next: null, reason: '   ' })).toThrow(
      LicenseLotContractReasonRequiredError,
    );
    expect(judgeContractChange({ current: 'c-1', next: 'c-2', reason: 'The vendor signed again' })).toBe('CHANGED');
    expect(judgeContractChange({ current: null, next: 'c-1', reason: undefined })).toBe('CHANGED');
  });

  it('is unchanged when the contract is not sent or is the one the lot has', () => {
    expect(judgeContractChange({ current: 'c-1', next: undefined, reason: undefined })).toBe('UNCHANGED');
    expect(judgeContractChange({ current: 'c-1', next: 'c-1', reason: undefined })).toBe('UNCHANGED');
  });
});

describe('the price of a lot and its keys', () => {
  it('is set until a key of the lot is given, an invoice of it is confirmed, or usage/charge history exists', () => {
    expect(() => assertPriceOpen({ invoiceActualMinor: null, keysAssigned: 0 })).not.toThrow();
    expect(() => assertPriceOpen({ invoiceActualMinor: null, keysAssigned: 0, hasUsageHistory: false })).not.toThrow();

    for (const bad of [
      { invoiceActualMinor: 1n, keysAssigned: 0 },
      { invoiceActualMinor: null, keysAssigned: 1 },
      { invoiceActualMinor: null, keysAssigned: 0, hasUsageHistory: true },
    ]) {
      let caught: unknown;
      try {
        assertPriceOpen(bad);
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(LicenseLotPriceLockedError);
      const mapped = toLicenseLotApiException(caught) as { getResponse?: () => { code?: string } };
      expect(mapped.getResponse?.().code).toBe('LICENSE_LOT.PRICE_LOCKED');
    }
  });

  it('says what is free and worth: a lot of 3 with 1 taken and 1 key in the store has 2 free and 1 to grant', () => {
    expect(freeOf(3, 1, 12_000_000n)).toEqual({ free: 2, freeValueMinor: 24_000_000n });
    expect(freeOf(3, 5, 12_000_000n)).toEqual({ free: 0, freeValueMinor: 0n });
    expect(grantableOf({ keyBinding: 'ACCOUNT', free: 2, keysInStore: 1 })).toBe(1);
    expect(grantableOf({ keyBinding: 'DEVICE_KEY', free: 2, keysInStore: 1 })).toBeNull();
  });
});

describe('workspace working-admin gate for a K4 lot (W3-12, W3-24)', () => {
  it.each([
    { needs: false, given: 0, allowed: true },
    { needs: false, given: 1, allowed: true },
    { needs: true, given: 2, allowed: true },
    { needs: true, given: 3, allowed: true },
    { needs: true, given: 1, allowed: false },
    { needs: true, given: 0, allowed: false },
  ])('needs=$needs, given=$given -> allowed=$allowed', ({ needs, given, allowed }) => {
    const run = () => assertLotVendorAdminsRecorded({ needs, given, planId: 'plan-k4' });
    if (allowed) {
      expect(run).not.toThrow();
    } else {
      let thrown: unknown;
      try {
        run();
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(LicenseLotVendorAdminsRequiredError);
      expect(thrown).toMatchObject({ planId: 'plan-k4', given, required: 2 });
    }
  });
});
