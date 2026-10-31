import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';
import { z } from 'zod';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import {
  PLAN_LINE_CHOICE_DESCRIPTION,
  oneChoice,
  planLineChoiceFields,
  requestStateSchema,
} from '../access-request/access-request.dto';
import { businessDate } from '../../../infrastructure/http/dto/business-date.dto';

const text = (max: number) => z.string().trim().min(1).max(max);
const money = z.strictObject({ amount: z.string(), currency: z.string() });
const employeeRef = z.strictObject({ employeeId: z.uuid(), employeeCode: z.string(), fullName: z.string() });

/** The most requests a head sends on at once: a bound against a typo, not a business rule. */
export const BATCH_MAX = 50;

export const planLineBodySchema = z
  .strictObject(planLineChoiceFields)
  .superRefine(oneChoice)
  .meta({ description: PLAN_LINE_CHOICE_DESCRIPTION });

export const submitBatchBodySchema = z.strictObject({
  requestIds: z
    .array(z.uuid())
    .min(1)
    .max(BATCH_MAX)
    .refine((ids) => new Set(ids).size === ids.length, { message: 'A request is sent once in a batch.' })
    .meta({ uniqueItems: true }),
});

export const supplementBodySchema = z
  .strictObject({
    /** The other day the money is expected to go out; the budget year and the price follow from it. */
    expectedSpendOn: businessDate.optional(),
    /** People of a request for a group the head leaves out; the price is made again for those who remain. */
    dropEmployeeIds: z
      .array(z.uuid())
      .min(1)
      .max(100)
      .refine((ids) => new Set(ids).size === ids.length, { message: 'A person is named once.' })
      .meta({ uniqueItems: true })
      .optional(),
    reason: text(1000),
  })
  .superRefine((body, ctx) => {
    if (body.expectedSpendOn === undefined && body.dropEmployeeIds === undefined) {
      ctx.addIssue({ code: 'custom', path: ['expectedSpendOn'], message: 'Change the day or leave people out.' });
    }
  })
  .meta({ description: 'Give at least one of expectedSpendOn and dropEmployeeIds.' });

const pageQuery = {
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
};
export const pageQuerySchema = z.strictObject(pageQuery);
export const idParamSchema = z.strictObject({ id: z.uuid() });

const pagination = z.strictObject({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalItems: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});
const page = <T extends z.ZodType>(item: T) =>
  successEnvelopeSchema(z.strictObject({ items: z.array(item), pagination }));

const stageSchema = z.enum(['NOT_SUBMITTED', 'BLOCKED', 'RETURNED_BY_FINANCE']);
const blockedReasonSchema = z.enum(['STALE_COST_EVIDENCE', 'CLOSED_OR_EXPIRED_BUDGET_PERIOD']);

/** A request waiting in the queue of the head: what it is, what it costs, and why it is not yet sent, never a budget figure. */
const queueItemSchema = z.strictObject({
  requestId: z.uuid(),
  plan: z.strictObject({ planId: z.uuid(), planName: z.string(), applicationName: z.string() }).nullable(),
  softwareName: z.string().nullable(),
  requester: employeeRef,
  /** The person it is for; null for a request for a group, whose people are read as lines. */
  beneficiary: employeeRef.nullable(),
  /** How many people the request is for. */
  lineCount: z.number().int().positive(),
  amount: money.nullable(),
  expectedSpendOn: z.string().nullable(),
  budgetYear: z.number().int().nullable(),
  stage: stageSchema,
  blockedReason: blockedReasonSchema.nullable(),
  financeReturnReason: z.string().nullable(),
  /** The head chose "outside the plan". */
  offPlan: z.boolean(),
  /** The request is attached to a line of the plan. */
  planLineAttached: z.boolean(),
  /** A line or "outside the plan" is chosen, and the price is there: it can be sent on. */
  readyToSubmit: z.boolean(),
  updatedAt: z.iso.datetime(),
  /** When the request last entered the queue; null for a request that entered it before the moment was kept. */
  queuedAt: z.iso.datetime().nullable(),
  /** Working days the request has waited in the queue since it entered it. */
  waitedWorkingDays: z.number().int().nonnegative(),
  /** The request has waited longer than the days the head may take, as they were when it entered the queue. */
  overdue: z.boolean(),
  /** How many reminders the head has had about this request. */
  reminders: z.number().int().nonnegative(),
});

const batchSchema = z.strictObject({
  id: z.uuid(),
  department: z.strictObject({ id: z.uuid(), code: z.string() }),
  submittedBy: employeeRef,
  submittedAt: z.iso.datetime(),
  itemCount: z.number().int().positive(),
});

const batchItemSchema = z.strictObject({
  requestId: z.uuid(),
  position: z.number().int().positive(),
  outcome: z.enum(['SENT_TO_APPROVER', 'SENT_TO_FINANCE', 'STOPPED']),
  stopReason: z
    .enum([
      'PLAN_LINE_REQUIRED',
      'STALE_COST_EVIDENCE',
      'CLOSED_OR_EXPIRED_BUDGET_PERIOD',
      'PRICE_MISSING',
      'RATE_MISSING',
    ])
    .nullable(),
  leftReason: z
    .enum(['RETURNED_BY_FINANCE', 'CONFLICT_OF_INTEREST', 'REQUEST_WITHDRAWN', 'REQUEST_CANCELLED'])
    .nullable(),
  leftAt: z.iso.datetime().nullable(),
  /** Where the request is now; it is the request that holds the state, never the batch. */
  requestState: requestStateSchema,
});

/** A line of the current plan the request may be attached to. */
const suggestionSchema = z.strictObject({
  position: z.number().int().positive(),
  description: z.string(),
  plan: z.strictObject({ planId: z.uuid(), planName: z.string() }).nullable(),
  amount: money,
  windowFrom: z.string(),
  windowTo: z.string(),
  /** The window has gone by: attaching the line needs the head to confirm it is still needed. */
  overdue: z.boolean(),
  /** The line is for the plan the request asks for. */
  suggested: z.boolean(),
});

const supplementSchema = z.strictObject({
  number: z.number().int().positive(),
  reason: z.string(),
  changedBy: employeeRef,
  createdAt: z.iso.datetime(),
  expectedSpendOn: z.strictObject({ before: z.string(), after: z.string() }),
  budgetYear: z.strictObject({ before: z.number().int(), after: z.number().int() }),
  amount: z.strictObject({ before: money, after: money }),
  /** How many people of a request for a group the file left out (who they are: the lines that ended as DROPPED); 0 for any other file. */
  droppedCount: z.number().int().nonnegative(),
});

const planLineStateSchema = z.strictObject({
  requestId: z.uuid(),
  offPlan: z.boolean(),
  planLineAttached: z.boolean(),
  /** The head confirmed that a line whose window has gone by is still needed. */
  stillNeeded: z.boolean(),
});

export class PlanLineBodyDto extends createZodDto(planLineBodySchema) {}
export class SubmitBatchBodyDto extends createZodDto(submitBatchBodySchema) {}
export class SupplementBodyDto extends createZodDto(supplementBodySchema) {}
export class PageQueryDto extends createZodDto(pageQuerySchema) {}
export class IdParamDto extends createZodDto(idParamSchema) {}
export class QueueResponseDto extends createZodDto(page(queueItemSchema)) {}
export class BatchResponseDto extends createZodDto(successEnvelopeSchema(z.strictObject({ batch: batchSchema }))) {}
export class BatchItemListResponseDto extends createZodDto(page(batchItemSchema)) {}
export class SuggestionListResponseDto extends createZodDto(page(suggestionSchema)) {}
export class SupplementResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ supplement: supplementSchema })),
) {}
export class SupplementListResponseDto extends createZodDto(page(supplementSchema)) {}
export class PlanLineResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ planLine: planLineStateSchema })),
) {}

export type QueueItemWire = z.infer<typeof queueItemSchema>;
export type BatchWire = z.infer<typeof batchSchema>;
export type BatchItemWire = z.infer<typeof batchItemSchema>;
export type SuggestionWire = z.infer<typeof suggestionSchema>;
export type SupplementWire = z.infer<typeof supplementSchema>;
export type PlanLineStateWire = z.infer<typeof planLineStateSchema>;
export type PlanLineBody = z.infer<typeof planLineBodySchema>;
