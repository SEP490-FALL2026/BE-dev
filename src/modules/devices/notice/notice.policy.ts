export interface NoticeFlags {
  includesToolStatus: boolean;
  requiresReacknowledgement: boolean;
}

/**
 * A version that starts collecting the status of tools where the version in force did not must be acknowledged again
 * (`US-09-03` AC-11): otherwise a holder would be collected from on a notice that never named it. The first version
 * has nobody to ask yet.
 */
export function addsToolStatusWithoutReacknowledgement(
  current: Pick<NoticeFlags, 'includesToolStatus'> | null,
  next: NoticeFlags,
): boolean {
  return current !== null && !current.includesToolStatus && next.includesToolStatus && !next.requiresReacknowledgement;
}
