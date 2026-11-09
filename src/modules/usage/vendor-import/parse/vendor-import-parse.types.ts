import type { BusinessDate } from '../../../../core/business-date';
import type {
  SourceCapabilities,
  SourceTemplate,
  UsageIdentifierType,
  UsageReportShape,
} from '../../vendor-source/vendor-source.types';
import type { CoverageWindow, ImportFormat, ReportRow } from '../vendor-import.types';

/** What a row says before the template sorts it: the strings and dates exactly as the report has them. */
export interface RawReportRow {
  lineNumber: number;
  identifier: string;
  notAPerson: boolean;
  activeDates: string[];
  lastActivityDate: string | null;
  events: Array<{ date: string; eventType: string }>;
}

/** What a reader finds in a whole report: its rows and, for a JSON report, what it says of itself. */
export interface RawReport {
  rows: RawReportRow[];
  /** The application the report says it is of (id or name), when it says; JSON only. */
  application: string | null;
  /** The window the report declares, when it does; JSON only. */
  window: { from: string | null; to: string | null } | null;
  /** The number of (identifier, date) pairs the report holds, which the limit of rows counts. */
  pairs: number;
}

/** The part of a source the reading of a report depends on. */
export interface ReadingSource {
  identifierType: UsageIdentifierType;
  reportShape: UsageReportShape;
  template: SourceTemplate;
  capabilities: SourceCapabilities;
}

export interface ParseInput {
  format: ImportFormat;
  text: string;
  source: ReadingSource;
  /** The window the IT Admin typed with the upload; it wins over one inside the file. */
  declared: { from?: BusinessDate; to?: BusinessDate };
  today: BusinessDate;
}

export interface ParsedReport {
  rows: ReportRow[];
  window: CoverageWindow;
  warnings: string[];
  application: string | null;
  unmappedEventTypes: string[];
}
