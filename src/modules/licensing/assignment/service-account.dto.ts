import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';
import { z } from 'zod';
import { isBusinessDate } from '../../../core/business-date';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';

const businessDate = z.string().refine(isBusinessDate, { message: 'The day must be a real date as YYYY-MM-DD.' });
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

const proposeMoveBodySchema = z.strictObject({
  toDepartmentId: z.uuid(),
  newResponsibleEmployeeId: z.uuid(),
  effectiveFrom: businessDate,
  expectedEndDate: businessDate.optional(),
});
const cancelMoveBodySchema = z.strictObject({ reason: z.string().max(1000).optional() });
const moveIdParamSchema = z.strictObject({ id: z.uuid() });
const listMovesQuerySchema = z.strictObject({
  status: z.enum(['PENDING', 'CONFIRMED', 'CANCELLED']).optional(),
  ...pageQuery,
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

/** A proposal to move a service account to another department, with who confirmed or cancelled it and what it made. */
export const serviceAccountMoveSchema = z.strictObject({
  id: z.uuid(),
  status: z.enum(['PENDING', 'CONFIRMED', 'CANCELLED']),
  assignmentId: z.uuid(),
  accountIdentifier: z.string(),
  plan: planBrief,
  currentResponsible: employeeBrief,
  fromDepartment: departmentBrief,
  toDepartment: departmentBrief,
  newResponsible: employeeBrief,
  effectiveFrom: z.string(),
  expectedEndDate: z.string().nullable(),
  proposedByAppUserId: z.uuid(),
  proposedAt: z.iso.datetime(),
  confirmation: z
    .strictObject({
      confirmedByEmployeeId: z.uuid(),
      role: z.enum(['DEPARTMENT_HEAD', 'FALLBACK_APPROVER']),
      confirmedAt: z.iso.datetime(),
    })
    .nullable(),
  cancellation: z
    .strictObject({ cancelledByAppUserId: z.uuid(), cancelledAt: z.iso.datetime(), reason: z.string() })
    .nullable(),
  resultingAssignmentId: z.uuid().nullable(),
});

export type ServiceAccountDutyWire = z.infer<typeof serviceAccountDutySchema>;
export type ServiceAccountMoveWire = z.infer<typeof serviceAccountMoveSchema>;

export class ProposeMoveBodyDto extends createZodDto(proposeMoveBodySchema) {}
export class CancelMoveBodyDto extends createZodDto(cancelMoveBodySchema) {}
export class ServiceAccountMoveIdParamDto extends createZodDto(moveIdParamSchema) {}
export class ListServiceAccountMovesQueryDto extends createZodDto(listMovesQuerySchema) {}
export class ListServiceAccountDutiesQueryDto extends createZodDto(listDutiesQuerySchema) {}
export class ServiceAccountMoveResponseDto extends createZodDto(successEnvelopeSchema(serviceAccountMoveSchema)) {}
export class ServiceAccountMovePageResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ items: z.array(serviceAccountMoveSchema), pagination })),
) {}
export class ServiceAccountDutyPageResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ items: z.array(serviceAccountDutySchema), pagination })),
) {}
