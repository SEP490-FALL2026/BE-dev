import { z } from 'zod';
import { jsonColumn } from '../../../infrastructure/database/json-column';
import type { ImportSummary } from './employee-import.types';

const count = z.number().int().nonnegative();

/** What the preview of a people file said about the file as a whole. */
const schema = z.object({
  newUnplaced: count.default(0),
  totalRows: count,
  valid: count,
  errors: count,
  existingSame: count,
  existingDifferent: count,
  newPeopleByDepartment: z.array(z.object({ departmentCode: z.string(), count })),
  departmentsWithoutHead: z.array(z.object({ code: z.string(), name: z.string() })),
  // A preview kept before the review queue existed has none.
  reviewQueue: z
    .object({
      total: count,
      items: z.array(z.object({ employeeCode: z.string(), fullName: z.string(), seats: count })),
    })
    .default({ total: 0, items: [] }),
  duplicateOf: z.object({ importId: z.string(), fileName: z.string(), confirmedAt: z.string() }).nullable(),
}) satisfies z.ZodType<ImportSummary>;

/** `employee_imports.summary`. */
export const employeeImportSummaryJson = jsonColumn({
  table: 'employee_imports',
  column: 'summary',
  schema,
  encode: (summary) => summary,
});
