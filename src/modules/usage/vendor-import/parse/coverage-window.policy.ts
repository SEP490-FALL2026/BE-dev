import { addDays, isBusinessDate, type BusinessDate } from '../../../../core/business-date';
import { UsageImportFileError } from '../vendor-import.errors';
import { MAX_WINDOW_DAYS, type CoverageWindow, type ReportRow } from '../vendor-import.types';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** The days from `from` to `to`, counted as `to - from`. */
export function daysBetween(from: BusinessDate, to: BusinessDate): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / MS_PER_DAY);
}

function declaredWindow(from: string | null | undefined, to: string | null | undefined): CoverageWindow {
  if (!from || !to) throw new UsageImportFileError('WINDOW_INVALID', { reason: 'INCOMPLETE' });
  if (!isBusinessDate(from) || !isBusinessDate(to)) {
    throw new UsageImportFileError('WINDOW_INVALID', { reason: 'NOT_A_DATE' });
  }

  return { from, to, basis: 'DECLARED' };
}

/** The first and the last day an event or a list of dates names; a report with no such day says nothing of what it covers. */
function derivedWindow(rows: readonly ReportRow[]): CoverageWindow {
  const dates = rows
    .filter((row) => row.errors.length === 0)
    .flatMap((row) => row.days.filter((day) => day.basis === 'ACTIVE_DATE').map((day) => day.date))
    .sort();
  if (dates.length === 0) throw new UsageImportFileError('WINDOW_REQUIRED');

  return { from: dates[0], to: dates[dates.length - 1], basis: 'DERIVED' };
}

function requireSensible(window: CoverageWindow, today: BusinessDate): void {
  if (window.from > window.to) throw new UsageImportFileError('WINDOW_INVALID', { reason: 'ORDER' });
  if (daysBetween(window.from, window.to) > MAX_WINDOW_DAYS) {
    throw new UsageImportFileError('WINDOW_INVALID', { reason: 'TOO_LONG', maxDays: MAX_WINDOW_DAYS });
  }
  if (window.to > addDays(today, 1)) throw new UsageImportFileError('WINDOW_INVALID', { reason: 'IN_THE_FUTURE' });
}

/**
 * The window the report covers (`INV-10`, `FR-4.3`): the one the IT Admin or the file declares, else the first and the last day the report
 * names. A report that gives only the last activity of each person says nothing of what it covers, so the window must be declared. The
 * window is at most 366 days and does not end after tomorrow (the zone of the vendor may be ahead). Throws UsageImportFileError
 * (`WINDOW_REQUIRED`, `WINDOW_INVALID` with the reason).
 */
export function resolveWindow(input: {
  declared: { from?: string | null | undefined; to?: string | null | undefined };
  rows: readonly ReportRow[];
  today: BusinessDate;
  maxHistoryDays: number | null;
}): { window: CoverageWindow; warnings: string[] } {
  const { from, to } = input.declared;
  const window = from || to ? declaredWindow(from, to) : derivedWindow(input.rows);
  requireSensible(window, input.today);
  const tooLong = input.maxHistoryDays !== null && daysBetween(window.from, window.to) + 1 > input.maxHistoryDays;

  return { window, warnings: tooLong ? ['WINDOW_EXCEEDS_HISTORY_CAP'] : [] };
}

/**
 * Whether the window the IT Admin typed reaches past the one the file declares of itself (`FR-4.3`, `TC-2`): the days outside the file were never
 * reported, and a silence there would read as not used. The preview says so before anything is confirmed.
 */
export function typedWiderThanFile(
  window: CoverageWindow,
  file: { from: string | null; to: string | null } | null,
): boolean {
  if (!file?.from || !file.to || !isBusinessDate(file.from) || !isBusinessDate(file.to)) return false;

  return window.from < file.from || window.to > file.to;
}

/**
 * Judges a day against the window (`FR-4.10`): a day after the window is wrong, a day of activity before it is wrong, but the last activity
 * of a person before the window is a fact (an aggregate report says when a person was last seen, however long ago).
 */
export function judgeDayInWindow(
  day: { date: BusinessDate; basis: 'ACTIVE_DATE' | 'LAST_ACTIVITY' },
  window: CoverageWindow,
): 'DATE_AFTER_WINDOW' | 'DATE_BEFORE_WINDOW' | null {
  if (day.date > window.to) return 'DATE_AFTER_WINDOW';
  if (day.date < window.from && day.basis === 'ACTIVE_DATE') return 'DATE_BEFORE_WINDOW';

  return null;
}
