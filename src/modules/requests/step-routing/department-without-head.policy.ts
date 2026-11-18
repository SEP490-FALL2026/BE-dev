/**
 * Whether a department is left without a head by a head period that ended (`QĐ-110i`): nobody who works holds it today and no head is recorded
 * to follow. A recorded successor is not a gap to report: the requests that wait go to that head the day the period starts. A paid request or a
 * case B proposal of the department never turns into a one-step request because of it; it waits for the head (`routing.policy.ts`), and the Super
 * Admin is told. Free internal software is the exception: it needs nobody to decide it and goes to the IT Admin (`QĐ-111bc`, `needStepTarget`).
 */
export function leftWithoutHead(facts: { headWorks: boolean; successorRecorded: boolean }): boolean {
  return !facts.headWorks && !facts.successorRecorded;
}
