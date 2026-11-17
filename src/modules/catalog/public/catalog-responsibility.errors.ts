/** Why the responsibilities of an IT Admin are not handed over: the person who would take them is the same one, or not an IT Admin who works now. */
export type ResponsibilityHandoverProblem = 'SAME_EMPLOYEE' | 'TARGET_NOT_IT_ADMIN';

/** The handing over of the subscriptions and applications of an IT Admin was refused, and nothing was written. */
export class ResponsibilityHandoverRefusedError extends Error {
  constructor(readonly problem: ResponsibilityHandoverProblem) {
    super(`The responsibilities were not handed over (${problem}).`);
    this.name = 'ResponsibilityHandoverRefusedError';
  }
}
