import {
  evidenceCutoff,
  valuesOfInvoiceDifference,
  valuesOfNoAssignment,
  valuesOfUnlistedTool,
  valuesOfUnmatchedIdentity,
} from './vendor-account-discrepancy.policy';

describe('what a difference of an account at the vendor keeps (SBF-08, RC-2)', () => {
  it('keeps, for an account with activity and no seat, what the company has (no seat) and what the vendor shows (the days)', () => {
    expect(valuesOfNoAssignment({ firstActivityDate: '2026-10-01', lastActivityDate: '2026-10-20' })).toEqual({
      internalValue: 'No seat on record',
      vendorValue: 'Active from 2026-10-01 to 2026-10-20',
    });
    expect(valuesOfNoAssignment({ firstActivityDate: '2026-10-05', lastActivityDate: '2026-10-05' }).vendorValue).toBe(
      'Active on 2026-10-05',
    );
  });

  it('keeps, for an identifier nobody owns, that no one has it, or that several could, and the identifier as the vendor wrote it', () => {
    expect(valuesOfUnmatchedIdentity({ reason: 'NOT_FOUND', candidateCount: 0, rawIdentifier: 'x@gmail.com' })).toEqual(
      {
        internalValue: 'No employee has this identifier',
        vendorValue: 'Account x@gmail.com',
      },
    );
    expect(valuesOfUnmatchedIdentity({ reason: 'AMBIGUOUS', candidateCount: 2, rawIdentifier: 'nguyen.a' })).toEqual({
      internalValue: '2 employees could have this identifier',
      vendorValue: 'Account nguyen.a',
    });
  });

  it('keeps, for an invoice Finance suspects, what was approved or bought and what the invoice says, the count and the price of one', () => {
    expect(
      valuesOfInvoiceDifference({
        quantity: { invoice: 12, expected: 10 },
        unitPrice: { invoice: '15.00 USD', expected: '15.00 USD' },
      }),
    ).toEqual({ internalValue: '10 at 15.00 USD', vendorValue: '12 at 15.00 USD' });
    expect(
      valuesOfInvoiceDifference({
        quantity: { invoice: 10, expected: null },
        unitPrice: { invoice: '18.00 USD', expected: null },
      }),
    ).toEqual({ internalValue: 'Not known', vendorValue: '10 at 18.00 USD' });
  });

  it('keeps, for a tool the collector sees that is not on the allowlist, the tool and nothing of any person', () => {
    expect(valuesOfUnlistedTool('CODEX')).toEqual({
      internalValue: 'Not on the allowlist of the collector',
      vendorValue: 'Tool CODEX was reported',
    });
  });

  it('deletes the evidence 24 months after its day, and clamps the day of a short month', () => {
    expect(evidenceCutoff('2026-11-15')).toBe('2024-11-15');
    expect(evidenceCutoff('2026-02-28')).toBe('2024-02-28');
    expect(evidenceCutoff('2028-02-29')).toBe('2026-02-28');
  });
});
