import type { BusinessDate } from '../../../../core/business-date';
import type { NewDay } from '../vendor-import.repo';
import type { MatchMethod, NoticeMode, StoredRow } from '../vendor-import.types';

export interface WindowOfImport {
  id: string;
  from: BusinessDate;
  to: BusinessDate;
}

export interface OverlapDecision {
  otherImportId: string;
  /** The days both reports cover. */
  from: BusinessDate;
  to: BusinessDate;
  /** Who keeps the days of the overlap: the report that covers later, and, when both end the same day, the one confirmed last (`US-08-07` AC-3). */
  winner: 'CURRENT' | 'OTHER';
}

/**
 * How the report being confirmed shares the days with the reports of the same source confirmed before whose windows meet it: in the days
 * they both cover, the report with the larger `coverage_to` wins, and a tie goes to the one confirmed after (this one).
 */
export function planOverlaps(current: WindowOfImport, others: readonly WindowOfImport[]): OverlapDecision[] {
  return others.map((other) => ({
    otherImportId: other.id,
    from: current.from > other.from ? current.from : other.from,
    to: current.to < other.to ? current.to : other.to,
    winner: current.to >= other.to ? 'CURRENT' : 'OTHER',
  }));
}

/**
 * Whether the confirmation may go ahead as far as the holders being told is concerned (`US-08-05` AC-1): the first report of an application
 * needs the IT Admin to say they were told, or that the system tells them; later reports need nothing more because the holders who came after
 * are told by the same confirmation.
 */
export function trackingNoticeIsMissing(firstReport: boolean, notice: NoticeMode | undefined): boolean {
  return firstReport && notice === undefined;
}

/** The types of event still without a class in the rows that will be written: nothing is guessed (`FR-4.11`, `TC-2`). */
export function unmappedEventTypesOf(rows: readonly StoredRow[]): string[] {
  const types = rows
    .filter((row) => row.outcome !== 'INVALID' && row.outcome !== 'NOT_A_PERSON')
    .flatMap((row) => row.cells.days.flatMap((day) => (day.eventClass === null ? [day.eventType ?? ''] : [])));

  return [...new Set(types)].sort();
}

/**
 * The days a confirmed report writes: the days of every row that is a person's or may be (matched or not: who an identifier is, is read
 * later), each once. A row that is wrong, or that is not a person, writes nothing.
 */
export function daysToWrite(rows: readonly StoredRow[]): NewDay[] {
  const seen = new Set<string>();
  const days: NewDay[] = [];
  for (const row of rows) {
    if (row.outcome === 'INVALID' || row.outcome === 'NOT_A_PERSON') continue;
    for (const day of row.cells.days) {
      if (day.eventClass === null) continue;
      const key = `${row.identifierNormalized}|${day.date}|${day.eventClass}`;
      if (seen.has(key)) continue;
      seen.add(key);
      days.push({
        identifierNormalized: row.identifierNormalized,
        date: day.date,
        eventClass: day.eventClass,
        basis: day.basis,
      });
    }
  }

  return days;
}

/** The mapping a new match writes: the ways the system ties an identifier itself (a mapping already in force, or one made by hand, is not written again). */
export function mappingToWrite(row: StoredRow, existing: ReadonlyMap<string, MatchMethod>): MatchMethod | null {
  if (row.outcome !== 'MATCHED' || row.employeeId === null || row.matchMethod === null) return null;
  if (row.matchMethod === 'MANUAL' || existing.has(row.identifierNormalized)) return null;

  return row.matchMethod;
}

export interface SeatInterval {
  from: BusinessDate;
  /** The day the seat ends, exclusive; null while open. */
  until: BusinessDate | null;
}

/** The activity of a person that no seat covers: the first and the last such day, or null when every day is covered (`FR-4.8`). */
export function uncoveredActivity(
  activityDates: readonly BusinessDate[],
  seats: readonly SeatInterval[],
): { first: BusinessDate; last: BusinessDate } | null {
  const uncovered = activityDates
    .filter((date) => !seats.some((seat) => seat.from <= date && (seat.until === null || date < seat.until)))
    .sort();

  return uncovered.length === 0 ? null : { first: uncovered[0], last: uncovered[uncovered.length - 1] };
}
