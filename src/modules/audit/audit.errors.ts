/** A programming error: an audit event that would store a secret. Never reaches a caller as data. */
export class UnsafeAuditPayloadError extends Error {
  constructor(readonly path: string) {
    super(`Audit payload contains a forbidden key at ${path}`);
    this.name = 'UnsafeAuditPayloadError';
  }
}
