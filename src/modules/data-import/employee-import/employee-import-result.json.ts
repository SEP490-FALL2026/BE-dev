import { z } from 'zod';
import { nullableJsonColumn } from '../../../infrastructure/database/json-column';
import type { ImportResult } from './employee-import.types';

const count = z.number().int().nonnegative();

/** What the confirmation of a people file wrote. */
const schema = z.object({
  newUnplaced: count.default(0),
  created: count,
  existingSame: count,
  existingDifferent: count,
  errors: count,
  createdByDepartment: z.array(z.object({ departmentCode: z.string(), count })),
  departmentsWithoutHead: z.array(z.object({ code: z.string(), name: z.string() })),
}) satisfies z.ZodType<ImportResult>;

/** `employee_imports.result`: NULL until the import is confirmed. */
export const employeeImportResultJson = nullableJsonColumn({
  table: 'employee_imports',
  column: 'result',
  schema,
  encode: (result) => result,
});
