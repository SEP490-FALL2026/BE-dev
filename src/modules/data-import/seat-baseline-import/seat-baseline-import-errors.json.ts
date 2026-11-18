import { z } from 'zod';
import { jsonColumn } from '../../../infrastructure/database/json-column';
import { JsonColumnShapeError } from '../../../infrastructure/database/json-column.errors';
import {
  RETIRED_SEAT_ROW_ERROR_CODES,
  SEAT_ROW_ERROR_CODES,
  type StoredSeatRowError,
} from './seat-baseline-import.types';

const TABLE = 'seat_baseline_import_rows';
const COLUMN = 'errors';

/**
 * Why one row of a seat baseline file cannot be written; an empty list for a row with nothing wrong. The codes are a closed set
 * with a retired tail: a stored row may carry a code the preview no longer writes, so a read accepts both lists. (The errors of a
 * people file are open, any text, so `employee-import-errors.json.ts` does not list them.)
 */
const readSchema = z.array(
  z.object({ code: z.enum([...SEAT_ROW_ERROR_CODES, ...RETIRED_SEAT_ROW_ERROR_CODES]) }),
) satisfies z.ZodType<StoredSeatRowError[]>;

/** What a write accepts: the live codes only, so a retired one can be read but never written again. */
const writeSchema = z.array(z.object({ code: z.enum(SEAT_ROW_ERROR_CODES) }));

/** `seat_baseline_import_rows.errors`. */
export const seatBaselineImportErrorsJson = jsonColumn({
  table: TABLE,
  column: COLUMN,
  schema: readSchema,
  encode: (errors) => {
    const written = writeSchema.safeParse(errors);
    if (!written.success) throw new JsonColumnShapeError(TABLE, COLUMN, written.error.issues);

    return written.data;
  },
});
