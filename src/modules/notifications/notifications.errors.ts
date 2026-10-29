/** A sealed outbox payload that does not open: an unknown key id, a ciphertext of another row, or one that was touched. */
export class PayloadDecryptionError extends Error {
  constructor() {
    super('The outbox payload could not be decrypted.');
    this.name = 'PayloadDecryptionError';
  }
}

/** The row names a template this build does not have (for example one written by a newer build). It can never be sent. */
export class UnknownEmailTemplateError extends Error {
  constructor(readonly template: string) {
    super(`Unknown email template: ${template}`);
    this.name = 'UnknownEmailTemplateError';
  }
}
