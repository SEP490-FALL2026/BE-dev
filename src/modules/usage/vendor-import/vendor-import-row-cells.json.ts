import { z } from 'zod';
import { isBusinessDate } from '../../../core/business-date';
import { jsonColumn } from '../../../infrastructure/database/json-column';
import { MAX_DAYS_PER_ROW, type RowCells } from './vendor-import.types';

/** What a row of the report keeps: the days it names, each with its class (null while its type of event is not sorted). */
export const rowCellsSchema = z.strictObject({
  days: z
    .array(
      z.strictObject({
        date: z.string().refine(isBusinessDate),
        eventClass: z.enum(['VALUE', 'PASSIVE', 'AUTH_ONLY']).nullable(),
        eventType: z.string().max(200).optional(),
        basis: z.enum(['ACTIVE_DATE', 'LAST_ACTIVITY']),
      }),
    )
    .max(MAX_DAYS_PER_ROW),
}) satisfies z.ZodType<RowCells>;

/** `usage_import_rows.cells`. */
export const usageImportRowCellsJson = jsonColumn({
  table: 'usage_import_rows',
  column: 'cells',
  schema: rowCellsSchema,
  encode: (cells) => cells,
});
