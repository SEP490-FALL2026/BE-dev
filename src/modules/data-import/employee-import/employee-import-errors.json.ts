import { z } from 'zod';
import { jsonColumn } from '../../../infrastructure/database/json-column';
import { EMPLOYEE_COLUMNS, type RowIssue } from './employee-import-row.types';

/**
 * What is wrong with one row of a people file: the column and a code; an empty list for a row with nothing wrong. The code is any
 * text: unlike the seat codes (a closed set with a retired tail, `seat-baseline-import-errors.json.ts`), these are open.
 */
const schema = z.array(z.object({ column: z.enum(EMPLOYEE_COLUMNS), code: z.string() })) satisfies z.ZodType<
  RowIssue[]
>;

/** `employee_import_rows.errors`. */
export const employeeImportErrorsJson = jsonColumn({
  table: 'employee_import_rows',
  column: 'errors',
  schema,
  encode: (issues) => issues,
});
