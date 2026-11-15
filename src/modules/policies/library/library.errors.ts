import type { ContentRefusal } from './library-content.policy';

/** The code names no policy of the library (the set is fixed: no route creates one). */
export class PolicyNotFoundError extends Error {
  constructor() {
    super('No policy has this code.');
    this.name = 'PolicyNotFoundError';
  }
}

/** The policy has no published version with this number. */
export class PolicyVersionNotFoundError extends Error {
  constructor() {
    super('The policy has no published version with this number.');
    this.name = 'PolicyVersionNotFoundError';
  }
}

/** The version in force has no step with this code, so it asks no checklist there. */
export class PolicyStepNotFoundError extends Error {
  constructor() {
    super('The policy in force has no step with this code.');
    this.name = 'PolicyStepNotFoundError';
  }
}

/** There is no draft of the policy to read, delete or publish. */
export class PolicyDraftNotFoundError extends Error {
  constructor() {
    super('The policy has no draft.');
    this.name = 'PolicyDraftNotFoundError';
  }
}

/** The policy has no published version yet, so there is none to copy into a draft. */
export class PolicyNotPublishedError extends Error {
  constructor() {
    super('The policy has no published version.');
    this.name = 'PolicyNotPublishedError';
  }
}

/** The new text adds or takes away a decision step: the seven steps are fixed, each in the policy of its flow. */
export class PolicyStepSetFixedError extends Error {
  constructor(
    readonly added: readonly string[],
    readonly removed: readonly string[],
  ) {
    super('The decision steps of a policy are fixed: a version may change their words, not add or take away a step.');
    this.name = 'PolicyStepSetFixedError';
  }
}

/** The new text marks as answered by the system a question the system does not answer. */
export class PolicySystemItemUnknownError extends Error {
  constructor(readonly items: readonly string[]) {
    super(
      'A question the system answers must be one the version in force already had as such; any other question asks the person.',
    );
    this.name = 'PolicySystemItemUnknownError';
  }
}

/** The error that says why a new text of a policy was refused (`refuseContent`). */
export function contentRefusalError(refusal: ContentRefusal): Error {
  return refusal.reason === 'STEP_SET_FIXED'
    ? new PolicyStepSetFixedError(refusal.added, refusal.removed)
    : new PolicySystemItemUnknownError(refusal.items);
}
