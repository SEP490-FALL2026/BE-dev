import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { isBusinessDate } from '../../../core/business-date';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';

/**
 * Only the shape and a generous bound are checked here. Whether the person is working, the day is after the account began
 * and not in the past, and the expected end date is required of time-limited staff is judged by the assignment policy and
 * answers with its own `LICENSE_ASSIGNMENT.*` code.
 */
const businessDate = z.string().refine(isBusinessDate, { message: 'Must be a real date as YYYY-MM-DD.' });

export const responsibleChangeBodySchema = z.strictObject({
  employeeId: z.uuid(),
  effectiveFrom: businessDate,
  expectedEndDate: businessDate.optional(),
});

const pageQuery = {
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
};
export const listAssignmentsQuerySchema = z.strictObject({
  subscriptionId: z.uuid().optional(),
  planId: z.uuid().optional(),
  employeeId: z.uuid().optional(),
  source: z.enum(['BASELINE', 'HANDOVER', 'REQUEST']).optional(),
  kind: z.enum(['PERSONAL', 'SERVICE']).optional(),
  ...pageQuery,
});
export const assignmentIdParamSchema = z.strictObject({ id: z.uuid() });
export const subscriptionIdParamSchema = z.strictObject({ id: z.uuid() });

const assignmentSchema = z.strictObject({
  id: z.uuid(),
  source: z.enum(['BASELINE', 'HANDOVER', 'REQUEST']),
  kind: z.enum(['PERSONAL', 'SERVICE']),
  planId: z.uuid(),
  subscriptionId: z.uuid().nullable(),
  employeeId: z.uuid(),
  accountIdentifier: z.string(),
  reason: z.string().nullable(),
  costCenterId: z.uuid().nullable(),
  owningDepartmentId: z.uuid().nullable(),
  effectiveFrom: z.string(),
  effectiveFromBasis: z.enum(['ACTUAL', 'RECORDED']),
  grantedOn: z.string().nullable(),
  effectiveFromLabel: z.string().nullable(),
  validUntil: z.string().nullable(),
  expectedEndDate: z.string().nullable(),
  predecessorId: z.uuid().nullable(),
  failedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});
const assignmentSummarySchema = assignmentSchema.extend({
  employee: z.strictObject({ employeeId: z.uuid(), employeeCode: z.string(), fullName: z.string() }),
  plan: z.strictObject({ planId: z.uuid(), planName: z.string(), applicationName: z.string() }),
  costCenter: z.strictObject({ id: z.uuid(), code: z.string(), name: z.string() }).nullable(),
});
const pagination = z.strictObject({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalItems: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

export class ResponsibleChangeBodyDto extends createZodDto(responsibleChangeBodySchema) {}
export class ListAssignmentsQueryDto extends createZodDto(listAssignmentsQuerySchema) {}
export class AssignmentIdParamDto extends createZodDto(assignmentIdParamSchema) {}
export class SubscriptionSeatsParamDto extends createZodDto(subscriptionIdParamSchema) {}
export class AssignmentPageResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ items: z.array(assignmentSummarySchema), pagination })),
) {}
export class ResponsibleChangeResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ ended: assignmentSchema, created: assignmentSchema })),
) {}
export class SeatUsageResponseDto extends createZodDto(
  successEnvelopeSchema(
    z.strictObject({
      subscriptionId: z.uuid(),
      purchased: z.number().int().nonnegative().nullable(),
      occupied: z.number().int().nonnegative(),
      free: z.number().int().nonnegative().nullable(),
      asOf: z.string(),
    }),
  ),
) {}
