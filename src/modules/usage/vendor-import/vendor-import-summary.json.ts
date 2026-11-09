import { z } from 'zod';
import { isBusinessDate } from '../../../core/business-date';
import { jsonColumn } from '../../../infrastructure/database/json-column';
import { MAX_SUMMARY_WARNINGS, MAX_UNMAPPED_EVENT_TYPES, type ImportSummary } from './vendor-import.types';
import { MAX_DETECTABLE_GROUPS } from '../vendor-source/vendor-source.types';

const count = z.number().int().nonnegative();
const day = z.string().refine(isBusinessDate);

/** What the preview of a report said about the report as a whole (`US-08-02` AC-1). */
export const importSummarySchema = z.strictObject({
  window: z.strictObject({ from: day, to: day, basis: z.enum(['DECLARED', 'DERIVED']) }),
  totalRows: count,
  matched: count,
  unmatched: count,
  ambiguous: count,
  notAPerson: count,
  invalid: count,
  byCode: z.record(z.string(), count),
  distinctIdentifiers: count,
  affectedSeats: count,
  detectableGroups: z.array(z.enum(['G1', 'G2', 'G3', 'G4'])).max(MAX_DETECTABLE_GROUPS),
  activityDefinition: z.string(),
  warnings: z.array(z.string()).max(MAX_SUMMARY_WARNINGS),
  unmappedEventTypes: z.array(z.string()).max(MAX_UNMAPPED_EVENT_TYPES),
  trackingNoticeRequired: z.boolean(),
  recordedOn: day,
}) satisfies z.ZodType<ImportSummary>;

/** `usage_imports.summary`. */
export const usageImportSummaryJson = jsonColumn({
  table: 'usage_imports',
  column: 'summary',
  schema: importSummarySchema,
  encode: (summary) => summary,
});
