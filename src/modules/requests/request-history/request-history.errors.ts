/** Why the history of the requests of a department is not read for the caller. */
export type RequestHistoryRefusal = 'OUT_OF_SCOPE' | 'DEPARTMENT_NOT_FOUND';

/**
 * The caller does not head the department today (`OUT_OF_SCOPE`), or the department does not exist (`DEPARTMENT_NOT_FOUND`). A head
 * reads only the department they head; a former head reads it no more.
 */
export class RequestHistoryRefusedError extends Error {
  constructor(readonly code: RequestHistoryRefusal) {
    super(
      code === 'OUT_OF_SCOPE'
        ? 'Only the head of the department today reads the requests of that department.'
        : 'The department does not exist.',
    );
    this.name = 'RequestHistoryRefusedError';
  }
}
