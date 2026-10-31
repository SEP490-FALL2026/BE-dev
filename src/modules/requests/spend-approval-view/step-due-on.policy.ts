import { addDays, type BusinessDate } from '../../../core/business-date';
import { slaDueAt, wallClockAt, type NonWorkingDates } from '../../../core/working-days';

/** What the day a step is due is counted from: when it began and how many working days it may wait. */
export interface DueStep {
  createdAt: Date;
  slaWorkingDays: number;
}

/**
 * The days whose calendar must be read to count the deadline of every one of these steps: from the day the oldest began to a
 * margin past the latest deadline. A working day is at most a week of calendar days plus the days nobody works, so the margin is
 * generous (three calendar days and the long break of a holiday for each working day); a deadline that falls past it would
 * simply not know the days off beyond it.
 */
export function calendarWindowOf(
  steps: readonly DueStep[],
  timeZone: string,
): { from: BusinessDate; to: BusinessDate } | null {
  if (steps.length === 0) return null;
  const began = steps.map((step) => wallClockAt(step.createdAt, timeZone).date).sort();
  const longest = Math.max(...steps.map((step) => step.slaWorkingDays));

  return { from: began[0], to: addDays(began[began.length - 1], longest * 3 + 21) };
}

/** The business day a step is due: the day of its deadline in the time zone of the organization. */
export function dueOnOf(step: DueStep, nonWorkingDates: NonWorkingDates, timeZone: string): BusinessDate {
  return wallClockAt(slaDueAt(step.createdAt, step.slaWorkingDays, nonWorkingDates, timeZone), timeZone).date;
}
