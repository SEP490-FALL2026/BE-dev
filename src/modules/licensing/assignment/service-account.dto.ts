import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';
import { z } from 'zod';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';

const flag = z.enum(['true', 'false']).transform((value) => value === 'true');
const pageQuery = {
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
};
const pagination = z.strictObject({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalItems: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

const listDutiesQuerySchema = z.strictObject({
  employeeId: z.uuid().optional(),
  overdue: flag.optional(),
  ...pageQuery,
});

const employeeBrief = z.strictObject({ employeeId: z.uuid(), employeeCode: z.string(), fullName: z.string() });
const departmentBrief = z.strictObject({ id: z.uuid(), code: z.string(), name: z.string() });
const planBrief = z.strictObject({ planId: z.uuid(), planName: z.string(), applicationName: z.string() });

/** A service account that waits for a person to answer for it: who answers now, where it is owned, and the day that binds it. */
export const serviceAccountDutySchema = z.strictObject({
  assignmentId: z.uuid(),
  accountIdentifier: z.string(),
  plan: planBrief,
  owningDepartment: departmentBrief.nullable(),
  responsible: employeeBrief,
  dueOn: z.string(),
  fileKind: z.enum(['TRANSFER', 'OFFBOARDING']),
  fileId: z.uuid(),
  overdue: z.boolean(),
});

export type ServiceAccountDutyWire = z.infer<typeof serviceAccountDutySchema>;

export class ListServiceAccountDutiesQueryDto extends createZodDto(listDutiesQuerySchema) {}
export class ServiceAccountDutyPageResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ items: z.array(serviceAccountDutySchema), pagination })),
) {}
