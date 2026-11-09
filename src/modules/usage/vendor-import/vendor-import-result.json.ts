import { z } from 'zod';
import { nullableJsonColumn } from '../../../infrastructure/database/json-column';
import type { ImportResult } from './vendor-import.types';

const count = z.number().int().nonnegative();

/** What the confirmation of a report wrote. */
export const importResultSchema = z.strictObject({
  daysWritten: count,
  matched: count,
  unmatched: count,
  ambiguous: count,
  notAPerson: count,
  invalid: count,
  mappingsCreated: count,
  daysSuperseded: count,
  findingsOpened: count,
  findingsClosed: count,
  noticesSent: count,
}) satisfies z.ZodType<ImportResult>;

/** `usage_imports.result`: null until the import is confirmed. */
export const usageImportResultJson = nullableJsonColumn({
  table: 'usage_imports',
  column: 'result',
  schema: importResultSchema,
  encode: (result) => result,
});
