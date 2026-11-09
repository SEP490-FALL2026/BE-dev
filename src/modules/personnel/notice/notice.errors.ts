/**
 * A notice of a department head was refused. `code` is the semantic reason (`PERSONNEL_NOTICE.<code>` on the wire, the status is the
 * mapper's) and `details` carries only what a person needs to put it right: the code of the notice that waits, the part of the basis
 * that is missing.
 */
export class NoticeRefusedError extends Error {
  constructor(
    readonly code: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(`The notice was refused (${code}).`);
    this.name = 'NoticeRefusedError';
  }
}
