import { SubscriptionQuantityBelowOccupiedError } from './subscription.errors';
import { K2_RECOMMENDATION_THRESHOLD, assertQuantityNotBelowOccupied, recommendK2 } from './seat-guard.policy';

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

describe('the suggestion to consider a K2 plan (US-04-02 AC-9, QĐ-54a)', () => {
  it('starts at three different people on K1 plans of the software', () => {
    expect(K2_RECOMMENDATION_THRESHOLD).toBe(3);
    expect(recommendK2(3)).toEqual({ code: 'CONSIDER_K2', k1Holders: 3, threshold: 3 });
    expect(recommendK2(10)).toEqual({ code: 'CONSIDER_K2', k1Holders: 10, threshold: 3 });
  });

  it.each([0, 1, 2])('says nothing for %s people', (holders) => {
    expect(recommendK2(holders)).toBeNull();
  });
});
