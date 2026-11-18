/**
 * A department head's read of one member was refused. `code` is the semantic reason (`DEPARTMENT_MEMBER.<code>` on the wire, the
 * status is the mapper's): `OUT_OF_SCOPE` when the caller does not head the department today; `NOT_FOUND` when the department, or
 * the person among its members today, does not exist: the two are not told apart.
 */
export class DepartmentMemberRefusedError extends Error {
  constructor(readonly code: 'OUT_OF_SCOPE' | 'NOT_FOUND') {
    super(`The read of the member was refused (${code}).`);
    this.name = 'DepartmentMemberRefusedError';
  }
}
