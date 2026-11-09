import type { BusinessDate } from '../../../core/business-date';
import type { DetectableGroup, UsageIdentifierType } from '../vendor-source/vendor-source.types';

export type ImportFormat = 'JSON' | 'CSV';
export type ImportStatus = 'PREVIEW' | 'COMPLETED' | 'CANCELLED';
export type CoverageBasis = 'DECLARED' | 'DERIVED';
export type NoticeMode = 'CONFIRMED_DELIVERED' | 'SYSTEM_SENT';
export type RowOutcome = 'MATCHED' | 'UNMATCHED' | 'AMBIGUOUS' | 'NOT_A_PERSON' | 'INVALID';
export type EventClass = 'VALUE' | 'PASSIVE' | 'AUTH_ONLY';
export type ActivityBasis = 'ACTIVE_DATE' | 'LAST_ACTIVITY';
export type MatchMethod = 'EXACT_EMAIL' | 'ACCOUNT_IDENTIFIER' | 'ALIAS_RULE' | 'MANUAL';

/** The limits of a report: a file of a few megabytes with at most this many rows (`US-08-02`). */
export const MAX_REPORT_ROWS = 50_000;
export const MAX_REPORT_BYTES = 10 * 1024 * 1024;
export const MAX_WINDOW_DAYS = 366;
/** The days of a confirmed report are written this many at a time. */
export const CHUNK_SIZE = 5_000;
/** The most warnings a summary carries (the window is longer than the history of the vendor; the typed window is wider than the file's). */
export const MAX_SUMMARY_WARNINGS = 10;
/** The most types of event a summary names as not sorted; the rest are not listed, the count of the first is enough to sort them. */
export const MAX_UNMAPPED_EVENT_TYPES = 200;
/** The most days one row keeps: a window of 366 days, once each, and the last activity. */
export const MAX_DAYS_PER_ROW = 400;
/** The most faults one row names. */
export const MAX_ROW_ERRORS = 20;
/** The schema of a JSON report the system reads. */
export const REPORT_SCHEMA = 'saas-sentry.vendor-usage-report/0.1-proposal';

/** One day on which an identifier was active, as the report said it; the class is null while the type of event is not sorted yet. */
export interface ReportDay {
  date: BusinessDate;
  eventClass: EventClass | null;
  /** The type of event as the vendor named it, kept only while it has no class. */
  eventType?: string;
  basis: ActivityBasis;
}

/** What a row of the report says once it is read, before the window and the people are judged. */
export interface ReportRow {
  lineNumber: number;
  /** The identifier as the vendor wrote it (`US-08-04` AC-1), trimmed. */
  identifierRaw: string;
  /** The identifier as it is compared: the same for the same person (`FR-4.5`). */
  identifierNormalized: string;
  notAPerson: boolean;
  days: ReportDay[];
  /** A fault of the row itself, before the window judges it. */
  errors: RowError[];
}

export interface RowError {
  code: string;
  /** A date or the name of a column: never the identifier, which may be a secret. */
  detail?: string;
}

export interface CoverageWindow {
  from: BusinessDate;
  to: BusinessDate;
  basis: CoverageBasis;
}

export interface ImportSummary {
  window: CoverageWindow;
  totalRows: number;
  matched: number;
  unmatched: number;
  ambiguous: number;
  notAPerson: number;
  invalid: number;
  byCode: Record<string, number>;
  distinctIdentifiers: number;
  /** The seats of the application the matched people hold on the day of the report: the rights this report is about (`US-08-02` AC-1). */
  affectedSeats: number;
  detectableGroups: DetectableGroup[];
  activityDefinition: string;
  warnings: string[];
  /** The types of event no class was given to: the report cannot be confirmed until they are sorted. */
  unmappedEventTypes: string[];
  /** Whether this is the first report of the application, which the holders must be told of before it is written (`US-08-05`). */
  trackingNoticeRequired: boolean;
  recordedOn: BusinessDate;
}

export interface ImportResult {
  daysWritten: number;
  matched: number;
  unmatched: number;
  ambiguous: number;
  notAPerson: number;
  invalid: number;
  mappingsCreated: number;
  daysSuperseded: number;
  findingsOpened: number;
  findingsClosed: number;
  noticesSent: number;
}

/** What is kept of a row: what the preview judged of it and what its confirmation writes. */
export interface RowCells {
  days: ReportDay[];
}

export interface StoredRowError {
  code: string;
  detail?: string;
}

export interface StoredRow {
  lineNumber: number;
  identifierRaw: string;
  identifierNormalized: string;
  cells: RowCells;
  outcome: RowOutcome;
  employeeId: string | null;
  matchMethod: MatchMethod | null;
  errors: StoredRowError[];
}

export interface ImportRecord {
  id: string;
  organizationId: string;
  sourceId: string;
  format: ImportFormat;
  status: ImportStatus;
  coverageFrom: BusinessDate;
  coverageTo: BusinessDate;
  coverageBasis: CoverageBasis;
  contentHash: string;
  previewVersion: number;
  summary: ImportSummary;
  result: ImportResult | null;
  confirmKey: string | null;
  noticeMode: NoticeMode | null;
  noticeAt: Date | null;
  expiresAt: Date;
  uploadedByAppUserId: string;
  confirmedByAppUserId: string | null;
  createdAt: Date;
  confirmedAt: Date | null;
  cancelledAt: Date | null;
}

export interface ImportView {
  id: string;
  sourceId: string;
  format: ImportFormat;
  status: ImportStatus;
  previewVersion: number;
  summary: ImportSummary;
  result: ImportResult | null;
  noticeMode: NoticeMode | null;
  createdAt: Date;
  expiresAt: Date;
  confirmedAt: Date | null;
  cancelledAt: Date | null;
}

export interface IdentifierRef {
  identifierType: UsageIdentifierType;
  normalizedIdentifier: string;
}
