/**
 * The people a departure does not refuse yet (`QĐ-110k`): everyone who has no block, and whoever's block begins after `today` (a block refuses the first
 * day it begins). The flag of a plan falls from the block, before the person has left.
 */
export function notYetBlocked(
  people: ReadonlySet<string>,
  blockedFrom: ReadonlyMap<string, string>,
  today: string,
): Set<string> {
  return new Set([...people].filter((id) => (blockedFrom.get(id) ?? '9999-12-31') > today));
}

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

/** How many different admins recorded for a plan still work as IT Admins (`QĐ-110k`): the number the flag `vendorAdminsBelowMinimum` is judged by. */
export function workingAdminCount(members: ReadonlyArray<{ employeeId: string }>, usable: ReadonlySet<string>): number {
  return new Set(members.map((member) => member.employeeId).filter((id) => usable.has(id))).size;
}
