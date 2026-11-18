import { addDays, type BusinessDate } from '../../../core/business-date';

/** `RULE_SCHEDULE_G1_G2` and `RULE_SCHEDULE_G3_G4` are one of these. */
export type RuleSchedule = 'DAILY' | 'WEEKLY';

/** A run that has been `RUNNING` this long is taken to have died, and the next tick takes it over (`attempt + 1`). */
export const RUN_TAKEOVER_AFTER_MS = 2 * 60 * 60 * 1000;
/** A period gets at most this many attempts; after that it is left (the IT Admin sees the failed run). */
export const RUN_MAX_ATTEMPTS = 3;

/** The ISO week (Monday first) of a day, as `YYYY-Www`: the week belongs to the year that holds its Thursday. */
function isoWeekOf(day: BusinessDate): string {
  const date = new Date(`${day}T00:00:00.000Z`);
  const weekday = (date.getUTCDay() + 6) % 7;
  const thursday = new Date(`${addDays(day, 3 - weekday)}T00:00:00.000Z`);
  const year = thursday.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(year, 0, 4));
  const firstWeekday = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(4 - firstWeekday + 3);
  const week = 1 + Math.round((thursday.getTime() - firstThursday.getTime()) / (7 * 24 * 60 * 60 * 1000));

  return `${year}-W${String(week).padStart(2, '0')}`;
}

/** The key of the period a run covers: the day for a daily schedule, the ISO week for a weekly one. */
export function periodKeyOf(schedule: RuleSchedule, today: BusinessDate): string {
  return schedule === 'WEEKLY' ? isoWeekOf(today) : today;
}

/**
 * The key of a run asked for by hand (`POST /ghost-seat-rule-runs`): a key of its own for each instant, so a period the schedule
 * already ran does not stop it. What it makes stays unique all the same: an open recommendation is one per subscription or seat chain.
 */
export function manualPeriodKeyOf(now: Date): string {
  return `MANUAL-${now.toISOString()}`;
}

/** The name of the advisory lock one run of a set of rules holds, scheduled or by hand: two never run side by side. */
export function ruleRunLockName(organizationId: string, ruleSet: 'G1_G2' | 'G3_G4'): string {
  return `ghost-seat-rule-run:${organizationId}:${ruleSet}`;
}

/** Whether a run that already exists for the period may be taken over now (the claim is atomic; this is the same rule for a test). */
export function canTakeOver(
  run: { status: 'RUNNING' | 'COMPLETED' | 'FAILED'; startedAt: Date; attempt: number },
  now: Date,
): boolean {
  if (run.attempt >= RUN_MAX_ATTEMPTS) return false;
  if (run.status === 'FAILED') return true;

  return run.status === 'RUNNING' && now.getTime() - run.startedAt.getTime() >= RUN_TAKEOVER_AFTER_MS;
}

/** The schedule parameter as a schedule; anything else is the default (daily). */
export function scheduleOf(value: unknown): RuleSchedule {
  return value === 'WEEKLY' ? 'WEEKLY' : 'DAILY';
}
