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
  /** What the total rests on, from the base figures (QT 4.3); optional. */
  explanation: string | null;
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

/** A ceiling as the audit record shows it: the three parts, their total and the explanation. */
export interface CeilingFigures extends CeilingParts {
  explanation: string | null;
}

/** The ceilings whose parts or explanation differ between two divisions, by department: what the audit record shows before and after. */
export function changedCeilings(
  before: readonly StoredCeiling[],
  after: readonly (CeilingFigures & { departmentId: string })[],
): { departmentId: string; before: CeilingFigures | null; after: CeilingFigures | null }[] {
  const was = new Map(before.map((ceiling) => [ceiling.departmentId, ceiling]));
  const now = new Map(after.map((ceiling) => [ceiling.departmentId, ceiling]));
  const same = (a: CeilingFigures, b: CeilingFigures) =>
    a.signedCommitmentsMinor === b.signedCommitmentsMinor &&
    a.plannedSeatsMinor === b.plannedSeatsMinor &&
    a.priorityMinor === b.priorityMinor &&
    (a.explanation ?? null) === (b.explanation ?? null);
  const ids = [...new Set([...was.keys(), ...now.keys()])].sort();

  return ids.flatMap((departmentId) => {
    const a = was.get(departmentId) ?? null;
    const b = now.get(departmentId) ?? null;

    return a !== null && b !== null && same(a, b) ? [] : [{ departmentId, before: a, after: b }];
  });
}

/**
 * What an update of a cycle makes of it: the two deadlines (each the update gives, else the stored one), whether the annual ceiling
 * is a new one, and whether anything at all changes (an update that changes nothing is answered without a write or a record).
 */
export function planUpdate(
  update: { submissionDeadline?: string; decisionDeadline?: string; priorities?: string | null },
  stored: {
    submissionDeadline: string;
    decisionDeadline: string;
    annualCeilingMinor: bigint;
    priorities: string | null;
  },
  ceiling: bigint | undefined,
): { submission: string; decision: string; ceilingChanged: boolean; changes: boolean } {
  const submission = update.submissionDeadline ?? stored.submissionDeadline;
  const decision = update.decisionDeadline ?? stored.decisionDeadline;
  const ceilingChanged = ceiling !== undefined && ceiling !== stored.annualCeilingMinor;
  const priorities = update.priorities !== undefined ? update.priorities : stored.priorities;
  const changes =
    ceilingChanged ||
    submission !== stored.submissionDeadline ||
    decision !== stored.decisionDeadline ||
    priorities !== stored.priorities;

  return { submission, decision, ceilingChanged, changes };
}

/** A ceiling as the Audit Trail keeps it: every figure as text, the total and the explanation. */
export const ceilingAuditValue = (figures: CeilingFigures) => ({
  signedCommitmentsMinor: figures.signedCommitmentsMinor.toString(),
  plannedSeatsMinor: figures.plannedSeatsMinor.toString(),
  priorityMinor: figures.priorityMinor.toString(),
  totalMinor: ceilingTotal(figures).toString(),
  explanation: figures.explanation,
});

/**
 * Where a department may be made (`QĐ-104e(3)`, `R-I10`): while the cycle of the next year exists and was never published, the new
 * department takes effect on 1 January of that year. A cycle of this year does not open the window (no department is made in the
 * middle of a year); an organization with no cycle at all is still being installed.
 */
export function windowOf(input: {
  nextYear: number;
  nextCycle: { neverPublished: boolean } | null;
  anyCycle: boolean;
}): { kind: 'OPEN'; effectiveFrom: string } | { kind: 'CLOSED' } | { kind: 'NO_CYCLE_YET' } {
  if (input.nextCycle) {
    return input.nextCycle.neverPublished
      ? { kind: 'OPEN', effectiveFrom: `${input.nextYear}-01-01` }
      : { kind: 'CLOSED' };
  }

  return input.anyCycle ? { kind: 'CLOSED' } : { kind: 'NO_CYCLE_YET' };
}
