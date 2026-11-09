import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';
import { z } from 'zod';
import { responseBusinessDate } from '../../../infrastructure/http/dto/business-date.dto';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { costEstimateSchema } from '../access-request/access-request.dto';
import { BATCH_MAX } from '../spend/spend-submission.dto';

const text = (max: number) => z.string().trim().min(1).max(max);
const money = z.strictObject({ amount: z.string(), currency: z.string() });
const employeeRef = z.strictObject({ employeeId: z.uuid(), employeeCode: z.string(), fullName: z.string() });

/**
 * How the spending approver decides (`US-06-01`): approve, or refuse with a reason (`AC-4`). A request that is blocked when it is
 * checked again, or that uses a reserve the head has not confirmed, is not decided (`BR-MF1-07c`); there is no field for an override, a
 * figure, a snapshot or a signature.
 */
export const spendDecisionBodySchema = z
  .strictObject({
    decision: z.enum(['APPROVE', 'REJECT']),
    reason: text(1000).optional(),
  })
  .superRefine((body, ctx) => {
    if (body.decision === 'REJECT' && body.reason === undefined) {
      ctx.addIssue({ code: 'custom', path: ['reason'], message: 'A refusal gives its reason.' });
    }
    if (body.decision === 'APPROVE' && body.reason !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['reason'],
        message: 'An approval gives no reason.',
      });
    }
  })
  .meta({
    description: 'A refusal (REJECT) gives its reason. An approval (APPROVE) gives no reason.',
  });

/** Approving or refusing the requests of a batch the person holds, one by one, in the order chosen (`AC-19`, `AC-20`). */
export const batchDecisionBodySchema = z
  .strictObject({
    decision: z.enum(['APPROVE', 'REJECT']),
    requestIds: z
      .array(z.uuid())
      .min(1)
      .max(BATCH_MAX)
      .refine((ids) => new Set(ids).size === ids.length, { message: 'A request is decided once.' })
      .meta({ uniqueItems: true }),
    reason: text(1000).optional(),
  })
  .superRefine((body, ctx) => {
    if (body.decision === 'REJECT' && body.reason === undefined) {
      ctx.addIssue({ code: 'custom', path: ['reason'], message: 'A refusal gives its reason.' });
    }
    if (body.decision === 'APPROVE' && body.reason !== undefined) {
      ctx.addIssue({ code: 'custom', path: ['reason'], message: 'An approval gives no reason.' });
    }
  })
  .meta({
    description: 'A refusal (REJECT) gives its reason; an approval (APPROVE) gives none. A request is decided once.',
  });

const pageQuery = {
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
};
export const approvalQuerySchema = z.strictObject(pageQuery);

const pagination = z.strictObject({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalItems: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

const codeSchema = z.enum([
  'BUDGET_OK',
  'HIGH_VALUE',
  'INSUFFICIENT_BUDGET',
  'NO_ACTIVE_BUDGET',
  'CLOSED_OR_EXPIRED_BUDGET_PERIOD',
  'STALE_COST_EVIDENCE',
]);
const budgetOutcomeSchema = z.enum(['WITHIN_BASE', 'USES_RESERVE', 'BLOCKED']);
const blockReasonSchema = z.enum(['PRICE_EXPIRED', 'NO_APPROVED_BUDGET', 'OVER_RESERVE']);

/**
 * The budget of the Cost Center of the request as the spending approver reads it (`BR-MF1-06e`, `BR-MF1-07b`): the base and the reserve of
 * the approved version, what is spent, held and waiting to be decided, what is left of the base and with the reserve, and what a check says. It
 * is the check made at the moment of reading while the step is open, and the check the decision kept once it is decided. Money in the
 * reporting currency; the figures of a year with no approved version are null.
 */
const budgetSnapshotSchema = z.strictObject({
  year: z.number().int(),
  base: money.nullable(),
  reserve: money.nullable(),
  spent: money.nullable(),
  /** What the commitments attached to the approved version hold. */
  committed: money.nullable(),
  /** What the other requests of the Cost Center that wait to be decided as spend cost (the request itself is not counted). */
  pending: money.nullable(),
  remainingBase: money.nullable(),
  /** Negative when more is held than base and reserve allow. */
  remainingWithReserve: money.nullable(),
  outcome: budgetOutcomeSchema,
  blockedReasons: z.array(blockReasonSchema).max(3),
  overBaseBy: money.nullable(),
  overBy: money.nullable(),
  /** The confirmation of the head that opened this step, when the request uses the reserve. */
  reserveConfirmation: z
    .strictObject({ reason: z.string(), confirmedBy: employeeRef, confirmedAt: z.iso.datetime() })
    .nullable(),
  /** The check kept with the decision once the step is decided; null while it is read live. */
  decisionSnapshotCheckId: z.uuid().nullable(),
  computedAt: z.iso.datetime(),
});

/** A request waiting for the approver: what it is, what it costs, and the first code of its check. */
const approvalSummarySchema = z.strictObject({
  requestId: z.uuid(),
  stepId: z.uuid(),
  /** The kind of step the row is, the same key the list of the need steps carries, so a client can put the two lists in one. */
  stepKind: z.literal('SPEND_APPROVAL'),
  openedAt: z.iso.datetime(),
  slaWorkingDays: z.number().int().positive(),
  /** The business day the step is due as YYYY-MM-DD, counted on the calendar of the organization. */
  dueOn: responseBusinessDate,
  plan: z.strictObject({ planId: z.uuid(), planName: z.string(), applicationName: z.string() }).nullable(),
  softwareName: z.string().nullable(),
  requester: employeeRef,
  /** The person it is for; null for a request for a group. */
  beneficiary: employeeRef.nullable(),
  /** How many people the request is for. */
  lineCount: z.number().int().positive(),
  costCenter: z.strictObject({ id: z.uuid(), code: z.string() }),
  amount: money.nullable(),
  primaryCode: codeSchema.nullable(),
  /** What the check the step was opened on said: within the base, or it uses the reserve (the head confirmed it). Null for an old step. */
  outcome: budgetOutcomeSchema.nullable(),
  /** The same person holds the need step and this one. */
  samePersonAsSpend: z.boolean(),
  /** The batch it was last sent in, when it was sent in one. */
  batchId: z.uuid().nullable(),
});

const decisionSchema = z.strictObject({
  decision: z.enum(['APPROVED', 'REJECTED']),
  reason: z.string().nullable(),
  decidedBy: employeeRef,
  decidedAt: z.iso.datetime(),
});

const assessmentSchema = z.strictObject({
  classification: z.enum(['INTERNAL', 'PAID_LICENSED']).nullable(),
  controlLevel: z.enum(['FULL', 'PARTIAL', 'UNCONTROLLABLE']).nullable(),
  controlRiskNote: z.string().nullable(),
  dataSensitivity: z.string().nullable(),
  equivalentTool: z.strictObject({ planId: z.uuid(), planName: z.string() }).nullable(),
});

/** What the spending approver sees of the request they decide, apart from the check, its years and the review of Finance. */
const approvalDetailSchema = z.strictObject({
  requestId: z.uuid(),
  step: z.strictObject({
    id: z.uuid(),
    state: z.enum(['PENDING', 'WAITING', 'APPROVED', 'REJECTED', 'CLOSED']),
    waitingReason: z.enum(['NO_SPENDING_APPROVER', 'SPENDING_APPROVER_IS_PARTY']).nullable(),
    assignee: employeeRef.nullable(),
    openedAt: z.iso.datetime(),
    decidedAt: z.iso.datetime().nullable(),
    slaWorkingDays: z.number().int().positive(),
    samePersonAsSpend: z.boolean(),
  }),
  request: z.strictObject({
    state: z.string(),
    plan: z.strictObject({ planId: z.uuid(), planName: z.string(), applicationName: z.string() }).nullable(),
    softwareName: z.string().nullable(),
    requester: employeeRef,
    /** The person it is for; null for a request for a group, whose people are read as lines. */
    beneficiary: employeeRef.nullable(),
    lineCount: z.number().int().positive(),
    costCenter: z.strictObject({ id: z.uuid(), code: z.string() }),
    businessReason: z.string(),
    /** Only a request made before `QĐ-104a` has a term in months. */
    termMonths: z.number().int().positive().nullable(),
    /** The day the right ends as the sender chose it; null for a right with no end (`QĐ-104a`). */
    expectedEndDate: z.string().nullable(),
    budgetYear: z.number().int().nullable(),
  }),
  /** The need the head confirmed. */
  need: z
    .strictObject({ decidedBy: employeeRef, decidedAt: z.iso.datetime(), reason: z.string().nullable() })
    .nullable(),
  /** The cost with the tax that is deducted and the part that is not, as an estimate. */
  cost: costEstimateSchema.nullable(),
  /** The assessment of software that was not in the catalog; null for any other request. */
  assessment: assessmentSchema.nullable(),
  decision: decisionSchema.nullable(),
  budgetSnapshot: budgetSnapshotSchema.nullable(),
  /**
   * What the vendor is paid for a whole year when the plan is bought for the first time on a yearly price (the price of a year times the
   * people): shown beside the amount of the months left (`BR-MF1-07b`). Null when it is not a first purchase of a yearly plan.
   */
  annualVendorAmount: money.nullable(),
});

const resultSchema = z.strictObject({
  requestId: z.uuid(),
  outcome: z.enum(['APPROVED', 'REJECTED', 'SKIPPED']),
  /** Why a request was not decided: it is not in the batch or not the caller's, it was checked again and went back, and so on. */
  reason: z
    .enum([
      'NOT_IN_BATCH',
      /** A request for a group is decided for each person, never in bulk. */
      'GROUP_NEEDS_LINES',
      'NOT_THE_ASSIGNEE',
      'OWN_REQUEST',
      'STEP_NOT_PENDING',
      'NO_SPEND_STEP',
      'NOT_CHECKABLE',
      'RECHECKED_RETURNED_TO_HEAD',
    ])
    .nullable(),
});

export class SpendDecisionBodyDto extends createZodDto(spendDecisionBodySchema) {}
export class BatchDecisionBodyDto extends createZodDto(batchDecisionBodySchema) {}
export class ApprovalQueryDto extends createZodDto(approvalQuerySchema) {}
export class ApprovalListResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ items: z.array(approvalSummarySchema), pagination })),
) {}
export class ApprovalDetailResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ spendApproval: approvalDetailSchema })),
) {}
export class BatchDecisionResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ results: z.array(resultSchema) })),
) {}

export type ApprovalSummaryWire = z.infer<typeof approvalSummarySchema>;
export type ApprovalDetailWire = z.infer<typeof approvalDetailSchema>;
export type BatchDecisionResultWire = z.infer<typeof resultSchema>;
export type SpendDecisionBody = z.infer<typeof spendDecisionBodySchema>;
