import { z } from 'zod';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';

const pageQuery = {
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
};
export const listAssignmentsQuerySchema = z.strictObject({
  subscriptionId: z.uuid().optional(),
  planId: z.uuid().optional(),
  employeeId: z.uuid().optional(),
  source: z.enum(['BASELINE', 'HANDOVER', 'REQUEST', 'RENEWAL_CARRY', 'MACHINE_ACCOUNT_CONVERSION']).optional(),
  kind: z.enum(['PERSONAL', 'SERVICE']).optional(),
  ...pageQuery,
});
export const assignmentIdParamSchema = z.strictObject({ id: z.uuid() });
export const subscriptionIdParamSchema = z.strictObject({ id: z.uuid() });

export const assignmentSchema = z.strictObject({
  id: z.uuid(),
  source: z.enum(['BASELINE', 'HANDOVER', 'REQUEST', 'RENEWAL_CARRY', 'MACHINE_ACCOUNT_CONVERSION']),
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
  isMachineAccount: z.boolean(),
  machineAccountNote: z.string().nullable(),
  failedAt: z.iso.datetime().nullable(),
  cancelledAt: z.iso.datetime().nullable(),
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

export class ListAssignmentsQueryDto extends createZodDto(listAssignmentsQuerySchema) {}
export class AssignmentIdParamDto extends createZodDto(assignmentIdParamSchema) {}
export class SubscriptionSeatsParamDto extends createZodDto(subscriptionIdParamSchema) {}
export class AssignmentPageResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ items: z.array(assignmentSummarySchema), pagination })),
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
