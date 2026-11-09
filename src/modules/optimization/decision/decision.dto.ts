import { z } from 'zod';
import { businessDate, responseBusinessDate } from '../../../infrastructure/http/dto/business-date.dto';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';
import { GHOST_SEAT_GROUPS, GHOST_SEAT_STATES, GHOST_SEAT_TIERS } from '../ghost-seat/ghost-seat.types';

const pagination = z.strictObject({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalItems: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

const reason = z
  .string()
  .trim()
  .min(3)
  .max(1000)
  .meta({ description: 'Why: 3 to 1000 characters, for every choice (`US-10-06` AC-5).' });
const choice = z.enum(['KEEP', 'RECLAIM', 'EXEMPT']);

export const queueQuerySchema = z.strictObject({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export const decisionBodySchema = z
  .strictObject({
    items: z
      .array(z.strictObject({ recommendationId: z.uuid() }))
      .min(1)
      .max(50)
      .meta({ description: 'The recommendations the one choice and reason apply to (1 to 50), all or none.' }),
    choice,
    reason,
    exemptUntil: businessDate
      .optional()
      .meta({ description: 'Only for EXEMPT: the last day, after today and at most 12 months from today.' }),
  })
  .superRefine((body, context) => {
    if (body.choice !== 'EXEMPT' && body.exemptUntil !== undefined) {
      context.addIssue({ code: 'custom', path: ['exemptUntil'], message: 'Only an exemption has an end day.' });
    }
  });

export const decisionListQuerySchema = z.strictObject({
  selfDecided: z
    .enum(['true', 'false'])
    .optional()
    .meta({ description: 'true: only what a head decided on their own seat (the report of `US-10-03` AC-13).' }),
  page: queueQuerySchema.shape.page,
  pageSize: queueQuerySchema.shape.pageSize,
});

export const returnBodySchema = z.strictObject({ reason });
export const recommendationIdParamSchema = z.strictObject({ id: z.uuid() });

const queueItemSchema = z.strictObject({
  id: z.uuid(),
  group: z.enum(GHOST_SEAT_GROUPS),
  tier: z.enum(GHOST_SEAT_TIERS).nullable(),
  state: z.enum(GHOST_SEAT_STATES),
  holder: z.strictObject({ employeeId: z.uuid(), employeeCode: z.string(), fullName: z.string() }),
  selfSeat: z
    .boolean()
    .meta({ description: 'The seat is the head’s own: the reason is mandatory and the act is marked.' }),
  application: z.strictObject({ applicationId: z.uuid(), applicationName: z.string() }),
  plan: z.strictObject({ planId: z.uuid(), planName: z.string() }),
  decisionDueOn: responseBusinessDate.nullable(),
  overdue: z.boolean().meta({ description: 'Past the due day: only a reminder, nothing is decided for the head.' }),
  returnReason: z.string().nullable().meta({ description: 'Why the IT Admin returned a reclaim to the head.' }),
  previousDecision: z
    .strictObject({ choice, reason: z.string(), decidedOn: responseBusinessDate })
    .nullable()
    .meta({ description: 'What the head chose before the IT Admin returned it.' }),
  evidence: z
    .record(z.string(), z.unknown())
    .meta({ description: 'What the recommendation was made from (no usage volume).' }),
  createdAt: z.iso.datetime(),
});

export const queuePageSchema = z.strictObject({
  items: z.array(queueItemSchema).meta({ description: 'Sorted by holder, so the rows of one person sit together.' }),
  holderCount: z
    .number()
    .int()
    .nonnegative()
    .meta({ description: 'How many people the items of this page are about.' }),
  pagination,
});

const outcomeSchema = z.strictObject({
  recommendationId: z.uuid(),
  choice,
  outcome: z.enum(['KEPT', 'EXEMPTED', 'RECLAIM_DECIDED', 'LEFT_TO_EXPIRE']),
  revocationTaskId: z.uuid().nullable(),
  notBefore: responseBusinessDate.nullable(),
  selfDecided: z.boolean(),
});

const decisionItemSchema = z.strictObject({
  id: z.uuid(),
  recommendationId: z.uuid(),
  choice,
  reason: z.string(),
  exemptUntil: responseBusinessDate.nullable(),
  decidedOn: responseBusinessDate,
  decidedAt: z.iso.datetime(),
  decidedBy: z.strictObject({ employeeId: z.uuid(), employeeCode: z.string(), fullName: z.string() }),
  deciderDepartmentId: z.uuid(),
  selfDecided: z.boolean(),
});

const exemptionItemSchema = z.strictObject({
  id: z.uuid(),
  recommendationId: z.uuid(),
  holder: z.strictObject({ employeeId: z.uuid(), employeeCode: z.string(), fullName: z.string() }).nullable(),
  application: z.strictObject({ applicationId: z.uuid(), applicationName: z.string() }),
  exemptUntil: responseBusinessDate,
  createdAt: z.iso.datetime(),
  remindedAt: z.iso.datetime().nullable(),
  endedAt: z.iso.datetime().nullable(),
});

const returnedSchema = z.strictObject({
  recommendationId: z.uuid(),
  state: z.enum(GHOST_SEAT_STATES),
  returnCount: z.number().int().nonnegative(),
  decisionDueOn: responseBusinessDate.nullable(),
});

export class QueueQueryDto extends createZodDto(queueQuerySchema) {}
export class DecisionBodyDto extends createZodDto(decisionBodySchema) {}
export class ReturnBodyDto extends createZodDto(returnBodySchema) {}
export class RecommendationIdParamDto extends createZodDto(recommendationIdParamSchema) {}
export class QueuePageResponseDto extends createZodDto(successEnvelopeSchema(queuePageSchema)) {}
export class DecisionCreatedResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ items: z.array(outcomeSchema) })),
) {}
export class ReturnedResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ recommendation: returnedSchema })),
) {}
export class DecisionListQueryDto extends createZodDto(decisionListQuerySchema) {}
export class DecisionPageResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ items: z.array(decisionItemSchema), pagination })),
) {}
export class ExemptionPageResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ items: z.array(exemptionItemSchema), pagination })),
) {}
