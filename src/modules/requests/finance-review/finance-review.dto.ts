import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';
import { z } from 'zod';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';

const text = (max: number) => z.string().trim().min(1).max(max);
const money = z.strictObject({ amount: z.string(), currency: z.string() });
const employeeRef = z.strictObject({ employeeId: z.uuid(), employeeCode: z.string(), fullName: z.string() });
const codeSchema = z.enum([
  'BUDGET_OK',
  'HIGH_VALUE',
  'INSUFFICIENT_BUDGET',
  'NO_ACTIVE_BUDGET',
  'CLOSED_OR_EXPIRED_BUDGET_PERIOD',
  'STALE_COST_EVIDENCE',
  'PLAN_LINE_OVERDUE',
]);

/**
 * How Finance ends a review (`US-06-13`): an opinion with the direction it advises, the request given back to the head with
 * a reason, or a budget asked for with a reason. None of the three approves or refuses the request, and none can be saved
 * without what it needs (`AC-3`).
 */
export const reviewBodySchema = z
  .strictObject({
    outcome: z.enum(['ASSESSED', 'RETURN_TO_HEAD', 'NEEDS_BUDGET']),
    opinion: text(2000).optional(),
    direction: z.enum(['RECOMMEND_APPROVE', 'RECOMMEND_OVERRIDE', 'RECOMMEND_REJECT']).optional(),
    reason: text(1000).optional(),
  })
  .superRefine((body, ctx) => {
    const issue = (path: 'opinion' | 'direction' | 'reason', message: string) =>
      ctx.addIssue({ code: 'custom', path: [path], message });
    if (body.outcome === 'ASSESSED') {
      if (body.opinion === undefined) issue('opinion', 'An opinion needs its text.');
      if (body.direction === undefined) issue('direction', 'An opinion needs the direction it advises.');
      if (body.reason !== undefined) issue('reason', 'An opinion gives no reason.');

      return;
    }
    if (body.reason === undefined) issue('reason', 'This outcome needs its reason.');
    if (body.opinion !== undefined) issue('opinion', 'This outcome gives no opinion.');
    if (body.direction !== undefined) issue('direction', 'This outcome gives no direction.');
  })
  .meta({
    description:
      'An assessment (outcome ASSESSED) gives its opinion and the direction it advises, and no reason. Every other outcome gives ' +
      'its reason, and no opinion and no direction.',
  });

const pageQuery = {
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
};
export const reviewListQuerySchema = z.strictObject({
  state: z.enum(['PENDING', 'WAITING']).optional(),
  ...pageQuery,
});
export const yearsQuerySchema = z.strictObject(pageQuery);
export const requestParamSchema = z.strictObject({ id: z.uuid() });

const pagination = z.strictObject({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalItems: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});
const page = <T extends z.ZodType>(item: T) =>
  successEnvelopeSchema(z.strictObject({ items: z.array(item), pagination }));

/** A row of the queue of Finance: what is waiting and for what. Not the figures of the check. */
const reviewSummarySchema = z.strictObject({
  requestId: z.uuid(),
  stepId: z.uuid(),
  state: z.enum(['PENDING', 'WAITING']),
  waitingReason: z.enum(['NO_FINANCE_REVIEWER']).nullable(),
  openedAt: z.iso.datetime(),
  slaWorkingDays: z.number().int().positive(),
  costCenter: z.strictObject({ id: z.uuid(), code: z.string() }),
  requester: employeeRef,
  amount: money.nullable(),
  /** The first code the check gave, the most pressing. */
  primaryCode: codeSchema.nullable(),
  planLineOverdue: z.boolean(),
  offPlan: z.boolean(),
});

const checkSchema = z.strictObject({
  id: z.uuid(),
  number: z.number().int().positive(),
  trigger: z.enum([
    'SUBMISSION',
    'PLAN_LINE_MOVED',
    'BUDGET_VERSION_APPROVED',
    'SPEND_DECISION',
    'FINANCE_OUTCOME_WHILE_WAITING',
  ]),
  route: z.enum(['BLOCKED', 'FINANCE_REVIEW', 'SPEND_APPROVAL']),
  primaryCode: codeSchema.nullable(),
  staleCostEvidence: z.boolean(),
  planLineOverdue: z.boolean(),
  periodClosed: z.boolean(),
  /** The head chose "outside the plan": information only, never an exception (`US-06-12` AC-10). */
  offPlan: z.boolean(),
  /** The spend step has no independent review, because Finance is the one the request is for (`US-06-13` AC-5). */
  noIndependentReview: z.boolean(),
  /** What binds the company in all, in the reporting currency; it is never compared with the budget of one year. */
  bindingTotal: money,
  yearCount: z.number().int().positive(),
  ranAt: z.iso.datetime(),
});

const stepSchema = z.strictObject({
  id: z.uuid(),
  state: z.enum(['PENDING', 'WAITING', 'COMPLETED', 'CLOSED']),
  waitingReason: z.enum(['NO_FINANCE_REVIEWER']).nullable(),
  assignee: employeeRef.nullable(),
  openedAt: z.iso.datetime(),
  closedAt: z.iso.datetime().nullable(),
  slaWorkingDays: z.number().int().positive(),
});

/** How the review ended, as the spending approver reads it next to the check (`US-06-13` AC-8). */
const reviewRecordSchema = z.strictObject({
  outcome: z.enum(['ASSESSED', 'RETURNED_TO_HEAD', 'BUDGET_REVISION_NEEDED', 'LINE_UPDATED']),
  opinion: z.string().nullable(),
  direction: z.enum(['RECOMMEND_APPROVE', 'RECOMMEND_OVERRIDE', 'RECOMMEND_REJECT']).nullable(),
  reason: z.string().nullable(),
  decidedBy: employeeRef,
  decidedAt: z.iso.datetime(),
});

const reviewDetailSchema = z.strictObject({
  requestId: z.uuid(),
  step: stepSchema,
  check: checkSchema,
  /** Null while the review is open. */
  review: reviewRecordSchema.nullable(),
});

/** One year of a check: its slice of the cost and the figures of the budget the check read. */
const yearSchema = z.strictObject({
  year: z.number().int(),
  cost: money,
  /** Null for a year that has ended: it is not judged. */
  code: z.enum(['BUDGET_OK', 'HIGH_VALUE', 'INSUFFICIENT_BUDGET', 'NO_ACTIVE_BUDGET']).nullable(),
  budget: money.nullable(),
  held: money.nullable(),
  spent: money.nullable(),
  /** Negative when more is held than the budget allows. Null when the year has no budget: that is not a budget of 0. */
  remaining: money.nullable(),
  shareBasisPoints: z.number().int().nonnegative().nullable(),
  /** What the other requests of the Cost Center that wait to be decided cost in the year; null for a year that has ended. */
  pending: money.nullable(),
  /** The spending approver accepted the exception of this year in their decision (`US-06-01` AC-21). */
  overridden: z.boolean(),
});

export class ReviewBodyDto extends createZodDto(reviewBodySchema) {}
export class ReviewListQueryDto extends createZodDto(reviewListQuerySchema) {}
export class YearsQueryDto extends createZodDto(yearsQuerySchema) {}
export class RequestParamDto extends createZodDto(requestParamSchema) {}
export class ReviewListResponseDto extends createZodDto(page(reviewSummarySchema)) {}
export class ReviewDetailResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ financeReview: reviewDetailSchema })),
) {}
export class BudgetCheckResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ budgetCheck: checkSchema })),
) {}
export class YearListResponseDto extends createZodDto(page(yearSchema)) {}

export type ReviewBody = z.infer<typeof reviewBodySchema>;
export type ReviewSummaryWire = z.infer<typeof reviewSummarySchema>;
export type CheckWire = z.infer<typeof checkSchema>;
export type ReviewDetailWire = z.infer<typeof reviewDetailSchema>;
export type YearWire = z.infer<typeof yearSchema>;
