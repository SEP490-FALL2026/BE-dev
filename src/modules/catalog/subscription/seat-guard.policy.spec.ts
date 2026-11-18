import { SubscriptionQuantityBelowOccupiedError } from './subscription.errors';
import { assertQuantityNotBelowOccupied } from './seat-guard.policy';

describe('the number of seats of a subscription never goes under the seats taken (US-04-03 AC-5, BR-27.5)', () => {
  it('refuses a number under the seats that are taken, and says how many are taken and what was asked', () => {
    expect(() => {
      assertQuantityNotBelowOccupied({ requested: 6, occupied: 8 });
    }).toThrow(new SubscriptionQuantityBelowOccupiedError(8, 6));
  });

  it.each([
    ['exactly the seats taken', 8, 8],
    ['more than the seats taken', 12, 8],
    ['a subscription nobody holds', 1, 0],
    ['no seat held at all and none asked', 0, 0],
  ])('accepts %s', (_name, requested, occupied) => {
    expect(() => {
      assertQuantityNotBelowOccupied({ requested, occupied });
    }).not.toThrow();
  });

  it('carries the figures of the refusal for the screen to show', () => {
    try {
      assertQuantityNotBelowOccupied({ requested: 2, occupied: 5 });
      throw new Error('should have refused');
    } catch (error) {
      expect(error).toBeInstanceOf(SubscriptionQuantityBelowOccupiedError);
      expect(error).toMatchObject({ occupied: 5, requested: 2 });
    }
  });
});
