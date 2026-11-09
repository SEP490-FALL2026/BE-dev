import { createHash } from 'node:crypto';
import { addDays, businessDateAt, type BusinessDate } from '../../../core/business-date';
import { instantAtWallClock } from '../../../core/working-days';
import type { AiToolKey } from '../allowlist/allowlist.policy';
import type { RejectionReason } from '../intake-gate/intake-rejection.repo';

/** How far ahead of the server clock a tool's own clock may be before what it says is not believed. */
export const CLOCK_SKEW_MS = 5 * 60 * 1000;

export type UsageCoverageName = 'COVERED' | 'PARTIAL' | 'NOT_OBSERVABLE';

export interface UsageToolInput {
  tool: AiToolKey;
  coverage: UsageCoverageName;
  responses: number;
  totalTokens: number;
}

export interface UsageDayInput {
  date: BusinessDate;
  tools: readonly UsageToolInput[];
}

export interface AcceptedUsageRow {
  tool: AiToolKey;
  applicationId: string;
  coverage: UsageCoverageName;
  responses: number;
  totalTokens: number;
  contentHash: string;
}

export interface DayVerdict {
  date: BusinessDate;
  /** Why the whole day is refused; null when its rows may be kept. */
  reason: RejectionReason | null;
  rows: AcceptedUsageRow[];
}

export interface DayEvaluationInput {
  generatedAt: Date;
  now: Date;
  /** The window the server accepts data from (`sessionWindowOf`); a machine that accepts nothing has no start. */
  acceptFromAt: Date | null;
  acceptUntilAt: Date | null;
  timeZone: string;
  days: readonly UsageDayInput[];
  allowedOn(date: BusinessDate): ReadonlyMap<AiToolKey, string>;
}

/** What identifies the content of a tool's day, so the same build sent twice is told apart from a different one with the same time. */
export const contentHashOf = (tool: Pick<UsageToolInput, 'coverage' | 'responses' | 'totalTokens'>): string =>
  createHash('sha256').update(`${tool.coverage}|${tool.responses}|${tool.totalTokens}`).digest('hex');

/**
 * Judges every day of a batch, in a fixed order (`US-09-05` AC-3, AC-9, AC-14; `US-09-01` AC-10; `US-09-03` AC-3): a clock ahead of the
 * server, a day outside the window of the machine, a tool not on the allowlist that day, a coverage the window cannot support. A
 * day with any problem is refused whole, with one reason; the others go on. Pure: the window and the allowlist come in as facts.
 */
export function evaluateDays(input: DayEvaluationInput): DayVerdict[] {
  const futureClock = input.generatedAt.getTime() > input.now.getTime() + CLOCK_SKEW_MS;
  const upper = new Date(Math.min(input.acceptUntilAt?.getTime() ?? Infinity, input.generatedAt.getTime()));
  const firstDay = input.acceptFromAt ? businessDateAt(input.acceptFromAt, input.timeZone) : null;
  const lastDay = businessDateAt(upper, input.timeZone);

  return input.days.map((day) => {
    const refused = (reason: RejectionReason): DayVerdict => ({ date: day.date, reason, rows: [] });
    if (futureClock) return refused('FUTURE_GENERATED_AT');
    if (firstDay === null || day.date < firstDay || day.date > lastDay) return refused('OUTSIDE_WINDOW');
    const allowed = input.allowedOn(day.date);
    if (day.tools.some((tool) => !allowed.has(tool.tool))) return refused('NOT_IN_ALLOWLIST');
    const dayStart = instantAtWallClock({ date: day.date, msOfDay: 0 }, input.timeZone);
    const dayEnd = instantAtWallClock({ date: addDays(day.date, 1), msOfDay: 0 }, input.timeZone);
    const wholeDayInWindow = input.acceptFromAt !== null && dayStart >= input.acceptFromAt && dayEnd <= upper;
    const badCoverage = day.tools.some(
      (tool) =>
        (tool.coverage === 'NOT_OBSERVABLE' && (tool.responses !== 0 || tool.totalTokens !== 0)) ||
        (tool.coverage === 'COVERED' && !wholeDayInWindow),
    );
    if (badCoverage) return refused('INVALID_COVERAGE');

    return {
      date: day.date,
      reason: null,
      rows: day.tools.map((tool) => ({
        tool: tool.tool,
        applicationId: allowed.get(tool.tool) as string,
        coverage: tool.coverage,
        responses: tool.responses,
        totalTokens: tool.totalTokens,
        contentHash: contentHashOf(tool),
      })),
    };
  });
}
