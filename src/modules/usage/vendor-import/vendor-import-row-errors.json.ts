import { z } from 'zod';
import { jsonColumn } from '../../../infrastructure/database/json-column';
import { MAX_ROW_ERRORS, type StoredRowError } from './vendor-import.types';

/** The faults of a row: a stable code and, at most, a date or the name of a column. A code that was retired still reads. */
export const rowErrorsSchema = z
  .array(z.strictObject({ code: z.string().min(1).max(60), detail: z.string().max(200).optional() }))
  .max(MAX_ROW_ERRORS) satisfies z.ZodType<StoredRowError[]>;

/** `usage_import_rows.errors`. */
export const usageImportRowErrorsJson = jsonColumn({
  table: 'usage_import_rows',
  column: 'errors',
  schema: rowErrorsSchema,
  encode: (errors) => errors,
});
