import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';
import { z } from 'zod';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { READABLE_CANCEL_CAUSES } from './group-request.types';
import { checklistBodySchema } from '../../policies/public/policy-checklist.types';
import { LIMIT_EXEMPTIONS } from './access-request.types';

/**
 * Why a request was left out of the limits (`QĐ-110q`: `TRANSFER_GRACE`, the person asked again in the grace of a transfer for software they hold: left out of
 * the count of GH-2, not of the duplicate of GH-1 (an open request of the same plan still refuses it); `QĐ-108c`: `ROLE_ENDED`: left out of GH-1 and GH-2).
 */
export const limitExemptionSchema = z.enum(LIMIT_EXEMPTIONS);

/** The longest note of a reason or a label a request keeps; the DTO bounds the request with them. */
export const REASON_MAX_LENGTH = 1000;

/**
 * The time of use, in whole months (`QĐ-111i`, `FR-2.8`): a plan bought by the month (`K1`) needs it, 1 to 9; a plan of seats (`K2`) or
 * internal software (`K5`) takes 1 to 12, or null for a right with no end (_Dùng lâu dài_), which a contractor, a freelancer or an intern
 * never gets; a plan bought once (`K4`) takes none. The rule of the kind of plan is judged when the request is sent or looked at.
 */
export const termMonthsSchema = z.number().int().nullable().meta({
  description:
    'The time of use in whole months: required for a plan bought by the month (1 to 9); 1 to 12, or null for a right with no end, for a plan of seats or internal software (not for a contractor, a freelancer or an intern); none for a plan bought once.',
});

/**
 * `BM-01` as the person sending it fills it (`US-01-12` AC-1, `US-05-02` AC-6): the plan and the reason are required, and the time of use
 * in months when the kind of plan asks for it (`QĐ-111i`): there is no end date to give. Nothing here chooses the branch, the Cost Center
 * or who decides: the system fixes them from the plan and the department.
 */
export const submitBodySchema = z.strictObject({
  planId: z.uuid(),
  businessReason: z.string().trim().min(1).max(REASON_MAX_LENGTH),
  termMonths: termMonthsSchema.optional(),
});
/**
 * The decision of the need step: a refusal gives its reason (`BR-07.5`), and nothing else is accepted: there is no signature or certificate to attach
 * (`US-01-12` AC-7).
 */
export const needDecisionBodySchema = z
  .strictObject({
    decision: z.enum(['APPROVE', 'REJECT', 'RETURN']),
    reason: z.string().trim().min(1).max(REASON_MAX_LENGTH).optional(),
    checklist: checklistBodySchema,
  })
  .meta({
    description:
      'The checklist of the policy in force at this step, and the decision: approve, refuse (REJECT) or send back to the person who asked (RETURN). A refusal and a return give their reason, or leave it to be filled in from the questions answered No. An approval is locked while an answer is No.',
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
  decision: z.enum(['APPROVED', 'REJECTED', 'RETURNED']),
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
/**
 * What a request costs by the year, before tax (`QĐ-111j`, `QĐ-111k`): the months that begin in the year it is judged in, and the part of
 * the year after, an estimate that is kept when the spend is approved. Null when nothing is priced by the month. This is never a budget
 * figure: nobody but the spending approver and Finance sees what is left of a budget.
 */
export const costViewSchema = z.strictObject({
  currentYear: z.strictObject({ year: z.number().int(), months: z.number().int().nullable(), amount: moneySchema }),
  nextYear: z
    .strictObject({
      from: z.string().meta({ description: 'The first day of the year after, YYYY-MM-DD.' }),
      months: z.number().int().nullable(),
      amount: moneySchema,
      estimate: z.literal(true),
    })
    .nullable(),
  termCutAt: z
    .string()
    .nullable()
    .meta({ description: 'The last day of the contract of a person with a term, when it cut the time of use short.' }),
  months: z.number().int().nullable().meta({
    description: 'The months that have begun by the end of the term, each counted whole; null for a right with no end.',
  }),
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
  type: z
    .enum(['GRANT', 'SERVICE_ACCOUNT', 'RENEWAL', 'GROUP_GRANT'])
    .describe(
      'SERVICE_ACCOUNT is on records of the earlier releases only: no request for a service account is made any more.',
    ),
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
      /** The application of the catalog the software is already in, when only the plan asked for is missing (case B, short); null for software that is new. */
      existingApplicationId: z.uuid().nullable(),
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
  /** Why the request was left out of the count of the limits when it was sent (`TRANSFER_GRACE` is not left out of the duplicate of GH-1); null for every other request (P10, `QĐ-110q`). */
  limitExemption: limitExemptionSchema.nullable(),
  /**
   * What a request for the renewal of a right adds: the seat it renews, the end it had, the end it asks for, the months the right
   * would run on without a break and, once approved, the record that follows the old one. Null for any other request.
   */
  renewal: z
    .strictObject({
      assignmentId: z.uuid(),
      previousExpectedEndDate: z.string(),
      newExpectedEndDate: z.string().nullable(),
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
      blockedReasons: z.array(z.enum(['PRICE_EXPIRED', 'NO_APPROVED_BUDGET', 'OVER_RESERVE', 'PRICE_MISSING'])).max(3),
      /** How far over the base (it waits for the reserve to be confirmed) or over the reserve (blocked for that); null otherwise. */
      overBy: moneySchema.nullable(),
      /** What the spending approver wrote when they refused the request. */
      refusalReason: z.string().nullable(),
    })
    .nullable(),
  /** The fiscal year the cost is charged to: a provisional year from today until the spend is decided; null for internal software. */
  budgetYear: z.number().int().nullable(),
  pricing: pricingSchema,
  /** The cost by the year before tax, with the part of the year after (`QĐ-111j`, `QĐ-111k`); null when nothing is priced by the month. */
  cost: costViewSchema.nullable(),
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
   * approver is one of its parties (`QĐ-93k(1)`), or `SYSTEM_BENEFICIARY_LEFT` / `SYSTEM_BENEFICIARY_TRANSFERRED` when the system closed
   * it because the person it was for left or was moved to another department (`QĐ-110d`, `QĐ-110o`), or `SYSTEM_SCOPE_REMOVED` when it was a
   * request for a service account, a kind that left the scope (`QĐ-110m`): no employee closed it.
   */
  cancellation: z
    .strictObject({
      cancelledBy: employeeRef.nullable(),
      cancelledAt: z.iso.datetime(),
      cause: z.enum(READABLE_CANCEL_CAUSES),
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
