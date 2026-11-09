import { z } from 'zod';
import { nullableJsonColumn } from '../../../infrastructure/database/json-column';
import { EMPLOYEE_COLUMNS, type RowDifference } from './employee-import-row.types';

/** How a row differs from the person who already exists: for each column, what is kept and what the file says. */
const schema = z.array(
  z.object({ column: z.enum(EMPLOYEE_COLUMNS), current: z.string(), incoming: z.string() }),
) satisfies z.ZodType<RowDifference[]>;

/** `employee_import_rows.differences`: NULL for a row that is not a person who already exists with other data. */
export const employeeImportDifferencesJson = nullableJsonColumn({
  table: 'employee_import_rows',
  column: 'differences',
  schema,
  encode: (differences) => differences,
});
