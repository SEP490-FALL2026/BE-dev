/**
 * The rules of a budget cycle that need no database (`QĐ-103i`, `BR-MF4-01`, `BR-MF4-02`, `US-06-15`): which years can still be
 * written, whether a division of the annual ceiling can be published, and which departments hear about a publication.
 */

export interface CeilingParts {
  signedCommitmentsMinor: bigint;
  plannedSeatsMinor: bigint;
  priorityMinor: bigint;
}

export const ceilingTotal = (parts: CeilingParts): bigint =>
  parts.signedCommitmentsMinor + parts.plannedSeatsMinor + parts.priorityMinor;

/** A cycle of a year before the current one is read, never written (`QĐ-82l`(4), B7). */
export const isPastYear = (year: number, currentYear: number): boolean => year < currentYear;

export interface StoredCeiling extends CeilingParts {
  departmentId: string;
  totalMinor: bigint;
  publishedTotalMinor: bigint | null;
}

export type PublishVerdict =
  | { kind: 'OK'; totalMinor: bigint }
  | { kind: 'INCOMPLETE'; missingDepartmentIds: string[]; staleDepartmentIds: string[]; reserveMissing: boolean }
  | { kind: 'OVER_ANNUAL'; gapMinor: bigint };

/**
 * Whether the division can be published (`QĐ-103i`): every department of the year has a ceiling, none belongs to a department that
 * left the set, the shared-pool reserve was entered (an explicit zero counts), and the ceilings and the reserve add up to no more than
 * the annual ceiling (`R-I04`).
 */
export function judgePublish(input: {
  departmentIds: readonly string[];
  ceilings: readonly StoredCeiling[];
  reserveMinor: bigint | null;
  annualCeilingMinor: bigint;
}): PublishVerdict {
  const inSet = new Set(input.departmentIds);
  const given = new Set(input.ceilings.map((ceiling) => ceiling.departmentId));
  const missing = input.departmentIds.filter((id) => !given.has(id)).sort();
  const stale = input.ceilings
    .map((ceiling) => ceiling.departmentId)
    .filter((id) => !inSet.has(id))
    .sort();
  const reserveMissing = input.reserveMinor === null;
  if (missing.length > 0 || stale.length > 0 || reserveMissing) {
    return { kind: 'INCOMPLETE', missingDepartmentIds: missing, staleDepartmentIds: stale, reserveMissing };
  }
  const total = input.ceilings.reduce((sum, ceiling) => sum + ceiling.totalMinor, 0n) + (input.reserveMinor as bigint);
  if (total > input.annualCeilingMinor) return { kind: 'OVER_ANNUAL', gapMinor: total - input.annualCeilingMinor };

  return { kind: 'OK', totalMinor: total };
}

/** The departments whose ceiling the head is told about: the whole division at the first publication, then only those that changed. */
export const departmentsToTell = (ceilings: readonly StoredCeiling[]): string[] =>
  ceilings
    .filter((ceiling) => ceiling.publishedTotalMinor === null || ceiling.publishedTotalMinor !== ceiling.totalMinor)
    .map((ceiling) => ceiling.departmentId)
    .sort();

/** The cycle accepts the proposals of its year once it was published, and keeps accepting them while it is changed (`Q-02`). */
export const cycleAcceptsWork = (cycle: { firstPublishedAt: Date | null }): boolean => cycle.firstPublishedAt !== null;

/** The ceilings whose parts differ between two divisions, by department: what the audit record shows before and after. */
export function changedCeilings(
  before: readonly StoredCeiling[],
  after: readonly (CeilingParts & { departmentId: string })[],
): { departmentId: string; before: CeilingParts | null; after: CeilingParts | null }[] {
  const was = new Map(before.map((ceiling) => [ceiling.departmentId, ceiling]));
  const now = new Map(after.map((ceiling) => [ceiling.departmentId, ceiling]));
  const same = (a: CeilingParts, b: CeilingParts) =>
    a.signedCommitmentsMinor === b.signedCommitmentsMinor &&
    a.plannedSeatsMinor === b.plannedSeatsMinor &&
    a.priorityMinor === b.priorityMinor;
  const ids = [...new Set([...was.keys(), ...now.keys()])].sort();

  return ids.flatMap((departmentId) => {
    const a = was.get(departmentId) ?? null;
    const b = now.get(departmentId) ?? null;

    return a !== null && b !== null && same(a, b) ? [] : [{ departmentId, before: a, after: b }];
  });
}

/** The two deadlines a cycle has once an update is applied: each the update gives, else the stored one. */
export function deadlinesAfter(
  update: { submissionDeadline?: string; decisionDeadline?: string },
  stored: { submissionDeadline: string; decisionDeadline: string },
): { submission: string; decision: string } {
  return {
    submission: update.submissionDeadline ?? stored.submissionDeadline,
    decision: update.decisionDeadline ?? stored.decisionDeadline,
  };
}
