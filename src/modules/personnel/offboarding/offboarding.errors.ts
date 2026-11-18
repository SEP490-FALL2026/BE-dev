/**
 * The record of a departure was refused. `code` is the semantic reason (`OFFBOARDING_CASE.<code>` on the wire, the status is the
 * mapper's) and `details` carries only what a person needs to put it right: a day, a count, the part of the basis that is missing.
 */
export class OffboardingRefusedError extends Error {
  constructor(
    readonly code: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(`The offboarding case was refused (${code}).`);
    this.name = 'OffboardingRefusedError';
  }
}
