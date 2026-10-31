/** Three different people on K1 plans of one software is where a Team or Business plan is worth considering (`QĐ-54a`). */
export const K2_RECOMMENDATION_THRESHOLD = 3;

export interface K2Recommendation {
  code: 'CONSIDER_K2';
  k1Holders: number;
  threshold: number;
}

/** The suggestion to consider a K2 plan: from three different people on K1 plans; it blocks nothing (`US-04-02` AC-9). */
export function recommendK2(k1Holders: number): K2Recommendation | null {
  return k1Holders >= K2_RECOMMENDATION_THRESHOLD
    ? { code: 'CONSIDER_K2', k1Holders, threshold: K2_RECOMMENDATION_THRESHOLD }
    : null;
}
