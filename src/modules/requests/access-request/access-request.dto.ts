import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';
import { z } from 'zod';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { businessDate } from '../../../infrastructure/http/dto/business-date.dto';

/** The longest note of a reason or a label a request keeps; the DTO bounds the request with them. */
export const REASON_MAX_LENGTH = 1000;
/** The longest term a request may ask for, in months: a bound against a typo, not a business rule of the BRD. */
export const TERM_MONTHS_MAX = 120;

/**
 * `BM-01` as the person sending it fills it (`US-01-12` AC-1, `US-05-02` AC-6): the plan, the reason and the term are
 * required, and the project is context only. Nothing
 * here chooses the branch, the Cost Center or who decides: the system fixes them from the plan and the department.
 */
export const submitBodySchema = z.strictObject({
  planId: z.uuid(),
  businessReason: z.string().trim().min(1).max(REASON_MAX_LENGTH),
  termMonths: z.number().int().min(1).max(TERM_MONTHS_MAX),
  /** The day the money is expected to go out (paid software only); it fixes the budget year. Today when left out. */
  expectedSpendOn: businessDate.optional(),
});
/**
 * What the head chooses for a request that costs money: a line of the plan of the budget, or that it is outside it
 * (`US-05-04` AC-12). One of the two, never both and never neither. The same shape is part of the decision of the need step.
 */
export const planLineChoiceFields = {
  planLine: z
    .strictObject({
      position: z.number().int().min(1),
      /** The head confirms the line is still needed although its window has gone by (`AC-13`). */
      stillNeeded: z.boolean().optional(),
    })
    .optional(),
  offPlan: z.literal(true).optional(),
};

/** What a client reads of the choice that `oneChoice` enforces. */
export const PLAN_LINE_CHOICE_DESCRIPTION =
  'Choose exactly one: a line of the plan of the budget (planLine), or that the spend is outside it (offPlan: true).';

/** Exactly one of a line and "outside the plan". */
export const oneChoice = (body: { planLine?: unknown; offPlan?: unknown }, ctx: z.RefinementCtx) => {
  if ((body.planLine === undefined) === (body.offPlan === undefined)) {
    ctx.addIssue({
      code: 'custom',
      path: ['planLine'],
      message: 'Choose a line of the plan, or that it is outside it.',
    });
  }
};

/**
 * The decision of the need step: a refusal gives its reason (`BR-07.5`), a term over twelve months is confirmed in so many
 * words with a reason of its own (`OI-07a`), and nothing else is accepted: there is no signature or certificate to attach
 * (`US-01-12` AC-7).
 */
export const needDecisionBodySchema = z
  .strictObject({
    decision: z.enum(['APPROVE', 'REJECT']),
    reason: z.string().trim().min(1).max(REASON_MAX_LENGTH).optional(),
    termConfirmation: z.strictObject({ reason: z.string().trim().min(1).max(REASON_MAX_LENGTH) }).optional(),
    /**
     * What the head gives when they approve a request that costs money (`US-05-04` AC-12, AC-16): the line of the plan of the
     * budget or "outside the plan", and, when they correct it, the day the money is expected to go out.
     */
    spend: z
      .strictObject({
        ...planLineChoiceFields,
        expectedSpendOn: businessDate.optional(),
      })
      .superRefine(oneChoice)
      .meta({ description: PLAN_LINE_CHOICE_DESCRIPTION })
      .optional(),
  })
  .superRefine((body, ctx) => {
    if (body.decision === 'REJECT' && body.reason === undefined) {
      ctx.addIssue({ code: 'custom', path: ['reason'], message: 'A refusal gives its reason.' });
    }
    if (body.decision === 'REJECT' && body.termConfirmation !== undefined) {
      ctx.addIssue({ code: 'custom', path: ['termConfirmation'], message: 'Only an approval confirms a term.' });
    }
    if (body.decision === 'REJECT' && body.spend !== undefined) {
      ctx.addIssue({ code: 'custom', path: ['spend'], message: 'Only an approval chooses a line of the plan.' });
    }
  })
  .meta({
    description:
      'A refusal (REJECT) gives its reason, and neither confirms a term nor chooses a line of the plan. An approval (APPROVE) may ' +
      'confirm a term over twelve months with a reason of its own, and for a request that costs money chooses a line of the plan or ' +
      'that it is outside it.',
  });
const pageQuery = {
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
};
export const similarSeatsQuerySchema = z.strictObject({
  ...pageQuery,
  /** The person of a request for a group whose seats are read; a request for one person has only one. */
  employeeId: z.uuid().optional(),
});
export const requestIdParamSchema = z.strictObject({ id: z.uuid() });

export const employeeRef = z.strictObject({ employeeId: z.uuid(), employeeCode: z.string(), fullName: z.string() });

/** The need step. A step holds one person or none (`US-05-03` AC-10); later steps are a paged subresource, not an array here. */
const needStepSchema = z.strictObject({
  id: z.uuid(),
  state: z.enum(['PENDING', 'WAITING', 'APPROVED', 'REJECTED', 'CLOSED']),
  assignee: employeeRef.nullable(),
  routingRow: z.number().int().min(1).max(9),
  waitingReason: z.enum(['NO_SPENDING_APPROVER', 'NO_FALLBACK_APPROVER', 'FALLBACK_IS_REQUESTER']).nullable(),
  samePersonAsSpend: z.boolean(),
  slaWorkingDays: z.number().int().positive(),
  createdAt: z.iso.datetime(),
  assignedAt: z.iso.datetime().nullable(),
  decidedAt: z.iso.datetime().nullable(),
});

/** The decision of the need step; one object, not a list. */
const needDecisionSchema = z.strictObject({
  decision: z.enum(['APPROVED', 'REJECTED']),
  decidedBy: employeeRef,
  deciderRole: z.enum(['MANAGER', 'SPENDING_APPROVER', 'FALLBACK_APPROVER']),
  reason: z.string().nullable(),
  termConfirmationReason: z.string().nullable(),
  decidedAt: z.iso.datetime(),
});

export const moneySchema = z.strictObject({ amount: z.string(), currency: z.string() });
/** What the request costs: no amount for internal software, a priced amount, or a missing price with its reason. */

/** What a request costs, estimated before tax and after, as the preview and the approver's card show it. */
export const costEstimateSchema = z.strictObject({
  label: z.enum(['ESTIMATE', 'ESTIMATE_NO_PROFILE']),
  basis: z.enum(['PROFILE', 'DEFAULT_NO_PROFILE']),
  taxGroup: z.string(),
  preTax: moneySchema,
  tax: moneySchema,
  deductibleTax: moneySchema,
  nonDeductibleTax: moneySchema,
  estimatedCost: moneySchema,
  totalPayable: moneySchema,
});
export const pricingSchema = z.strictObject({
  status: z.enum(['NOT_APPLICABLE', 'PRICED', 'MISSING']),
  missingReason: z.enum(['NO_PRICED_SUBSCRIPTION', 'CYCLE_UNKNOWN', 'AMOUNT_TOO_LARGE', 'AWAITING_QUOTE']).nullable(),
  amount: moneySchema.nullable(),
  unitPrice: moneySchema.nullable(),
  billingCycle: z.enum(['MONTHLY', 'QUARTERLY', 'ANNUAL', 'OTHER']).nullable(),
  periodCount: z.number().int().positive().nullable(),
  bindingPeriodCount: z.number().int().nonnegative().nullable(),
  firstDueOn: z.string().nullable(),
  lastDueOn: z.string().nullable(),
});

export const requestStateSchema = z.enum([
  'PENDING',
  'WAITING_CONTROLLED',
  'AWAITING_EXECUTION',
  'AWAITING_IT_ASSESSMENT',
  'AWAITING_SPEND_SUBMISSION',
  'AWAITING_FINANCE_REVIEW',
  'AWAITING_BUDGET',
  'AWAITING_SPEND_DECISION',
  'REJECTED',
  'IT_REJECTED',
  'EXECUTING',
  'COMPLETED',
  'FAILED',
  'AWAITING_IT_CLOSE',
  'WITHDRAWN',
  'CANCELLED',
]);

export const requestSchema = z.strictObject({
  id: z.uuid(),
  type: z.enum(['GRANT', 'SERVICE_ACCOUNT', 'RENEWAL', 'GROUP_GRANT']),
  branch: z.enum(['INTERNAL_FREE', 'PAID_IN_CATALOG', 'NEW_SOFTWARE']),
  state: requestStateSchema,
  /** The plan asked for; null for software that is not in the catalog until the IT Admin registers and links it. */
  plan: z
    .strictObject({
      planId: z.uuid(),
      planName: z.string(),
      applicationId: z.uuid(),
      applicationName: z.string(),
    })
    .nullable(),
  /** What the Employee declared of software that is not in the catalog; null for any other request. */
  proposal: z
    .strictObject({
      softwareName: z.string(),
      homepageUrl: z.string(),
      purpose: z.string(),
      dataDescription: z.string(),
      expectedUsers: z.number().int().positive(),
    })
    .nullable(),
  department: z.strictObject({ id: z.uuid(), code: z.string(), name: z.string() }),
  /** What the request is charged to; null for a free internal request of a department that has no Cost Center in use (`QĐ-87g(2)`). */
  costCenter: z.strictObject({ id: z.uuid(), code: z.string() }).nullable(),
  requester: employeeRef,
  /** The person it is for; null for a request for a group (`type` GROUP_GRANT), whose people are read as lines. */
  beneficiary: employeeRef.nullable(),
  /** How many people the request is for: 1 for any request but one for a group. */
  lineCount: z.number().int().positive(),
  businessReason: z.string(),
  termMonths: z.number().int().positive(),
  /** The head chose "outside the plan": a flag for Finance and the approver, never a stop. */
  offPlan: z.boolean(),
  /** The code the requests a head sent for people of the department in one go share; null for any other request. */
  delegatedBatchId: z.uuid().nullable(),
  /** The day the access of a person who is not staff ends; null for staff. */
  expectedEndDate: z.string().nullable(),
  /**
   * What a request for a service account adds: why the account exists, the identifier its sender expects (a hint: the IT
   * Admin enters the real one), who answers for it and the verdict of the IT Admin on whether it is a non-human subject.
   * Null for any other request. No password or key is ever kept.
   */
  serviceAccount: z
    .strictObject({
      purpose: z.string(),
      expectedIdentifier: z.string(),
      responsible: employeeRef,
      boundary: z.strictObject({
        state: z.enum(['PENDING', 'ACCEPTED', 'REJECTED']),
        reason: z.string().nullable(),
        decidedBy: employeeRef.nullable(),
        decidedAt: z.iso.datetime().nullable(),
        selfExecuted: z.boolean(),
      }),
    })
    .nullable(),
  /**
   * What a request for the renewal of a right adds: the seat it renews, the end it had, the end it asks for, the months the right
   * would run on without a break and, once approved, the record that follows the old one. Null for any other request.
   */
  renewal: z
    .strictObject({
      assignmentId: z.uuid(),
      previousExpectedEndDate: z.string(),
      newExpectedEndDate: z.string(),
      consecutiveMonths: z.number().int().positive(),
      applied: z.strictObject({ successorAssignmentId: z.uuid(), appliedAt: z.iso.datetime() }).nullable(),
    })
    .nullable(),
  /** Whether the request is attached to a line of the plan of the budget. */
  planLineAttached: z.boolean(),
  /**
   * Where a request that costs money stands on its way to the spending approver, and for one that stopped, why. It never
   * carries a figure of the budget, what is left or a code of the check beyond the two problems of the data.
   */
  spend: z
    .strictObject({
      stage: z.enum([
        'NOT_SUBMITTED',
        'BLOCKED',
        'RETURNED_BY_FINANCE',
        'WAITING_FINANCE_REVIEW',
        'WAITING_BUDGET',
        'WAITING_SPEND_DECISION',
        'REFUSED',
      ]),
      blockedReason: z.enum(['STALE_COST_EVIDENCE', 'CLOSED_OR_EXPIRED_BUDGET_PERIOD']).nullable(),
      financeReturnReason: z.string().nullable(),
      /** What the spending approver wrote when they refused the request. */
      refusalReason: z.string().nullable(),
    })
    .nullable(),
  /** The day the money is expected to go out and its fiscal year; null for internal software. */
  expectedSpendOn: z.string().nullable(),
  budgetYear: z.number().int().nullable(),
  pricing: pricingSchema,
  policy: z.strictObject({
    version: z.number().int().positive(),
    hasSpendStep: z.boolean(),
    slaWorkingDays: z.number().int().positive(),
  }),
  submittedAt: z.iso.datetime(),
  needStep: needStepSchema,
  needDecision: needDecisionSchema.nullable(),
  /**
   * Who withdrew the request, when and why. Null for a request that was not withdrawn; `withdrawnAt` is null while the request
   * waits (`AWAITING_IT_CLOSE`) for the IT Admin to close the task of its grant as cancelled.
   */
  withdrawal: z
    .strictObject({
      requestedBy: employeeRef,
      requestedAt: z.iso.datetime(),
      reason: z.string().nullable(),
      withdrawnAt: z.iso.datetime().nullable(),
    })
    .nullable(),
  /** Who closed the request because the person it was for left, when, why and the note they gave; null for any other request. */
  cancellation: z
    .strictObject({
      cancelledBy: employeeRef,
      cancelledAt: z.iso.datetime(),
      cause: z.enum(['BENEFICIARY_LEFT', 'BENEFICIARY_TRANSFERRED']),
      note: z.string().nullable(),
    })
    .nullable(),
});

/** The body of a withdrawal: the reason is optional for the requester and required of a head (`US-06-14` AC-14). */
export const withdrawBodySchema = z.strictObject({ reason: z.string().trim().min(1).max(1000).optional() });

export class SubmitBodyDto extends createZodDto(submitBodySchema) {}
/** A seat the person already holds in a tool that does the same work: a row of the list. */
const similarSeatSchema = z.strictObject({
  assignmentId: z.uuid(),
  plan: z.strictObject({
    planId: z.uuid(),
    planName: z.string(),
    applicationId: z.uuid(),
    applicationName: z.string(),
  }),
  accountIdentifier: z.string(),
  heldSince: z.string(),
});
const pagination = z.strictObject({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalItems: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

export class SimilarSeatsQueryDto extends createZodDto(similarSeatsQuerySchema) {}
export class SimilarSeatsResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ items: z.array(similarSeatSchema), pagination })),
) {}
export class WithdrawBodyDto extends createZodDto(withdrawBodySchema) {}
export class NeedDecisionBodyDto extends createZodDto(needDecisionBodySchema) {}
export class RequestIdParamDto extends createZodDto(requestIdParamSchema) {}
export class AccessRequestResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ request: requestSchema })),
) {}
