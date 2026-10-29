/** Why the policy of a personnel write refuses the actor, before anything is judged about the event itself. */
export type PersonnelAccessProblem =
  /** The actor is not the Super Admin (or an operator on a person who does not hold that role): no write of an event. */
  | 'FORBIDDEN'
  /** The Super Admin records, changes or handles something about themselves: only the controlled procedure may (`QĐ-87c`). */
  | 'SELF_CHANGE_FORBIDDEN';

/**
 * The actor may not write the event or handle the notice (F13, F19). It is raised by the policy of each capability at the service,
 * so a route that forgot its guard is still closed. The same error is shared by the transfer, the long leave, the departure and the
 * notices of the heads; each capability maps it to the same two answers.
 */
export class PersonnelAccessRefusedError extends Error {
  constructor(readonly problem: PersonnelAccessProblem) {
    super(`The personnel write was refused (${problem}).`);
    this.name = 'PersonnelAccessRefusedError';
  }
}
