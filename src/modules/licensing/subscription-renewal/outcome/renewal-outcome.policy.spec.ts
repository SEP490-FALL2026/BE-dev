import { carriedPast, checkOutcome, realisedSavingsOf } from './renewal-outcome.policy';

describe('an outcome against the decision (US-11-03 AC-15, AC-18, US-11-05 AC-11, AC-12)', () => {
  const base = { decidedQuantity: null, purchasedQuantity: 100 };

  it('as decided records the period of the decision, and nothing for a cancellation', () => {
    expect(checkOutcome({ ...base, outcome: 'AS_DECIDED', decidedChoice: 'RENEW', nextQuantity: 100 })).toBeNull();
    expect(checkOutcome({ ...base, outcome: 'AS_DECIDED', decidedChoice: 'RENEW', nextQuantity: 90 })).toBe(
      'OUTCOME_MISMATCH',
    );
    expect(
      checkOutcome({ ...base, outcome: 'AS_DECIDED', decidedChoice: 'REDUCE', decidedQuantity: 88, nextQuantity: 88 }),
    ).toBeNull();
    expect(
      checkOutcome({ ...base, outcome: 'AS_DECIDED', decidedChoice: 'REDUCE', decidedQuantity: 88, nextQuantity: 100 }),
    ).toBe('OUTCOME_MISMATCH');
    expect(
      checkOutcome({
        ...base,
        outcome: 'AS_DECIDED',
        decidedChoice: 'REDUCE',
        decidedQuantity: 88,
        nextQuantity: null,
      }),
    ).toBe('OUTCOME_MISMATCH');
    expect(checkOutcome({ ...base, outcome: 'AS_DECIDED', decidedChoice: 'CANCEL', nextQuantity: null })).toBeNull();
    expect(checkOutcome({ ...base, outcome: 'AS_DECIDED', decidedChoice: 'CANCEL', nextQuantity: 5 })).toBe(
      'OUTCOME_MISMATCH',
    );
  });

  it('expects the number decided for a raise or a reduction, whatever the seats bought before (R2-3, SBF-20 §4.4 step 8)', () => {
    const raised = {
      ...base,
      outcome: 'AS_DECIDED' as const,
      decidedChoice: 'INCREASE' as const,
      decidedQuantity: 120,
    };
    expect(checkOutcome({ ...raised, nextQuantity: 120 })).toBeNull();
    expect(checkOutcome({ ...raised, nextQuantity: 100 })).toBe('OUTCOME_MISMATCH');
    expect(checkOutcome({ ...raised, nextQuantity: null })).toBe('OUTCOME_MISMATCH');
    // A renewal as it is that names its number (the one-write renewal) is held to it; one of before names none and keeps the seats bought.
    const renewed = { ...base, outcome: 'AS_DECIDED' as const, decidedChoice: 'RENEW' as const };
    expect(checkOutcome({ ...renewed, decidedQuantity: 100, nextQuantity: 100 })).toBeNull();
    expect(checkOutcome({ ...renewed, decidedQuantity: 100, nextQuantity: 90 })).toBe('OUTCOME_MISMATCH');
    expect(checkOutcome({ ...renewed, decidedQuantity: null, nextQuantity: 100 })).toBeNull();
    expect(checkOutcome({ ...renewed, decidedQuantity: null, nextQuantity: 90 })).toBe('OUTCOME_MISMATCH');
  });

  it('records what the vendor really did, with or without a period', () => {
    expect(
      checkOutcome({
        ...base,
        outcome: 'VENDOR_REFUSED',
        decidedChoice: 'REDUCE',
        decidedQuantity: 88,
        nextQuantity: null,
      }),
    ).toBeNull();
    expect(
      checkOutcome({ ...base, outcome: 'DIFFERENT', decidedChoice: 'REDUCE', decidedQuantity: 88, nextQuantity: 100 }),
    ).toBeNull();
  });
});

describe('the savings at renewal (FR-4.15, QĐ-66w, US-11-03 AC-3, AC-21)', () => {
  const period = (amountMinor: bigint, quantity: number, startDate = '2026-01-01', endDate = '2026-12-31') => ({
    unitPrice: { amountMinor, currency: 'USD' },
    quantity,
    billingCycle: 'ANNUAL',
    startDate,
    endDate,
  });
  const old = period(12_000n, 100);

  it('compares the totals of two periods of the same length', () => {
    expect(
      realisedSavingsOf({ outcome: 'AS_DECIDED', old, next: period(12_000n, 88, '2027-01-01', '2027-12-31') }),
    ).toEqual({ amountMinor: 144_000n, currency: 'USD' });
    expect(
      realisedSavingsOf({ outcome: 'AS_DECIDED', old, next: period(14_000n, 88, '2027-01-01', '2027-12-31') }),
    ).toBeNull();
    expect(
      realisedSavingsOf({ outcome: 'AS_DECIDED', old, next: period(12_500n, 88, '2027-01-01', '2027-12-31') }),
    ).toEqual({ amountMinor: 100_000n, currency: 'USD' });
    expect(
      realisedSavingsOf({ outcome: 'AS_DECIDED', old, next: period(12_000n, 100, '2027-01-01', '2027-12-31') }),
    ).toBeNull();
  });

  it('records nothing for an outcome that is not as decided, another currency, cycle or length', () => {
    const cheaper = period(10_000n, 88, '2027-01-01', '2027-12-31');
    expect(realisedSavingsOf({ outcome: 'DIFFERENT', old, next: cheaper })).toBeNull();
    expect(realisedSavingsOf({ outcome: 'AS_DECIDED', old, next: null })).toBeNull();
    expect(
      realisedSavingsOf({
        outcome: 'AS_DECIDED',
        old,
        next: { ...cheaper, unitPrice: { amountMinor: 1n, currency: 'EUR' } },
      }),
    ).toBeNull();
    expect(realisedSavingsOf({ outcome: 'AS_DECIDED', old, next: { ...cheaper, billingCycle: 'MONTHLY' } })).toBeNull();
    expect(realisedSavingsOf({ outcome: 'AS_DECIDED', old, next: { ...cheaper, endDate: '2027-06-30' } })).toBeNull();
  });
});

describe('the seats that go on into the new period when the renewal day ends some (R2-2, QĐ-106i(2))', () => {
  const seat = (id: string, validUntil: string | null, expectedEndDate: string | null) => ({
    id,
    validFrom: '2026-01-05',
    validUntil,
    expectedEndDate,
  });

  it('leaves on the old period a seat whose last day is the renewal day or before, and carries the others', () => {
    const seats = [
      seat('open', null, null),
      seat('ends-on-renewal-expected', null, '2026-12-31'),
      seat('ends-on-renewal-until', '2027-01-01', null),
      seat('ends-after', null, '2027-01-01'),
      seat('until-after', '2027-01-03', null),
      seat('expected-before', null, '2026-12-30'),
    ];

    expect(carriedPast(seats, '2026-12-31').map((s) => s.id)).toEqual(['open', 'ends-after', 'until-after']);
  });

  it('counts the earlier of the day before the end of the right and the expected end', () => {
    expect(carriedPast([seat('both', '2027-01-10', '2026-12-31')], '2026-12-31')).toEqual([]);
    expect(carriedPast([seat('both', '2027-01-01', '2027-02-01')], '2026-12-31')).toEqual([]);
    expect(carriedPast([seat('both', '2027-01-02', '2027-02-01')], '2026-12-31')).toHaveLength(1);
  });
});
