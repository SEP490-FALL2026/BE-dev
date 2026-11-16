import type { DecisionStepCode } from './policy-checklist.types';

/** A question the person answers has no answer, or an answer names a question the step does not have, a question twice, or answers the question of the system with a No (`QĐ-111ap`). */
export class PolicyChecklistIncompleteError extends Error {
  constructor(
    readonly stepCode: DecisionStepCode,
    readonly missing: readonly string[],
    readonly unexpected: readonly string[],
  ) {
    super('The checklist of the step is not answered in full.');
    this.name = 'PolicyChecklistIncompleteError';
  }
}

/** The policy of the step has a newer version in force than the one the person was shown: they read the questions again. */
export class PolicyVersionChangedError extends Error {
  constructor(
    readonly stepCode: DecisionStepCode,
    readonly policyVersionId: string,
    readonly versionNumber: number,
  ) {
    super('The policy of the step has a new version in force since the checklist was shown.');
    this.name = 'PolicyVersionChangedError';
  }
}

/** An answer is No, so the decision that goes on is locked: only a refusal or a return (or the reclaim of a seat) is left. */
export class PolicyChecklistHasNoError extends Error {
  constructor(
    readonly stepCode: DecisionStepCode,
    readonly items: readonly { code: string; text: string }[],
  ) {
    super('An answer of the checklist is No, so the decision cannot go on.');
    this.name = 'PolicyChecklistHasNoError';
  }
}

/** A refusal or a return gives a reason, and the answers give none to fill it in from. */
export class PolicyDecisionReasonRequiredError extends Error {
  constructor() {
    super('A refusal or a return gives its reason.');
    this.name = 'PolicyDecisionReasonRequiredError';
  }
}
