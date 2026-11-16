import {
  cancelProblem,
  choiceProblem,
  seatsNeededOf,
  targetOf,
  type SeatsNeededCounts,
} from './renewal-seats-needed.policy';

const counts = (extra: Partial<SeatsNeededCounts> = {}): SeatsNeededCounts => {
  const base = {
    heldPastRenewal: 0,
    pendingContinuations: 0,
    approvedAwaitingGrant: 0,
    activeSeatsToday: 0,
    openRequests: 0,
    vendorMinimumSeats: null,
    ...extra,
  };
  const seatsNeeded = seatsNeededOf(base);

  return { ...base, seatsNeeded, target: targetOf(seatsNeeded, base.vendorMinimumSeats) };
};

describe('the seats a subscription needs for its next period (QĐ-103e, QĐ-104d, QĐ-106i)', () => {
  describe('seatsNeededOf', () => {
    it('adds the seats held past the renewal day, the continuations waiting and the grants approved and waiting', () => {
      expect(seatsNeededOf({ heldPastRenewal: 4, pendingContinuations: 2, approvedAwaitingGrant: 1 })).toBe(7);
    });

    it('is zero when nothing is held past the renewal day and nothing waits (no buffer seat is added)', () => {
      expect(seatsNeededOf({ heldPastRenewal: 0, pendingContinuations: 0, approvedAwaitingGrant: 0 })).toBe(0);
    });
  });

  describe('targetOf', () => {
    it('is the seats needed when the vendor sets no minimum or the need is above it', () => {
      expect(targetOf(7, null)).toBe(7);
      expect(targetOf(7, 5)).toBe(7);
    });

    it('is the vendor minimum when the need is below it', () => {
      expect(targetOf(3, 10)).toBe(10);
    });

    it('is zero when nothing is needed, whatever the vendor minimum (the next period is then cancelled)', () => {
      expect(targetOf(0, 10)).toBe(0);
    });
  });

  describe('cancelProblem', () => {
    it('allows the cancellation only when the target, the seats in effect today and the open requests are all zero', () => {
      expect(cancelProblem(counts())).toBeNull();
    });

    it('refuses while a seat in effect today is left, even one that ends before the renewal day', () => {
      const ending = counts({ activeSeatsToday: 1 });
      expect(ending.target).toBe(0);
      expect(cancelProblem(ending)).toBe('CANCEL_NOT_ALLOWED');
    });

    it('refuses while a request for the plan is still open', () => {
      expect(cancelProblem(counts({ openRequests: 1 }))).toBe('CANCEL_NOT_ALLOWED');
    });

    it('refuses while the next period still needs seats', () => {
      expect(cancelProblem(counts({ heldPastRenewal: 2, activeSeatsToday: 2 }))).toBe('CANCEL_NOT_ALLOWED');
      expect(cancelProblem(counts({ approvedAwaitingGrant: 1 }))).toBe('CANCEL_NOT_ALLOWED');
    });
  });

  describe('choiceProblem', () => {
    const choice = (input: Parameters<typeof choiceProblem>[1], extra: Partial<SeatsNeededCounts> = {}) =>
      choiceProblem(counts({ heldPastRenewal: 6, activeSeatsToday: 6, ...extra }), input);

    it('accepts a renewal, a reduction or an increase that names exactly the target', () => {
      expect(choice({ choice: 'RENEW', quantity: 6, note: null })).toBeNull();
      expect(choice({ choice: 'REDUCE', quantity: 6, note: null })).toBeNull();
      expect(choice({ choice: 'INCREASE', quantity: 6, note: null })).toBeNull();
    });

    it('refuses a quantity other than the target', () => {
      expect(choice({ choice: 'RENEW', quantity: 7, note: null })).toBe('QUANTITY_NOT_SEATS_NEEDED');
      expect(choice({ choice: 'REDUCE', quantity: 5, note: null })).toBe('QUANTITY_NOT_SEATS_NEEDED');
    });

    it('asks for the vendor minimum as the quantity and for a note as its evidence', () => {
      const belowMinimum = { vendorMinimumSeats: 10 };
      expect(choice({ choice: 'RENEW', quantity: 6, note: 'seats' }, belowMinimum)).toBe('QUANTITY_NOT_SEATS_NEEDED');
      expect(choice({ choice: 'RENEW', quantity: 10, note: null }, belowMinimum)).toBe(
        'VENDOR_MINIMUM_EVIDENCE_REQUIRED',
      );
      expect(choice({ choice: 'RENEW', quantity: 10, note: '   ' }, belowMinimum)).toBe(
        'VENDOR_MINIMUM_EVIDENCE_REQUIRED',
      );
      expect(choice({ choice: 'RENEW', quantity: 10, note: 'Quote: min 10 seats' }, belowMinimum)).toBeNull();
    });

    it('needs no note when the vendor minimum is not above the need', () => {
      expect(choice({ choice: 'RENEW', quantity: 6, note: null }, { vendorMinimumSeats: 6 })).toBeNull();
    });

    it('refuses any choice but the cancellation when nothing is needed, the next period must be cancelled', () => {
      const nothing = { heldPastRenewal: 0, activeSeatsToday: 0 };
      expect(choice({ choice: 'RENEW', quantity: 1, note: null }, nothing)).toBe('QUANTITY_NOT_SEATS_NEEDED');
      expect(choice({ choice: 'REDUCE', quantity: 0, note: null }, nothing)).toBe('QUANTITY_NOT_SEATS_NEEDED');
      expect(choice({ choice: 'CANCEL', quantity: null, note: null }, nothing)).toBeNull();
    });

    it('judges a cancellation by the three conditions of cancelProblem, not by a quantity', () => {
      expect(choice({ choice: 'CANCEL', quantity: null, note: null })).toBe('CANCEL_NOT_ALLOWED');
      expect(
        choice(
          { choice: 'CANCEL', quantity: null, note: null },
          { heldPastRenewal: 0, activeSeatsToday: 0, openRequests: 2 },
        ),
      ).toBe('CANCEL_NOT_ALLOWED');
    });
  });
});
