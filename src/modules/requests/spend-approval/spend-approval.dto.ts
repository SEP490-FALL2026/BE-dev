import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';
import { z } from 'zod';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { costEstimateSchema } from '../request-submission/request-preview.dto';
import { budgetInformationSchema } from '../budget-information/budget-information.dto';
import { BATCH_MAX } from '../spend/spend-submission.dto';

const text = (max: number) => z.string().trim().min(1).max(max);
const money = z.strictObject({ amount: z.string(), currency: z.string() });
const employeeRef = z.strictObject({ employeeId: z.uuid(), employeeCode: z.string(), fullName: z.string() });
const year = z.number().int().min(2000).max(2200);

/**
 * How the spending approver decides (`US-06-01`): approve, or refuse with a reason (`AC-4`). Approving a request that has less
 * money than it costs, or none, is an override with its reason and the years it accepts (`AC-5`, `AC-16`, `AC-21`); there
 * is no field for a figure, a snapshot or a signature.
 */
export const spendDecisionBodySchema = z
  .strictObject({
    decision: z.enum(['APPROVE', 'REJECT']),
    reason: text(1000).optional(),
    override: z
      .strictObject({
        reason: text(1000),
        years: z
          .array(year)
          .min(1)
          .max(20)
          .refine((years) => new Set(years).size === years.length, { message: 'A year is named once.' }),
      })
      .optional(),
  })
  .superRefine((body, ctx) => {
    if (body.decision === 'REJECT' && body.reason === undefined) {
      ctx.addIssue({ code: 'custom', path: ['reason'], message: 'A refusal gives its reason.' });
    }
    if (body.decision === 'REJECT' && body.override !== undefined) {
      ctx.addIssue({ code: 'custom', path: ['override'], message: 'Only an approval accepts an exception.' });
    }
    if (body.decision === 'APPROVE' && body.reason !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['reason'],
        message: 'An approval gives no reason; an override has its own.',
      });
    }
  });

/** Approving or refusing the requests of a batch the person holds, one by one, in the order chosen (`AC-19`, `AC-20`). */
export const batchDecisionBodySchema = z
  .strictObject({
    decision: z.enum(['APPROVE', 'REJECT']),
    requestIds: z
      .array(z.uuid())
      .min(1)
      .max(BATCH_MAX)
      .refine((ids) => new Set(ids).size === ids.length, { message: 'A request is decided once.' }),
    reason: text(1000).optional(),
  })
  .superRefine((body, ctx) => {
    if (body.decision === 'REJECT' && body.reason === undefined) {
      ctx.addIssue({ code: 'custom', path: ['reason'], message: 'A refusal gives its reason.' });
    }
    if (body.decision === 'APPROVE' && body.reason !== undefined) {
      ctx.addIssue({ code: 'custom', path: ['reason'], message: 'An approval gives no reason.' });
    }
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
  'PLAN_LINE_OVERDUE',
]);

/** A request waiting for the approver: what it is, what it costs, and the first code of its check. */
const approvalSummarySchema = z.strictObject({
  requestId: z.uuid(),
  stepId: z.uuid(),
  openedAt: z.iso.datetime(),
  slaWorkingDays: z.number().int().positive(),
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
  /** The same person holds the need step and this one. */
  samePersonAsSpend: z.boolean(),
  /** Finance is the one it is for, so nobody independent reviewed it. */
  noIndependentReview: z.boolean(),
  offPlan: z.boolean(),
  /** The batch it was last sent in, when it was sent in one. */
  batchId: z.uuid().nullable(),
});

const decisionSchema = z.strictObject({
  decision: z.enum(['APPROVED', 'REJECTED']),
  reason: z.string().nullable(),
  /** The reason of the exception the approval accepted, when it accepted one; the years are marked on the years of the check. */
  overrideReason: z.string().nullable(),
  decidedBy: employeeRef,
  decidedAt: z.iso.datetime(),
  /** The substitute decided, because the approver was a party. */
  bySubstitute: z.boolean(),
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
    waitingReason: z.enum(['NO_SPENDING_APPROVER', 'NO_CONFLICT_SUBSTITUTE']).nullable(),
    assignee: employeeRef.nullable(),
    openedAt: z.iso.datetime(),
    decidedAt: z.iso.datetime().nullable(),
    slaWorkingDays: z.number().int().positive(),
    samePersonAsSpend: z.boolean(),
    noIndependentReview: z.boolean(),
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
    termMonths: z.number().int().positive(),
    expectedSpendOn: z.string().nullable(),
    budgetYear: z.number().int().nullable(),
    offPlan: z.boolean(),
    planLineAttached: z.boolean(),
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
  /** The last question to Finance with its answer, when there is one; it decides nothing (`US-06-03` AC-1). The others are listed apart. */
  latestBudgetInformation: budgetInformationSchema.nullable(),
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
      /** The approver completed the review of Finance of this request: the two are two people (`SoD-8`). */
      'REVIEWER_IS_APPROVER',
      'STEP_NOT_PENDING',
      'NO_SPEND_STEP',
      'OVERRIDE_REQUIRED',
      'NOT_CHECKABLE',
      'RECHECKED_NEEDS_FINANCE_REVIEW',
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
