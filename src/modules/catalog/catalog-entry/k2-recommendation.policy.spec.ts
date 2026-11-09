import { K2_RECOMMENDATION_THRESHOLD, recommendK2 } from './k2-recommendation.policy';

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
