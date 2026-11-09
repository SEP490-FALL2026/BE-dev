/**
 * A transfer was refused. `code` is the semantic reason (`DEPARTMENT_TRANSFER.<code>` on the wire, the status is the mapper's) and
 * `details` carries only what a person needs to put it right: a day, a name, the part of the basis that is missing.
 */
export class TransferRefusedError extends Error {
  constructor(
    readonly code: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(`The transfer was refused (${code}).`);
    this.name = 'TransferRefusedError';
  }
}
