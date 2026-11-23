import { compareSeatLockOrder, type SeatLockKey } from './seat-lock-order';

describe('compareSeatLockOrder', () => {
  const key = (assignmentId: string, subscriptionId: string | null): SeatLockKey => ({ assignmentId, subscriptionId });

  it('orders by subscription first, a seat with no subscription before the others, then by assignment', () => {
    const seats = [key('z-1', 'sub-b'), key('a-2', 'sub-a'), key('a-1', 'sub-a'), key('n-1', null)];

    expect([...seats].sort(compareSeatLockOrder).map((seat) => seat.assignmentId)).toEqual([
      'n-1',
      'a-1',
      'a-2',
      'z-1',
    ]);
  });

  it('compares as plain text, not by the locale: upper case before lower case, whatever the language of the machine', () => {
    expect(compareSeatLockOrder(key('B', 'sub'), key('a', 'sub'))).toBeLessThan(0);
    expect(compareSeatLockOrder(key('a', 'sub'), key('a', 'sub'))).toBe(0);
    expect(compareSeatLockOrder(key('b', 'sub'), key('a', 'sub'))).toBeGreaterThan(0);
  });
});
