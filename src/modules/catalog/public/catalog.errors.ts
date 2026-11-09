/** Why a signed record could not be attached to the person who signed it; each is a stable word and none carries data. */
export type DocumentAttachProblem = 'NOT_FOUND' | 'ALREADY_ATTACHED' | 'NOT_READY_TO_ATTACH' | 'PURPOSE_MISMATCH';

/**
 * The catalog refused to attach a file: it is not the uploader's (or does not exist), it has an owner already, it is not
 * uploaded yet, or it is not a signed record. The caller maps the problem to its own answer.
 */
export class DocumentAttachRefusedError extends Error {
  constructor(readonly problem: DocumentAttachProblem) {
    super(`The document could not be attached (${problem}).`);
    this.name = 'DocumentAttachRefusedError';
  }
}
