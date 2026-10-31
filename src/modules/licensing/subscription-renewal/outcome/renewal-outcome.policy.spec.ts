import type { HeldSeat } from '../subscription-renewal.types';
import { checkOutcome, realisedSavingsOf, seatsToCarry } from './renewal-outcome.policy';

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

describe('the seats carried to the new period (QĐ-35c, US-11-03 AC-2)', () => {
  const seat = (id: string, extra: Partial<HeldSeat>): HeldSeat => ({
    assignmentId: id,
    employeeId: id,
    kind: 'PERSONAL',
    validFrom: '2026-01-05',
    validUntil: null,
    expectedEndDate: null,
    liveRevocationSources: [],
    hasOpenTask: false,
    ...extra,
  });

  it('are those held on its first day', () => {
    const carried = seatsToCarry(
      [
        seat('open', {}),
        seat('ends-before', { validUntil: '2026-12-15' }),
        seat('ends-later', { validUntil: '2027-02-01' }),
        seat('expected-before', { expectedEndDate: '2026-12-31' }),
        seat('expected-on', { expectedEndDate: '2027-01-01' }),
        seat('starts-on', { validFrom: '2027-01-01' }),
      ],
      '2027-01-01',
    );

    expect(carried.map((s) => s.assignmentId)).toEqual(['open', 'ends-later', 'expected-on']);
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
