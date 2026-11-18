import { z } from 'zod';
import { jsonColumn } from '../../../infrastructure/database/json-column';
import { EMPLOYEE_COLUMNS, type EmployeeCells } from './employee-import-row.types';

/** What one row of a people file said, by column, as it was read. */
const schema = z.partialRecord(z.enum(EMPLOYEE_COLUMNS), z.string()) satisfies z.ZodType<EmployeeCells>;

/** `employee_import_rows.cells`. */
export const employeeImportCellsJson = jsonColumn({
  table: 'employee_import_rows',
  column: 'cells',
  schema,
  encode: (cells) => cells,
});
