export type TransferRevocationErrorCode = 'NOT_FOUND' | 'REVOCATION_NOT_DUE' | 'NOTHING_TO_REVOKE';

/**
 * Refusal when reopening failed revocations of a department transfer. `NOT_FOUND` answers with the same code as the not found of the `transfer` capability
 * (`DEPARTMENT_TRANSFER.NOT_FOUND`) on purpose: this capability cannot import that one (it would close a cycle between the two), and the client sees one code.
 */
export class TransferRevocationRefusedError extends Error {
  constructor(readonly code: TransferRevocationErrorCode) {
    super(`The transfer revocation was refused (${code}).`);
    this.name = 'TransferRevocationRefusedError';
  }
}
