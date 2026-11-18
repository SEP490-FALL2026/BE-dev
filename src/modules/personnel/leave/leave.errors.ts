/**
 * A long leave was refused. `code` is the semantic reason (`LONG_LEAVE.<code>` on the wire, the status is the mapper's) and
 * `details` carries only what a person needs to put it right: a day, the part of the basis that is missing.
 */
export class LeaveRefusedError extends Error {
  constructor(
    readonly code: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(`The long leave was refused (${code}).`);
    this.name = 'LeaveRefusedError';
  }
}
