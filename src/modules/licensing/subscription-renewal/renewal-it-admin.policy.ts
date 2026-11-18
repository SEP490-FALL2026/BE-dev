/**
 * The IT Admin a renewal names (`QĐ-111g`, `BB-9`), among the two the data points to: the IT Admin responsible for the subscription, else
 * the one in charge of the department that owns it — either only while they are a usable IT Admin (`usableItAdminEmployeeIds`, one read of
 * `IdentityAccessApi.findUsableItAdminEmployeeIds` for both: a leaver whose account is not locked yet, a locked account and a lost role
 * do not count). Null when neither is usable; the caller then reads the first usable IT Admin, and only then, since the answer is almost
 * always one of the two. A subscription of the shared pool has no department and no renewal case, so it names nobody and keeps the old rule.
 */
export function renewalNamedItAdminOf(input: {
  responsibleItAdminEmployeeId: string | null;
  departmentItAdminEmployeeId: string | null;
  usableItAdminEmployeeIds: ReadonlySet<string>;
}): string | null {
  for (const named of [input.responsibleItAdminEmployeeId, input.departmentItAdminEmployeeId]) {
    if (named !== null && input.usableItAdminEmployeeIds.has(named)) return named;
  }

  return null;
}
