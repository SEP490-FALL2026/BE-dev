import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { hrBasisSchema } from '../../../infrastructure/http/dto/hr-basis.dto';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';

export const importIdParamSchema = z.strictObject({ id: z.uuid() });

export const listImportRowsQuerySchema = z.strictObject({
  outcome: z.enum(['VALID', 'ERROR', 'EXISTS_SAME', 'EXISTS_DIFFERENT']).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(50),
});

export const confirmImportBodySchema = z.strictObject({
  previewVersion: z.number().int().positive(),
  idempotencyKey: z.string().min(8).max(100),
  acknowledgeDuplicateFile: z.boolean().default(false),
  /** The HR document every person of this file is entered on (`US-02-02` AC-16): required. */
  hrBasis: hrBasisSchema,
});

const departmentCount = z.strictObject({ departmentCode: z.string(), count: z.number().int().nonnegative() });
const departmentRef = z.strictObject({ code: z.string(), name: z.string() });

const summarySchema = z.strictObject({
  totalRows: z.number().int().nonnegative(),
  valid: z.number().int().nonnegative(),
  errors: z.number().int().nonnegative(),
  existingSame: z.number().int().nonnegative(),
  existingDifferent: z.number().int().nonnegative(),
  newPeopleByDepartment: z.array(departmentCount),
  departmentsWithoutHead: z.array(departmentRef),
  reviewQueue: z.strictObject({
    total: z.number().int().nonnegative(),
    items: z.array(
      z.strictObject({ employeeCode: z.string(), fullName: z.string(), seats: z.number().int().positive() }),
    ),
  }),
  duplicateOf: z.strictObject({ importId: z.uuid(), fileName: z.string(), confirmedAt: z.iso.datetime() }).nullable(),
});

const resultSchema = z.strictObject({
  created: z.number().int().nonnegative(),
  existingSame: z.number().int().nonnegative(),
  existingDifferent: z.number().int().nonnegative(),
  errors: z.number().int().nonnegative(),
  createdByDepartment: z.array(departmentCount),
  departmentsWithoutHead: z.array(departmentRef),
});

const importSchema = z.strictObject({
  id: z.uuid(),
  fileName: z.string(),
  status: z.enum(['PREVIEW', 'COMPLETED', 'CANCELLED']),
  previewVersion: z.number().int().positive(),
  ignoredColumns: z.array(z.string()),
  summary: summarySchema,
  result: resultSchema.nullable(),
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  confirmedAt: z.iso.datetime().nullable(),
  cancelledAt: z.iso.datetime().nullable(),
});

const confirmationSchema = z.strictObject({ replayed: z.boolean(), import: importSchema });

const rowsSchema = z.strictObject({
  items: z.array(
    z.strictObject({
      line: z.number().int().positive(),
      outcome: z.enum(['VALID', 'ERROR', 'EXISTS_SAME', 'EXISTS_DIFFERENT']),
      cells: z.record(z.string(), z.string()),
      errors: z.array(z.strictObject({ column: z.string(), code: z.string() })),
      differences: z
        .array(z.strictObject({ column: z.string(), current: z.string(), incoming: z.string() }))
        .nullable(),
    }),
  ),
  pagination: z.strictObject({
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    totalItems: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
  }),
});

export class ImportIdParamDto extends createZodDto(importIdParamSchema) {}
export class ListImportRowsQueryDto extends createZodDto(listImportRowsQuerySchema) {}
export class ConfirmImportBodyDto extends createZodDto(confirmImportBodySchema) {}
export class EmployeeImportResponseDto extends createZodDto(successEnvelopeSchema(importSchema)) {}
export class EmployeeImportConfirmationResponseDto extends createZodDto(successEnvelopeSchema(confirmationSchema)) {}
export class EmployeeImportRowsResponseDto extends createZodDto(successEnvelopeSchema(rowsSchema)) {}
