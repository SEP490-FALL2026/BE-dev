import { closureRefusal, isReferred } from './invoice-discrepancy-closure.policy';

describe('what Finance may close a case of an invoice that differs with (RC-1, QĐ-111y, R-29)', () => {
  it('takes a difference of nothing or more for an explanation: the money may be the same, a seat bought for a reason', () => {
    expect(closureRefusal({ outcome: 'EXPLAINED', differenceMinor: 0n })).toBeNull();
    expect(closureRefusal({ outcome: 'EXPLAINED', differenceMinor: 640_000n })).toBeNull();
  });

  it('refuses a difference below nothing, whatever the outcome', () => {
    expect(closureRefusal({ outcome: 'EXPLAINED', differenceMinor: -1n })).toBe('DIFFERENCE_INVALID');
    expect(closureRefusal({ outcome: 'OUT_OF_PROCESS_SUSPECTED', differenceMinor: -640_000n })).toBe(
      'DIFFERENCE_INVALID',
    );
  });

  it('wants a difference above nothing for a suspicion: there is nothing to follow when no money is unaccounted for', () => {
    expect(closureRefusal({ outcome: 'OUT_OF_PROCESS_SUSPECTED', differenceMinor: 0n })).toBe('DIFFERENCE_INVALID');
    expect(closureRefusal({ outcome: 'OUT_OF_PROCESS_SUSPECTED', differenceMinor: 1n })).toBeNull();
  });

  it('sends a suspicion on to the review of the accounts at the vendor, and an explanation nowhere', () => {
    expect(isReferred('OUT_OF_PROCESS_SUSPECTED')).toBe(true);
    expect(isReferred('EXPLAINED')).toBe(false);
  });
});
