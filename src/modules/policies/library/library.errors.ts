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
