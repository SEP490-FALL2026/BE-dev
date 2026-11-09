import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';
import { z } from 'zod';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { businessDate } from '../../../infrastructure/http/dto/business-date.dto';

/** The longest note of a reason or a label a request keeps; the DTO bounds the request with them. */
export const REASON_MAX_LENGTH = 1000;

/**
 * `BM-01` as the person sending it fills it (`US-01-12` AC-1, `US-05-02` AC-6): the plan and the reason are required, the day the
 * right ends is optional (a right has no end unless the sender gives one, at most a year away, and a contractor, a freelancer or an
 * intern must give it, `QĐ-104a`, `FR-2.8`). Nothing here chooses the branch, the Cost Center or who decides: the system fixes
 * them from the plan and the department.
 */
export const submitBodySchema = z.strictObject({
  planId: z.uuid(),
  businessReason: z.string().trim().min(1).max(REASON_MAX_LENGTH),
  expectedEndDate: businessDate.optional(),
});
/**
 * The decision of the need step: a refusal gives its reason (`BR-07.5`), and nothing else is accepted: there is no signature or certificate to attach
 * (`US-01-12` AC-7).
 */
export const needDecisionBodySchema = z
  .strictObject({
    decision: z.enum(['APPROVE', 'REJECT']),
    reason: z.string().trim().min(1).max(REASON_MAX_LENGTH).optional(),
  })
  .superRefine((body, ctx) => {
    if (body.decision === 'REJECT' && body.reason === undefined) {
      ctx.addIssue({ code: 'custom', path: ['reason'], message: 'A refusal gives its reason.' });
    }
  })
  .meta({
    description: 'A refusal (REJECT) gives its reason. An approval (APPROVE) gives none.',
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
  state: z.enum(['PENDING', 'WAITING', 'APPROVED', 'REJECTED', 'CLOSED', 'NOT_REQUIRED']),
  assignee: employeeRef.nullable(),
  routingRow: z.number().int().min(1).max(9),
  waitingReason: z.enum(['NO_SPENDING_APPROVER', 'NO_DEPARTMENT_HEAD']).nullable(),
  slaWorkingDays: z.number().int().positive().nullable(),
  createdAt: z.iso.datetime(),
  assignedAt: z.iso.datetime().nullable(),
  decidedAt: z.iso.datetime().nullable(),
});

/** The decision of the need step; one object, not a list. */
const needDecisionSchema = z.strictObject({
  decision: z.enum(['APPROVED', 'REJECTED']),
  decidedBy: employeeRef,
  deciderRole: z.enum(['MANAGER', 'SPENDING_APPROVER']),
  reason: z.string().nullable(),
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
  kind: z.enum(['RECURRING', 'ONE_TIME']).nullable(),
  months: z.number().int().min(0).max(12).nullable(),
  monthlyPrice: moneySchema.nullable(),
  nextYearAmount: moneySchema.nullable(),
});

export const requestStateSchema = z.enum([
  'PENDING',
  'WAITING_CONTROLLED',
  'AWAITING_EXECUTION',
  'AWAITING_IT_ASSESSMENT',
  'AWAITING_SPEND_SUBMISSION',
  'AWAITING_SPEND_DECISION',
  'AWAITING_REQUESTER_REVISION',
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
  routing: z.strictObject({
    mode: z.enum(['VIA_HEAD', 'ONE_STEP']),
    oneStepReason: z.enum(['REQUESTER_IS_HEAD', 'NO_DEPARTMENT_HEAD', 'HEAD_LEFT']).nullable(),
  }),
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
  /** Only a request made before `QĐ-104a` has a term in months; a new one has an end date or none. */
  termMonths: z.number().int().positive().nullable(),
  /** The day the right ends, as the sender chose it; null for a right with no end. */
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
  /**
   * Where a request that costs money stands on its way to the spending approver, and for one that stopped, why (`BR-MF1-06g`): not yet
   * sent, waiting for the head to confirm the reserve, blocked (with every reason), waiting for the spending approver, or refused. The
   * requester and the head read how far over the base or the reserve the request is; never what is left of the budget.
   */
  spend: z
    .strictObject({
      stage: z.enum([
        'NOT_SUBMITTED',
        'RETURNED_TO_REQUESTER',
        'RESERVE_CONFIRMATION',
        'BLOCKED',
        'WAITING_SPEND_DECISION',
        'REFUSED',
      ]),
      /** Why the request is blocked, every reason that applies; empty unless the stage is `BLOCKED`. */
      blockedReasons: z
        .array(z.enum(['PRICE_EXPIRED', 'NO_APPROVED_BUDGET', 'OVER_RESERVE', 'PRICE_MISSING', 'RATE_MISSING']))
        .max(3),
      /** How far over the base (it waits for the reserve to be confirmed) or over the reserve (blocked for that); null otherwise. */
      overBy: moneySchema.nullable(),
      /** What the spending approver wrote when they refused the request. */
      refusalReason: z.string().nullable(),
    })
    .nullable(),
  /** The fiscal year the cost is charged to: a provisional year from today until the spend is decided; null for internal software. */
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
  /**
   * Who closed the request because the person it was for left, when, why and the note they gave; null for any other request.
   * `cancelledBy` is null, and `cause` is `SPENDING_APPROVER_PARTY`, when the conversion command closed it because the spending
   * approver is one of its parties (`QĐ-93k(1)`): no employee closed it.
   */
  cancellation: z
    .strictObject({
      cancelledBy: employeeRef.nullable(),
      cancelledAt: z.iso.datetime(),
      cause: z.enum(['BENEFICIARY_LEFT', 'BENEFICIARY_TRANSFERRED', 'SPENDING_APPROVER_PARTY']),
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
