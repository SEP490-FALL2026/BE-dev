import { businessDateAt, isBusinessDate, type BusinessDate } from '../../../../core/business-date';
import { instantAtWallClock } from '../../../../core/working-days';
import { looksLikeSecret, normalizeAccountIdentifier } from '../../../licensing/public/account-identifier.policy';
import type {
  DateFormat,
  EventClassMapping,
  SourceTemplate,
  UsageIdentifierType,
} from '../../vendor-source/vendor-source.types';
import {
  MAX_DAYS_PER_ROW,
  MAX_ROW_ERRORS,
  MAX_UNMAPPED_EVENT_TYPES,
  type CoverageWindow,
  type ReportDay,
  type ReportRow,
  type RowError,
} from '../vendor-import.types';
import { judgeDayInWindow, resolveWindow, typedWiderThanFile } from './coverage-window.policy';
import { readCsvReport } from './csv-report.policy';
import { readJsonReport } from './json-report.policy';
import type { ParsedReport, ParseInput, RawReport, RawReportRow, ReadingSource } from './vendor-import-parse.types';

/** What is kept in place of an identifier that has the shape of a secret: the row is wrong and the value is never shown (`SEC-03`). */
export const MASKED_IDENTIFIER = '***';

/** The identifier as it is compared: an email or a username is the same in any case, an account id is exactly as the vendor wrote it. */
export function normalizeIdentifier(raw: string, type: UsageIdentifierType): string {
  return type === 'ACCOUNT_ID' ? raw.normalize('NFKC').trim() : normalizeAccountIdentifier(raw);
}

/** How the dates of a report are read: the order of a date written with slashes, the zone of the vendor and the zone of the organization. */
export interface DateReading {
  dateFormat: DateFormat;
  sourceTimeZone: string;
  organizationTimeZone: string;
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const DATE_TIME = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(Z|[+-]\d{2}:?\d{2})?$/i;
const SLASHED = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

/** `+0700` and `+07:00` are the same offset; `z` is `Z`. */
const zoneSuffix = (zone: string): string =>
  /^[+-]\d{4}$/.test(zone) ? `${zone.slice(0, 3)}:${zone.slice(3)}` : zone.toUpperCase();

function slashedDay(value: string, dateFormat: DateFormat): BusinessDate | null {
  const parts = SLASHED.exec(value);
  if (!parts) return null;
  const [day, month] = dateFormat === 'DD/MM/YYYY' ? [parts[1], parts[2]] : [parts[2], parts[1]];
  const date = `${parts[3]}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;

  return isBusinessDate(date) ? date : null;
}

/**
 * The day of the organization a cell names (`FR-4.2`), read strictly: a date alone is the day as written (the vendor's own day, in its zone); a
 * date with a time and an offset is that instant, and one with a time but no offset is that wall clock in the zone of the source, either taken
 * to the day it is in the zone of the organization; a date written with slashes is read in the order the template names. Anything else, a
 * date with more after it included, is null.
 */
export function dayOf(text: string, reading: DateReading): BusinessDate | null {
  const value = text.trim();
  if (reading.dateFormat !== 'YYYY-MM-DD') return slashedDay(value, reading.dateFormat);
  if (DATE_ONLY.test(value)) return isBusinessDate(value) ? value : null;
  const parts = DATE_TIME.exec(value);
  if (!parts || !isBusinessDate(parts[1])) return null;
  const [hours, minutes, seconds] = [Number(parts[2]), Number(parts[3]), Number(parts[4] ?? '0')];
  if (hours > 23 || minutes > 59 || seconds > 59) return null;
  const zone = parts[5];
  const instant = zone
    ? new Date(`${parts[1]}T${parts[2]}:${parts[3]}:${String(seconds).padStart(2, '0')}${zoneSuffix(zone)}`)
    : instantAtWallClock(
        { date: parts[1], msOfDay: ((hours * 60 + minutes) * 60 + seconds) * 1000 },
        reading.sourceTimeZone,
      );

  return Number.isNaN(instant.getTime()) ? null : businessDateAt(instant, reading.organizationTimeZone);
}

/** How a source reads its dates; a source or an organization that names no zone reads in UTC. */
const readingOf = (source: ReadingSource, organizationTimeZone: string | undefined): DateReading => ({
  dateFormat: source.template.dateFormat ?? 'YYYY-MM-DD',
  sourceTimeZone: source.timeZone ?? organizationTimeZone ?? 'UTC',
  organizationTimeZone: organizationTimeZone ?? source.timeZone ?? 'UTC',
});

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

/**
 * The class the template gives a type of event, by its own keys only: a type named like a property of every object (`constructor`,
 * `__proto__`) is a type the template does not know, never something inherited.
 */
function eventClassOf(classes: SourceTemplate['eventClasses'], type: string): EventClassMapping | undefined {
  if (Object.hasOwn(classes, type)) return classes[type];
  const lower = type.toLowerCase();

  return Object.hasOwn(classes, lower) ? classes[lower] : undefined;
}

/** The days a row names, sorted by the template, and the faults of its dates and event types. */
function daysOf(
  raw: RawReportRow,
  source: ReadingSource,
  reading: DateReading,
): { days: ReportDay[]; errors: RowError[] } {
  const days: ReportDay[] = [];
  const errors: RowError[] = [];
  const listed = (values: readonly string[], basis: ReportDay['basis']) => {
    for (const value of values) {
      const date = dayOf(value, reading);
      if (date === null) errors.push({ code: 'DATE_INVALID' });
      else days.push({ date, eventClass: 'VALUE', basis });
    }
  };
  listed(raw.activeDates, 'ACTIVE_DATE');
  listed(raw.lastActivityDate === null ? [] : [raw.lastActivityDate], 'LAST_ACTIVITY');

  for (const event of raw.events) {
    const date = dayOf(event.date, reading);
    const type = event.eventType.trim();
    if (date === null) errors.push({ code: 'DATE_INVALID' });
    if (type === '') errors.push({ code: 'EVENT_TYPE_MISSING' });
    if (date === null || type === '') continue;
    const mapped = eventClassOf(source.template.eventClasses, type);
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

function shapeRow(raw: RawReportRow, source: ReadingSource, seen: Set<string>, reading: DateReading): ReportRow {
  const identifier = identifierOf(raw, source, seen);
  const read = raw.notAPerson ? { days: [], errors: [] } : daysOf(raw, source, reading);
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
  const reading = readingOf(input.source, input.organizationTimeZone);
  const rows = raw.rows.map((row) => shapeRow(row, input.source, seen, reading));
  const listed = new Set(raw.rows.flatMap((row, index) => (isListedOnly(row) ? [rows[index]] : [])));

  const typed = Boolean(input.declared.from || input.declared.to);
  const { window, warnings } = resolveWindow({
    declared: typed ? input.declared : (raw.window ?? {}),
    rows,
    today: input.today,
    maxHistoryDays: input.source.capabilities.maxHistoryDays,
  });
  judgeAgainstWindow(rows, listed, window);
  if (typed && typedWiderThanFile(window, raw.window)) warnings.push('DECLARED_WINDOW_WIDER_THAN_FILE');

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
