import { z } from 'zod';
import { successEnvelopeSchema } from '../../../../infrastructure/http/dto/success-envelope.dto';
import { createZodDto } from '../../../../infrastructure/http/dto/zod-dto';
import { RETIREMENT_LIST_LIMIT, RETIREMENT_NOTE_MAX_LENGTH } from './application-retirement.policy';

/**
 * Only the shape and a generous bound are checked here. Whether the person is the Business Owner of today and still
 * works, and whether the note says anything, is judged by the retirement policy and service and answers with its own code.
 */
export const confirmRetirementBodySchema = z.strictObject({
  businessOwnerEmployeeId: z.uuid(),
  note: z.string().max(RETIREMENT_NOTE_MAX_LENGTH).default(''),
});
export const retirementParamSchema = z.strictObject({ id: z.uuid() });

const confirmationSchema = z.strictObject({
  id: z.uuid(),
  applicationId: z.uuid(),
  businessOwnerEmployeeId: z.uuid(),
  note: z.string(),
  recordedBy: z.uuid(),
  recordedAt: z.iso.datetime(),
});
const blockingAssignmentSchema = z.strictObject({
  assignmentId: z.uuid(),
  employeeId: z.uuid(),
  employeeCode: z.string().nullable(),
  fullName: z.string().nullable(),
  planId: z.uuid(),
  planName: z.string(),
  subscriptionId: z.uuid().nullable(),
});
const blockingSubscriptionSchema = z.strictObject({
  subscriptionId: z.uuid(),
  planId: z.uuid(),
  planName: z.string(),
  endDate: z.string().nullable(),
});
const blockersSchema = z.strictObject({
  assignments: z.array(blockingAssignmentSchema).max(RETIREMENT_LIST_LIMIT),
  assignmentTotal: z.number().int().nonnegative(),
  assignmentsByPlan: z
    .array(z.strictObject({ planId: z.uuid(), planName: z.string(), count: z.number().int().positive() }))
    .max(RETIREMENT_LIST_LIMIT),
  subscriptions: z.array(blockingSubscriptionSchema).max(RETIREMENT_LIST_LIMIT),
  subscriptionTotal: z.number().int().nonnegative(),
});

export class ConfirmRetirementBodyDto extends createZodDto(confirmRetirementBodySchema) {}
export class RetirementParamDto extends createZodDto(retirementParamSchema) {}
export class RetirementConfirmationResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ confirmation: confirmationSchema })),
) {}
export class RetirementResponseDto extends createZodDto(
  successEnvelopeSchema(
    z.strictObject({
      retirement: z.strictObject({
        status: z.enum(['APPROVED', 'RETIRED']),
        retiredAt: z.iso.datetime().nullable(),
        confirmations: z.array(confirmationSchema).max(RETIREMENT_LIST_LIMIT),
        confirmationTotal: z.number().int().nonnegative(),
        confirmed: z.boolean(),
        blockers: blockersSchema,
        canRetire: z.boolean(),
      }),
    }),
  ),
) {}
export class RetiredResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ id: z.uuid(), status: z.enum(['RETIRED']) })),
) {}
