import { addDays, type BusinessDate } from '../../../core/business-date';
import { workingDaysBetween, type NonWorkingDates } from '../../../core/working-days';

/**
 * The SLA of the revocations of a departure or a transfer (SPEC P22, R5 E3, E7, `QĐ-110c`): a figure of operation, not a KPI. A unit is one departure
 * (an offboarding case) or one transfer: the window of its revocations opens the day after the last working day, or the day after the grace, and the
 * IT Admin has until `dueOn` (the first working day of the window, `DEPARTURE_REVOCATION_WORKING_DAYS`) to take every right away. It is on time when
 * its last task completes by then. Pure: no store, no clock.
 */
export type SlaSource = 'OFFBOARDING' | 'TRANSFER';

export interface SlaUnit {
  source: SlaSource;
  id: string;
  departmentId: string | null;
  /** The first day of the window of the revocations. */
  startOn: BusinessDate;
  /** The day the IT Admin has until: the stored deadline of a departure, or the one worked out the same way for a transfer (its tasks have none, D-99). */
  dueOn: BusinessDate;
  /** A right of the person is left with no completed task, whether or not a task was opened for it and whatever the day (`QĐ-110c`); always false for a transfer. */
  rightsLeft: boolean;
}

export type SlaTaskStatus = 'QUEUED' | 'RETRY_SCHEDULED' | 'IN_PROGRESS' | 'FAILED' | 'COMPLETED';

/** A task of revocation the unit opened that is still to be done or was completed. A task cancelled or closed as failed is not one of them. */
export interface SlaTask {
  status: SlaTaskStatus;
  completedOn: BusinessDate | null;
  responsibleEmployeeId: string | null;
}

export interface SlaContext {
  today: BusinessDate;
  nonWorking: NonWorkingDates;
  /** The departures past their deadline with a right left without a completed task: the very set the list of departures gives for `revocationOverdue=true`. */
  lateCaseIds: ReadonlySet<string>;
}

/** `FINISHED`: every task is done. `OVERDUE_OPEN`: past the deadline with something left. `OPEN`: still in time, or with nothing to measure yet. */
export interface SlaOutcome {
  unit: SlaUnit;
  state: 'FINISHED' | 'OVERDUE_OPEN' | 'OPEN';
  completedOn: BusinessDate | null;
  onTime: boolean | null;
  /** The working days of the window it took, the first one counted as day 1; 0 when it was done before the window opened. */
  workingDays: number | null;
  /** The IT Admin the tasks were given to: the first one they name; none when no task names one. */
  itAdminId: string | null;
}

export function outcomeOf(unit: SlaUnit, tasks: readonly SlaTask[], context: SlaContext): SlaOutcome {
  const completed = tasks.filter((task) => task.status === 'COMPLETED');
  const stillOpen = tasks.length - completed.length;
  // A departure whose case is in the set has a right left without a completed task, whether or not a task was opened for it (QĐ-110c).
  const late = unit.source === 'OFFBOARDING' && context.lateCaseIds.has(unit.id);
  const itAdminId = tasks.map((task) => task.responsibleEmployeeId).find((id) => id !== null) ?? null;
  const base = { unit, itAdminId };

  // Finished only when no right is left, before the deadline as after it: a day that passes must never turn a finished unit into an overdue one.
  if (completed.length > 0 && stillOpen === 0 && !late && !unit.rightsLeft) {
    const completedOn = completed.reduce(
      (last, task) => (task.completedOn !== null && task.completedOn > last ? task.completedOn : last),
      '0000-00-00',
    );

    return {
      ...base,
      state: 'FINISHED',
      completedOn,
      onTime: completedOn <= unit.dueOn,
      workingDays: workingDaysBetween(addDays(unit.startOn, -1), completedOn, context.nonWorking),
    };
  }
  // A transfer is overdue by its open tasks (the sweeper opens one for every right); a departure by the same reading as the list of departures.
  const overdue = context.today > unit.dueOn && (unit.source === 'OFFBOARDING' ? late : stillOpen > 0);

  return { ...base, state: overdue ? 'OVERDUE_OPEN' : 'OPEN', completedOn: null, onTime: null, workingDays: null };
}

/** The median of a list; null for none, the mean of the two in the middle for an even count. */
export function medianOf(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export interface SlaFigures {
  completed: number;
  onTime: number;
  overdueOpen: number;
  medianWorkingDays: number | null;
  /** The share of the units judged (finished, or open past the deadline) that were on time, between 0 and 1; null when none was judged. */
  onTimeRate: number | null;
}

export function summaryOf(outcomes: readonly SlaOutcome[]): SlaFigures {
  const finished = outcomes.filter((outcome) => outcome.state === 'FINISHED');
  const onTime = finished.filter((outcome) => outcome.onTime).length;
  const overdueOpen = outcomes.filter((outcome) => outcome.state === 'OVERDUE_OPEN').length;
  const judged = finished.length + overdueOpen;

  return {
    completed: finished.length,
    onTime,
    overdueOpen,
    medianWorkingDays: medianOf(finished.flatMap((outcome) => outcome.workingDays ?? [])),
    onTimeRate: judged === 0 ? null : onTime / judged,
  };
}

export type SlaGroupBy = 'itAdmin' | 'department';

export interface SlaRow extends SlaFigures {
  /** The IT Admin or the department; null for the units no task names an IT Admin for, or no department. */
  id: string | null;
}

/** The figures of each group, the groups with the most overdue first and then by id (the group with no id last), so the order never changes between two reads. */
export function rowsOf(outcomes: readonly SlaOutcome[], groupBy: SlaGroupBy): SlaRow[] {
  const groups = new Map<string | null, SlaOutcome[]>();
  for (const outcome of outcomes) {
    const key = groupBy === 'department' ? outcome.unit.departmentId : outcome.itAdminId;
    groups.set(key, [...(groups.get(key) ?? []), outcome]);
  }

  return [...groups]
    .map(([id, members]) => ({ id, ...summaryOf(members) }))
    .sort(
      (a, b) =>
        b.overdueOpen - a.overdueOpen ||
        (a.id === null ? 1 : 0) - (b.id === null ? 1 : 0) ||
        (a.id ?? '').localeCompare(b.id ?? ''),
    );
}

/** A new request of a person in the grace of their transfer (`limitExemption = TRANSFER_GRACE`): when it was sent and the day its grant was completed. */
export interface GraceReRequest {
  requesterEmployeeId: string;
  submittedOn: BusinessDate;
  grantedOn: BusinessDate | null;
}

export interface GraceWindow {
  employeeId: string;
  effectiveOn: BusinessDate;
  graceEndsOn: BusinessDate;
}

/**
 * How many of those requests are of a person in the grace of a transfer on the day they sent it, and how many of them were granted by the last day
 * of that grace, the last day included (R5 E7, the evidence of the five working days of `QĐ-110p`). A request that falls in no grace of its person is left out.
 */
export function transferReRequestsOf(
  requests: readonly GraceReRequest[],
  graces: readonly GraceWindow[],
): { total: number; provisionedWithinGrace: number } {
  let total = 0;
  let provisionedWithinGrace = 0;
  for (const request of requests) {
    const grace = graces.find(
      (window) =>
        window.employeeId === request.requesterEmployeeId &&
        window.effectiveOn <= request.submittedOn &&
        request.submittedOn <= window.graceEndsOn,
    );
    if (!grace) continue;
    total += 1;
    if (request.grantedOn !== null && request.grantedOn <= grace.graceEndsOn) provisionedWithinGrace += 1;
  }

  return { total, provisionedWithinGrace };
}
