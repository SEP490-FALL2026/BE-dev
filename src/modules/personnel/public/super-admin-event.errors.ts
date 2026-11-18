/**
 * The command did not write (not even the ticket), and says why with a stable word the operator can act on. The command's own
 * words are `TICKET_REFERENCE_INVALID`, `TICKET_PARAMETERS_DIFFER`, `APPROVER_IS_OPERATOR`, `OPERATOR_IS_SUBJECT`, `APPROVER_IS_SUBJECT`,
 * `SUBJECT_NOT_FOUND`, `SUBJECT_NOT_SUPER_ADMIN`, `BASIS_INVALID`, `NOTICE_NOT_ABOUT_SUBJECT`, `NOTICE_KIND_MISMATCH`, `RECORD_NOT_FOUND`,
 * `RECORD_NOT_ABOUT_SUBJECT` and `NOT_INSTALLED`; any other value is the code of the business rule of the event, written as the
 * application writes it (for example `DEPARTMENT_TRANSFER.NO_CHANGE`). None of them carries data but, for a refused successor, the
 * enumerated `reason`.
 */
export class SuperAdminEventRefusedError extends Error {
  /**
   * @param problem the stable word above.
   * @param reason the enumerated reason the business rule gave (for example `MANAGER_ROLE_REQUIRED` of a successor), or nothing; only a word
   *   of capitals and underscores, never a name, an email or a basis, so the command may print it.
   */
  constructor(
    readonly problem: string,
    readonly reason?: string,
  ) {
    super(`The command was refused (${problem}).`);
    this.name = 'SuperAdminEventRefusedError';
  }
}
