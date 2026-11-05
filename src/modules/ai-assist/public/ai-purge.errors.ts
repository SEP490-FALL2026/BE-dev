/** Why the purge refuses; each is a stable word the operator can act on, and none carries data. */
export type AiPurgeProblem = 'OPERATOR_REQUIRED' | 'NOT_INSTALLED';

/** The purge did not write, and says why. */
export class AiPurgeRefusedError extends Error {
  constructor(readonly problem: AiPurgeProblem) {
    super(`The purge was refused (${problem}).`);
    this.name = 'AiPurgeRefusedError';
  }
}
