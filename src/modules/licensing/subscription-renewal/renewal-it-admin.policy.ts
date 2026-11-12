/**
 * The IT Admin a renewal concerns and who is told of its milestones (`QĐ-111g`, `BB-9`): the IT Admin responsible for the subscription while
 * they are still a usable IT Admin; otherwise the one in charge of the department that owns it, else the first usable IT Admin (the
 * `departmentFallback`, which the caller reads as it always did). Nobody when there is none. A subscription of the shared pool has no
 * department and no renewal case, so it keeps the old rule untouched.
 */
export function renewalItAdminOf(input: {
  responsibleItAdminEmployeeId: string | null;
  /** The one named is an IT Admin who works now (the test of `IdentityAccessApi.findUsableItAdminEmployeeIds`). */
  responsibleIsUsable: boolean;
  departmentFallback: string | null;
}): string | null {
  if (input.responsibleItAdminEmployeeId !== null && input.responsibleIsUsable)
    return input.responsibleItAdminEmployeeId;

  return input.departmentFallback;
}
