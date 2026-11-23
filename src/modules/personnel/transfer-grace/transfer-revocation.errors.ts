export type TransferRevocationErrorCode = 'NOT_FOUND' | 'REVOCATION_NOT_DUE' | 'NOTHING_TO_REVOKE';

/**
 * Refusal when reopening failed revocations of a department transfer.
 */
export class TransferRevocationRefusedError extends Error {
  constructor(readonly code: TransferRevocationErrorCode) {
    super(`The transfer revocation was refused (${code}).`);
    this.name = 'TransferRevocationRefusedError';
  }
}
