import { z } from 'zod';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';
import { businessDate } from '../../../infrastructure/http/dto/business-date.dto';

/**
 * Only the shape and a generous bound are checked here. Whether a link is an http or https address, a text is within 2000
 * characters, the review date has come, or a numeric install limit belongs to the kind of plan is judged by the policy and
 * answers with its own `PLAN_TERMS.*` code. The object is strict: there is no field for a legal conclusion, and the sharing
 * policy is not a field here because it is entered once, on the plan.
 */
const text = z.string().max(10000).nullable().optional();

export const planTermsBodySchema = z.strictObject({
  termsUrl: z.string().max(10000).nullable().optional(),
  lastReviewedOn: businessDate.nullable().optional(),
  aiTraining: text,
  dataLocation: text,
  installLimit: z
    .strictObject({
      maxDevicesPerKey: z.number().int().min(1).max(1_000_000).nullable().optional(),
      note: text,
    })
    .nullable()
    .optional(),
  commercialUse: text,
  cancellationRefund: text,
});
export const planWarningsQuerySchema = z.strictObject({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});
export const planIdParamSchema = z.strictObject({ id: z.uuid() });

const noticeSource = z.enum(['DECLARED', 'INFERRED_UNCONFIRMED', 'BY_END_DATE']);
const termsSchema = z.strictObject({
  termsUrl: z.string().nullable(),
  lastReviewedOn: z.string().nullable(),
  aiTraining: z.string().nullable(),
  dataLocation: z.string().nullable(),
  installLimit: z.strictObject({ maxDevicesPerKey: z.number().int().nullable(), note: z.string().nullable() }),
  commercialUse: z.string().nullable(),
  cancellationRefund: z.string().nullable(),
  updatedAt: z.iso.datetime(),
});
const warningSchema = z.strictObject({
  code: z.literal('TERMS_REVIEW_DUE'),
  planId: z.uuid(),
  planName: z.string(),
  applicationId: z.uuid(),
  applicationName: z.string(),
  subscriptionId: z.uuid(),
  noticeDeadline: z.strictObject({ value: z.string().nullable(), source: noticeSource }),
  baseDate: z.string(),
  reviewFrom: z.string(),
  lastReviewedOn: z.string().nullable(),
});

export class PlanTermsBodyDto extends createZodDto(planTermsBodySchema) {}
export class PlanWarningsQueryDto extends createZodDto(planWarningsQuerySchema) {}
export class PlanIdParamDto extends createZodDto(planIdParamSchema) {}
export class PlanTermsResponseDto extends createZodDto(
  successEnvelopeSchema(
    z.strictObject({
      planId: z.uuid(),
      applicable: z.boolean(),
      sharingPolicy: z.enum(['ALLOWED', 'NOT_ALLOWED']).nullable(),
      terms: termsSchema.nullable(),
      warnings: z.array(warningSchema).max(50),
      warningTotal: z.number().int().nonnegative(),
    }),
  ),
) {}
export class PlanTermsSetResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ terms: termsSchema, changed: z.boolean() })),
) {}
export class PlanWarningPageResponseDto extends createZodDto(
  successEnvelopeSchema(
    z.strictObject({
      items: z.array(warningSchema),
      pagination: z.strictObject({
        page: z.number().int().positive(),
        pageSize: z.number().int().positive(),
        totalItems: z.number().int().nonnegative(),
        totalPages: z.number().int().nonnegative(),
      }),
      asOf: z.string(),
    }),
  ),
) {}
