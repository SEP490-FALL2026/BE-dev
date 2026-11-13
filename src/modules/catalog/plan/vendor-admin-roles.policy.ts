/**
 * How many of the other admins recorded for a plan still work as IT Admins, each person once, the one who leaves not counted (`QĐ-110k`). Nothing
 * left (0) means the plan can no longer be reached at the vendor; one left is only the flag a reader of the subscription sees.
 */
export function othersWorking(
  members: ReadonlyArray<{ employeeId: string }>,
  usable: ReadonlySet<string>,
  leavingEmployeeId: string,
): number {
  return new Set(members.map((member) => member.employeeId).filter((id) => id !== leavingEmployeeId && usable.has(id)))
    .size;
}
