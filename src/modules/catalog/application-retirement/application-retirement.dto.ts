import { z } from 'zod';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';
import { RETIREMENT_LIST_LIMIT } from './application-retirement.policy';

export const retirementParamSchema = z.strictObject({ id: z.uuid() });

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

export class RetirementParamDto extends createZodDto(retirementParamSchema) {}
export class RetirementResponseDto extends createZodDto(
  successEnvelopeSchema(
    z.strictObject({
      retirement: z.strictObject({
        status: z.enum(['APPROVED', 'RETIRED']),
        retiredAt: z.iso.datetime().nullable(),
        blockers: blockersSchema,
        canRetire: z.boolean(),
      }),
    }),
  ),
) {}
export class RetiredResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ id: z.uuid(), status: z.enum(['RETIRED']) })),
) {}
