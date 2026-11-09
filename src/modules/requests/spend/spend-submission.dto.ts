import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';
import { z } from 'zod';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { businessDate } from '../../../infrastructure/http/dto/business-date.dto';
import { requestStateSchema } from '../access-request/access-request.dto';

const text = (max: number) => z.string().trim().min(1).max(max);
const money = z.strictObject({ amount: z.string(), currency: z.string() });
const employeeRef = z.strictObject({ employeeId: z.uuid(), employeeCode: z.string(), fullName: z.string() });

/** The most requests a head sends on at once: a bound against a typo, not a business rule. */
export const BATCH_MAX = 50;

/** The one line of reason the head gives when a request uses the reserve (`BR-MF1-06h`): 1 to 500 characters, on one line. */
export const reserveReasonSchema = z
  .string()
  .trim()
  .min(1)
  .max(500)
  .refine((value) => !/[\r\n]/.test(value), { message: 'The reason is one line.' });

export const submitBatchBodySchema = z.strictObject({
  requestIds: z
    .array(z.uuid())
    .min(1)
    .max(BATCH_MAX)
    .refine((ids) => new Set(ids).size === ids.length, { message: 'A request is sent once in a batch.' })
    .meta({ uniqueItems: true }),
  /**
   * The confirmations of the reserve the head gives in the same act (`RV-11`): each applies only to a request of the batch whose check
   * says it uses the reserve now; one whose check says otherwise is left as it is and the answer says it was ignored.
   */
  reserveConfirmations: z
    .array(z.strictObject({ requestId: z.uuid(), reason: reserveReasonSchema }))
    .max(BATCH_MAX)
    .refine((items) => new Set(items.map((item) => item.requestId)).size === items.length, {
      message: 'A request is confirmed once.',
    })
    .optional(),
});

export const reserveConfirmationBodySchema = z.strictObject({ reason: reserveReasonSchema });

export const supplementBodySchema = z
  .strictObject({
    /** People of a request for a group the head leaves out; the price is made again for those who remain. */
    dropEmployeeIds: z
      .array(z.uuid())
      .min(1)
      .max(100)
      .refine((ids) => new Set(ids).size === ids.length, { message: 'A person is named once.' })
      .meta({ uniqueItems: true })
      .optional(),
    /** An earlier day the right ends than the request has (a request with no end may be given one); the price is made again for it. */
    expectedEndDate: businessDate.optional(),
    reason: text(1000),
  })
  .refine((body) => body.dropEmployeeIds !== undefined || body.expectedEndDate !== undefined, {
    message: 'Name the people to leave out, an earlier end date, or both.',
  })
  .meta({ description: 'The people of the group the head leaves out and/or an earlier end date, and why.' });

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

const stageSchema = z.enum(['NOT_SUBMITTED', 'RESERVE_CONFIRMATION', 'BLOCKED']);
const budgetOutcomeSchema = z.enum(['WITHIN_BASE', 'USES_RESERVE', 'BLOCKED']);
const blockReasonSchema = z.enum(['PRICE_EXPIRED', 'NO_APPROVED_BUDGET', 'OVER_RESERVE']);

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
  budgetYear: z.number().int().nullable(),
  stage: stageSchema,
  /**
   * What a check made now would say (`BR-MF1-06g`): within the base, uses the reserve (the head needs a line of reason to send it on) or
   * blocked. Null for a request that is not priced, or that cannot be checked now (no rate).
   */
  budgetOutcome: budgetOutcomeSchema.nullable(),
  /** Why it is blocked, every reason; empty unless `budgetOutcome` is `BLOCKED`. */
  blockedReasons: z.array(blockReasonSchema).max(3),
  /** How much it is over the base (uses the reserve) or over the reserve (blocked for that), in the reporting currency; never what is left. */
  overBy: money.nullable(),
  /** The price is there: it can be sent on. */
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

/** How one request of the batch fared and what became of the confirmation of the reserve the head gave for it, if any. */
const submitResultSchema = z.strictObject({
  requestId: z.uuid(),
  outcome: z.enum(['SENT_TO_APPROVER', 'AWAITING_RESERVE_CONFIRMATION', 'STOPPED']),
  stopReason: z
    .enum(['PRICE_EXPIRED', 'NO_APPROVED_BUDGET', 'OVER_RESERVE', 'PRICE_MISSING', 'RATE_MISSING'])
    .nullable(),
  /** `APPLIED`: the confirmation was kept and the spend step opened; `IGNORED`: it was given for a request that does not use the reserve; `NOT_GIVEN`. */
  reserveConfirmation: z.enum(['APPLIED', 'IGNORED', 'NOT_GIVEN']),
});

/** What the confirmation of the reserve did: the request after the check made again for the day of the confirmation. */
const reserveConfirmationResultSchema = z.strictObject({
  requestId: z.uuid(),
  /** `SPEND_STEP_OPENED`: the step is for the approver; `BLOCKED`: the check made again blocks the request, nothing was confirmed. */
  result: z.enum(['SPEND_STEP_OPENED', 'BLOCKED']),
  /** What the check made for the confirmation says. */
  budgetOutcome: budgetOutcomeSchema,
  blockedReasons: z.array(blockReasonSchema).max(3),
  /** Whether the confirmation was kept: false when the check made again finds the request within the base, which needs none. */
  confirmationKept: z.boolean(),
});

const batchItemSchema = z.strictObject({
  requestId: z.uuid(),
  position: z.number().int().positive(),
  /** `SENT_TO_FINANCE` is read from batches made before; it is not given any more. */
  outcome: z.enum(['SENT_TO_APPROVER', 'AWAITING_RESERVE_CONFIRMATION', 'STOPPED', 'SENT_TO_FINANCE']),
  stopReason: z
    .enum([
      'PRICE_EXPIRED',
      'NO_APPROVED_BUDGET',
      'OVER_RESERVE',
      'PRICE_MISSING',
      'RATE_MISSING',
      'STALE_COST_EVIDENCE',
      'CLOSED_OR_EXPIRED_BUDGET_PERIOD',
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
const supplementSchema = z.strictObject({
  number: z.number().int().positive(),
  reason: z.string(),
  changedBy: employeeRef,
  createdAt: z.iso.datetime(),
  budgetYear: z.strictObject({ before: z.number().int(), after: z.number().int() }),
  /** The day the right ends before and after the file; null for a right with no end. */
  expectedEndDate: z.strictObject({ before: z.string().nullable(), after: z.string().nullable() }),
  amount: z.strictObject({ before: money, after: money }),
  /** How many people of a request for a group the file left out (who they are: the lines that ended as DROPPED); 0 for any other file. */
  droppedCount: z.number().int().nonnegative(),
});

export class SubmitBatchBodyDto extends createZodDto(submitBatchBodySchema) {}
export class ReserveConfirmationBodyDto extends createZodDto(reserveConfirmationBodySchema) {}
export class SupplementBodyDto extends createZodDto(supplementBodySchema) {}
export class PageQueryDto extends createZodDto(pageQuerySchema) {}
export class IdParamDto extends createZodDto(idParamSchema) {}
export class QueueResponseDto extends createZodDto(page(queueItemSchema)) {}
export class BatchResponseDto extends createZodDto(successEnvelopeSchema(z.strictObject({ batch: batchSchema }))) {}
export class SubmitBatchResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ batch: batchSchema, results: z.array(submitResultSchema) })),
) {}
export class ReserveConfirmationResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ reserveConfirmation: reserveConfirmationResultSchema })),
) {}
export class BatchItemListResponseDto extends createZodDto(page(batchItemSchema)) {}
export class SupplementResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ supplement: supplementSchema })),
) {}
export class SupplementListResponseDto extends createZodDto(page(supplementSchema)) {}

export type QueueItemWire = z.infer<typeof queueItemSchema>;
export type SubmitResultWire = z.infer<typeof submitResultSchema>;
export type ReserveConfirmationResultWire = z.infer<typeof reserveConfirmationResultSchema>;
export type SubmitBatchBody = z.infer<typeof submitBatchBodySchema>;
export type BatchWire = z.infer<typeof batchSchema>;
export type BatchItemWire = z.infer<typeof batchItemSchema>;
export type SupplementWire = z.infer<typeof supplementSchema>;
