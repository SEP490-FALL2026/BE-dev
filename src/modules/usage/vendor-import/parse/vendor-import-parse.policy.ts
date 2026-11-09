import { isBusinessDate, type BusinessDate } from '../../../../core/business-date';
import { looksLikeSecret, normalizeAccountIdentifier } from '../../../licensing/public/account-identifier.policy';
import type { UsageIdentifierType } from '../../vendor-source/vendor-source.types';
import {
  MAX_DAYS_PER_ROW,
  MAX_ROW_ERRORS,
  MAX_UNMAPPED_EVENT_TYPES,
  type CoverageWindow,
  type ReportDay,
  type ReportRow,
  type RowError,
} from '../vendor-import.types';
import { judgeDayInWindow, resolveWindow } from './coverage-window.policy';
import { readCsvReport } from './csv-report.policy';
import { readJsonReport } from './json-report.policy';
import type { ParsedReport, ParseInput, RawReport, RawReportRow, ReadingSource } from './vendor-import-parse.types';

/** What is kept in place of an identifier that has the shape of a secret: the row is wrong and the value is never shown (`SEC-03`). */
export const MASKED_IDENTIFIER = '***';

/** The identifier as it is compared: an email or a username is the same in any case, an account id is exactly as the vendor wrote it. */
export function normalizeIdentifier(raw: string, type: UsageIdentifierType): string {
  return type === 'ACCOUNT_ID' ? raw.normalize('NFKC').trim() : normalizeAccountIdentifier(raw);
}

/** The day a cell names: `2026-06-01`, or a date with a time after it (the date as written); null when it is not a date. */
function dayOf(text: string): BusinessDate | null {
  const date = /^\d{4}-\d{2}-\d{2}/.test(text.trim()) ? text.trim().slice(0, 10) : null;

  return date !== null && isBusinessDate(date) ? date : null;
}

/** Whether the row names no date, no last activity and no event: it only says the person is there. */
function isListedOnly(raw: RawReportRow): boolean {
  return raw.activeDates.length === 0 && raw.lastActivityDate === null && raw.events.length === 0;
}

/** The identifier of a row as it is kept (masked when empty or a secret), as it is compared, and what is wrong with it. */
function identifierOf(
  raw: RawReportRow,
  source: ReadingSource,
  seen: Set<string>,
): { shown: string; normalized: string; errors: RowError[] } {
  const errors: RowError[] = [];
  const empty = raw.identifier.trim() === '';
  const secret = !empty && looksLikeSecret(raw.identifier);
  if (empty) errors.push({ code: 'IDENTIFIER_EMPTY' });
  if (secret) errors.push({ code: 'IDENTIFIER_LOOKS_LIKE_SECRET' });
  if (empty || secret) return { shown: MASKED_IDENTIFIER, normalized: MASKED_IDENTIFIER, errors };

  const normalized = normalizeIdentifier(raw.identifier, source.identifierType).slice(0, 320);
  if (source.reportShape === 'AGGREGATE' && !raw.notAPerson) {
    if (seen.has(normalized)) errors.push({ code: 'IDENTIFIER_DUPLICATE' });
    seen.add(normalized);
  }

  return { shown: raw.identifier.trim().slice(0, 320), normalized, errors };
}

/** The days a row names, sorted by the template, and the faults of its dates and event types. */
function daysOf(raw: RawReportRow, source: ReadingSource): { days: ReportDay[]; errors: RowError[] } {
  const days: ReportDay[] = [];
  const errors: RowError[] = [];
  const listed = (values: readonly string[], basis: ReportDay['basis']) => {
    for (const value of values) {
      const date = dayOf(value);
      if (date === null) errors.push({ code: 'DATE_INVALID' });
      else days.push({ date, eventClass: 'VALUE', basis });
    }
  };
  listed(raw.activeDates, 'ACTIVE_DATE');
  listed(raw.lastActivityDate === null ? [] : [raw.lastActivityDate], 'LAST_ACTIVITY');

  for (const event of raw.events) {
    const date = dayOf(event.date);
    const type = event.eventType.trim();
    if (date === null) errors.push({ code: 'DATE_INVALID' });
    if (type === '') errors.push({ code: 'EVENT_TYPE_MISSING' });
    if (date === null || type === '') continue;
    const mapped = source.template.eventClasses[type] ?? source.template.eventClasses[type.toLowerCase()];
    if (mapped === 'IGNORED') continue;
    days.push(
      mapped === undefined
        ? { date, eventClass: null, eventType: type.slice(0, 200), basis: 'ACTIVE_DATE' }
        : { date, eventClass: mapped, basis: 'ACTIVE_DATE' },
    );
  }

  return { days, errors };
}

/** The days of a row, each once: the same date, class and basis said twice is one day. */
function distinctDays(days: readonly ReportDay[]): ReportDay[] {
  const seen = new Set<string>();

  return days.filter((day) => {
    const key = `${day.date}|${day.eventClass ?? day.eventType ?? ''}|${day.basis}`;
    if (seen.has(key)) return false;
    seen.add(key);

    return true;
  });
}

function shapeRow(raw: RawReportRow, source: ReadingSource, seen: Set<string>): ReportRow {
  const identifier = identifierOf(raw, source, seen);
  const read = raw.notAPerson ? { days: [], errors: [] } : daysOf(raw, source);
  const days = distinctDays(read.days);
  const errors = days.length > MAX_DAYS_PER_ROW ? [...read.errors, { code: 'TOO_MANY_DAYS' }] : read.errors;

  return {
    lineNumber: raw.lineNumber,
    identifierRaw: identifier.shown,
    identifierNormalized: identifier.normalized,
    notAPerson: raw.notAPerson,
    days: days.length > MAX_DAYS_PER_ROW ? [] : days,
    errors: [...identifier.errors, ...errors].slice(0, MAX_ROW_ERRORS),
  };
}

/** Judges the days of each row against the window, and keeps a person who is only listed as one appearance on the last day of the window. */
function judgeAgainstWindow(rows: readonly ReportRow[], listed: ReadonlySet<ReportRow>, window: CoverageWindow): void {
  for (const row of rows) {
    for (const day of row.days) {
      const verdict = judgeDayInWindow({ date: day.date, basis: day.basis }, window);
      if (verdict && row.errors.length < MAX_ROW_ERRORS) row.errors.push({ code: verdict, detail: day.date });
    }
    if (row.errors.length === 0 && row.days.length === 0 && !row.notAPerson && listed.has(row)) {
      row.days.push({ date: window.to, eventClass: 'AUTH_ONLY', basis: 'ACTIVE_DATE' });
    }
  }
}

/**
 * Reads a report of a source into rows and the window it covers (`FR-4.3`, `FR-4.10`, `FR-4.11`): the file by its format, each row by the
 * template of the source, then the days of each row against the window. A row with any fault is `INVALID` as a whole; a row that names no
 * date at all (a member listed, a person with no activity) is kept as one appearance on the last day of the window, which counts as being
 * seen and never as activity. Throws UsageImportFileError.
 */
export function parseReport(input: ParseInput): ParsedReport {
  const raw: RawReport = input.format === 'JSON' ? readJsonReport(input.text) : readCsvReport(input.text, input.source);
  const seen = new Set<string>();
  const rows = raw.rows.map((row) => shapeRow(row, input.source, seen));
  const listed = new Set(raw.rows.flatMap((row, index) => (isListedOnly(row) ? [rows[index]] : [])));

  const typed = Boolean(input.declared.from || input.declared.to);
  const { window, warnings } = resolveWindow({
    declared: typed ? input.declared : (raw.window ?? {}),
    rows,
    today: input.today,
    maxHistoryDays: input.source.capabilities.maxHistoryDays,
  });
  judgeAgainstWindow(rows, listed, window);

  const unmapped = rows.flatMap((row) =>
    row.days.flatMap((day) => (day.eventClass === null && day.eventType ? [day.eventType] : [])),
  );

  return {
    rows,
    window,
    warnings,
    application: raw.application,
    unmappedEventTypes: [...new Set(unmapped)].sort().slice(0, MAX_UNMAPPED_EVENT_TYPES),
  };
}
