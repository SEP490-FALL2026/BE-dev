/**
 * Whether a department is left without a head by a head period that ended (`QĐ-110i`): nobody who works holds it today and no head is recorded
 * to follow. A recorded successor is not a gap to report: the requests that wait go to that head the day the period starts. The requests of
 * the department never turn into one-step requests because of it; they wait for the head (`routing.policy.ts`), and the Super Admin is told.
 */
export function leftWithoutHead(facts: { headWorks: boolean; successorRecorded: boolean }): boolean {
  return !facts.headWorks && !facts.successorRecorded;
}
