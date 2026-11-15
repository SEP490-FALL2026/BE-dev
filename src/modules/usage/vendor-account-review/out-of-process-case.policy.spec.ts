import { closureRefusal, openCaseKeyOf } from './out-of-process-case.policy';

const spent = {
  outcome: 'RECORD_SPENT' as const,
  documentCount: 1,
  amountMinor: 500_000n,
  costCenterChosen: true,
  hasVendor: true,
  companyAsset: false as boolean | null,
  renewalCancelled: false,
};

describe('how a case outside the process is closed (SBF-07a, R-45)', () => {
  it('lets a false alarm and a report close with a note and nothing else', () => {
    expect(
      closureRefusal({
        outcome: 'FALSE_ALARM',
        documentCount: 0,
        amountMinor: null,
        costCenterChosen: false,
        hasVendor: false,
        companyAsset: null,
        renewalCancelled: false,
      }),
    ).toBeNull();
    expect(
      closureRefusal({
        outcome: 'REPORT_ONLY',
        documentCount: 0,
        amountMinor: null,
        costCenterChosen: false,
        hasVendor: false,
        companyAsset: null,
        renewalCancelled: false,
      }),
    ).toBeNull();
  });

  it('refuses money or a proof with an outcome that records no money', () => {
    expect(
      closureRefusal({
        outcome: 'REPORT_ONLY',
        documentCount: 1,
        amountMinor: null,
        costCenterChosen: false,
        hasVendor: true,
        companyAsset: null,
        renewalCancelled: false,
      }),
    ).toBe('RECORD_FIELDS_NOT_ALLOWED');
    expect(
      closureRefusal({
        outcome: 'FALSE_ALARM',
        documentCount: 0,
        amountMinor: 1n,
        costCenterChosen: false,
        hasVendor: true,
        companyAsset: null,
        renewalCancelled: false,
      }),
    ).toBe('RECORD_FIELDS_NOT_ALLOWED');
    expect(
      closureRefusal({
        outcome: 'REPORT_ONLY',
        documentCount: 0,
        amountMinor: null,
        costCenterChosen: true,
        hasVendor: true,
        companyAsset: null,
        renewalCancelled: false,
      }),
    ).toBe('RECORD_FIELDS_NOT_ALLOWED');
  });

  it('records money only with a proof of payment (R-45): with none it can only be a report', () => {
    expect(closureRefusal(spent)).toBeNull();
    expect(closureRefusal({ ...spent, documentCount: 0 })).toBe('DOCUMENT_REQUIRED');
  });

  it('wants an amount above nothing and a vendor to book it to', () => {
    expect(closureRefusal({ ...spent, amountMinor: null })).toBe('RECORD_FIELDS_MISSING');
    expect(closureRefusal({ ...spent, costCenterChosen: false })).toBe('RECORD_FIELDS_MISSING');
    expect(closureRefusal({ ...spent, amountMinor: 0n })).toBe('AMOUNT_INVALID');
    expect(closureRefusal({ ...spent, amountMinor: -5n })).toBe('AMOUNT_INVALID');
    expect(closureRefusal({ ...spent, hasVendor: false })).toBe('NO_VENDOR');
  });
});

describe('the account a case outside the process is about (QĐ-98h: one case is open for each account of a vendor)', () => {
  const base = {
    vendorId: 'v-1',
    identity: null as string | null,
    employeeId: null as string | null,
    discrepancyId: 'd-1',
  };

  it('is the identifier at the vendor, lower-cased and trimmed, so that the same account written twice is one', () => {
    expect(openCaseKeyOf({ ...base, identity: ' Twice@Gmail.com ' })).toBe('v-1:twice@gmail.com');
    expect(openCaseKeyOf({ ...base, identity: 'twice@gmail.com' })).toBe('v-1:twice@gmail.com');
  });

  it('is the person when only the person is known, and the difference itself when nothing says which account it is', () => {
    expect(openCaseKeyOf({ ...base, employeeId: 'e-1' })).toBe('v-1:employee:e-1');
    expect(openCaseKeyOf(base)).toBe('v-1:discrepancy:d-1');
  });

  it('is told apart by vendor, and a difference with no vendor is of no vendor', () => {
    expect(openCaseKeyOf({ ...base, vendorId: 'v-2', identity: 'a@x.vn' })).not.toBe(
      openCaseKeyOf({ ...base, identity: 'a@x.vn' }),
    );
    expect(openCaseKeyOf({ ...base, vendorId: null, identity: 'CODEX' })).toBe('no-vendor:codex');
  });
});

describe('how a case on a company asset is revoked (QĐ-104j, US-13-05 AC-20, AC-24, AC-25)', () => {
  const revoked = {
    outcome: 'REVOKED' as const,
    documentCount: 1,
    amountMinor: null,
    costCenterChosen: false,
    hasVendor: false,
    companyAsset: true as boolean | null,
    renewalCancelled: true,
  };

  it('closes a case on a company asset with the renewal cancelled and a proof of it', () => {
    expect(closureRefusal(revoked)).toBeNull();
  });

  it('refuses a case that is not on a company asset, or that was opened before the question was asked', () => {
    expect(closureRefusal({ ...revoked, companyAsset: false })).toBe('REVOKE_NOT_ALLOWED');
    expect(closureRefusal({ ...revoked, companyAsset: null })).toBe('REVOKE_NOT_ALLOWED');
  });

  it('wants the renewal cancelled and a proof of it, and no money', () => {
    expect(closureRefusal({ ...revoked, renewalCancelled: false })).toBe('REVOKE_EVIDENCE_MISSING');
    expect(closureRefusal({ ...revoked, documentCount: 0 })).toBe('REVOKE_EVIDENCE_MISSING');
    expect(closureRefusal({ ...revoked, amountMinor: 5n })).toBe('RECORD_FIELDS_NOT_ALLOWED');
    expect(closureRefusal({ ...revoked, costCenterChosen: true })).toBe('RECORD_FIELDS_NOT_ALLOWED');
  });

  it('lets no other outcome say the renewal was cancelled', () => {
    expect(closureRefusal({ ...revoked, outcome: 'REPORT_ONLY', documentCount: 0 })).toBe('RECORD_FIELDS_NOT_ALLOWED');
  });
});
