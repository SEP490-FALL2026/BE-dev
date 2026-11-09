import { REQUESTABLE_KINDS, costsMoney, priceOf, submissionOf } from './requestable-software.policy';

describe('what a person may ask for from the catalog', () => {
  it('offers the three kinds of the baseline and no other', () => {
    expect([...REQUESTABLE_KINDS].sort()).toEqual(['INTERNAL', 'LICENSED', 'SAAS']);
  });

  it.each([
    ['SAAS', true],
    ['LICENSED', true],
    ['INTERNAL', false],
  ] as const)('says whether %s costs money', (kind, expected) => {
    expect(costsMoney(kind)).toBe(expected);
  });

  describe('whether a request can be sent (the finance setup gate)', () => {
    it.each(['SAAS', 'LICENSED'] as const)('blocks %s when the department has no Cost Center in use', (kind) => {
      expect(submissionOf(kind, false)).toEqual({ canSubmit: false, submitBlockedReason: 'FINANCE_SETUP_INCOMPLETE' });
    });

    it.each(['SAAS', 'LICENSED'] as const)('lets %s through when the department has one', (kind) => {
      expect(submissionOf(kind, true)).toEqual({ canSubmit: true, submitBlockedReason: null });
    });

    it.each([true, false])('never blocks internal software (Cost Center in use: %s)', (hasCostCenter) => {
      expect(submissionOf('INTERNAL', hasCostCenter)).toEqual({ canSubmit: true, submitBlockedReason: null });
    });
  });

  describe('whether the department can price the plan', () => {
    it('has no price for internal software, whatever subscription there is', () => {
      expect(priceOf('INTERNAL', 'MONTHLY')).toEqual({ status: 'NOT_APPLICABLE', missingReason: null });
      expect(priceOf('INTERNAL', undefined)).toEqual({ status: 'NOT_APPLICABLE', missingReason: null });
    });

    it.each(['SAAS', 'LICENSED'] as const)('misses the price of %s with no priced subscription', (kind) => {
      expect(priceOf(kind, undefined)).toEqual({ status: 'MISSING', missingReason: 'NO_PRICED_SUBSCRIPTION' });
    });

    it('misses the price when the cycle cannot be counted in months', () => {
      expect(priceOf('SAAS', 'OTHER')).toEqual({ status: 'MISSING', missingReason: 'CYCLE_UNKNOWN' });
    });

    it.each(['MONTHLY', 'QUARTERLY', 'ANNUAL', 'ONE_TIME'] as const)(
      'prices a plan billed %s (a perpetual purchase is one time, BR-MF1-07)',
      (cycle) => {
        expect(priceOf('LICENSED', cycle)).toEqual({ status: 'PRICED', missingReason: null });
      },
    );
  });
});
