import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';
import { z } from 'zod';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { employeeRef, moneySchema, pricingSchema, submitBodySchema } from './access-request.dto';

/**
 * What is asked before a request is sent: the plan and the term, and the day the money is expected to go out when the
 * sender has one. The reason is for sending, not for looking.
 * There is no field for an amount, a price or a budget year: nobody gives the system a number (`US-05-01` AC-14).
 */
export const previewBodySchema = submitBodySchema.pick({
  planId: true,
  termMonths: true,
  projectLabel: true,
  expectedSpendOn: true,
});

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

const chainStepSchema = z.strictObject({
  sequence: z.number().int().positive(),
  kind: z.enum(['NEED', 'SPEND_SUBMISSION', 'SPEND_APPROVAL', 'IT_EXECUTION']),
  role: z.enum(['MANAGER', 'SPENDING_APPROVER', 'FALLBACK_APPROVER', 'IT_ADMIN']),
  assignee: employeeRef.nullable(),
  expectedWorkingDays: z.number().int().positive(),
  explanation: z
    .enum([
      'DEPARTMENT_HEAD',
      'HEAD_ASKS_FOR_SELF',
      'HEAD_IS_THE_APPROVER',
      'DEPARTMENT_HAS_NO_HEAD',
      'WAITING_FOR_AN_APPROVER',
    ])
    .nullable(),
  waitingReason: z.enum(['NO_SPENDING_APPROVER', 'NO_FALLBACK_APPROVER', 'FALLBACK_IS_REQUESTER']).nullable(),
});

const previewSchema = z.strictObject({
  plan: z.strictObject({
    planId: z.uuid(),
    planName: z.string(),
    applicationId: z.uuid(),
    applicationName: z.string(),
  }),
  branch: z.enum(['INTERNAL_FREE', 'PAID_IN_CATALOG']),
  termMonths: z.number().int().positive(),
  projectLabel: z.string().nullable(),
  department: z.strictObject({ id: z.uuid(), code: z.string(), name: z.string() }),
  /**
   * Read only: the Unit of the department of the day; nothing the sender or a project changes (`US-05-01` AC-7). Null when the
   * department has none in use and the request is free internal software, which is judged without it (`QĐ-87g(2)`).
   */
  costCenter: z.strictObject({ id: z.uuid(), code: z.string(), name: z.string() }).nullable(),
  requirements: z.strictObject({
    /** The head must confirm the term in so many words with a reason; the chain gains no step. */
    termConfirmationByHead: z.boolean(),
  }),
  /** The seat the person already holds of the plan; when present, the request cannot be sent. */
  existingAccess: z
    .strictObject({ assignmentId: z.uuid(), effectiveFrom: z.string(), validUntil: z.string().nullable() })
    .nullable(),
  canSubmit: z.boolean(),
  expectedSpendOn: z.string().nullable(),
  budgetYear: z.number().int().nullable(),
  pricing: pricingSchema,
  /** The estimated tax of a priced request; null with no price or no vendor. Never a budget figure. */
  costEstimate: costEstimateSchema.nullable(),
  /** Whether the request can go on to be decided as spend once the need is approved. */
  spendSubmission: z.enum(['NOT_NEEDED', 'ALLOWED', 'BLOCKED_UNTIL_PRICED']),
  chain: z.array(chainStepSchema),
  /** Steps that may be added after sending, by a check that cannot be known now: only the kind and where it would stand. */
  possibleExtraSteps: z.array(
    z.strictObject({ kind: z.enum(['FINANCE_REVIEW']), beforeStep: z.enum(['SPEND_APPROVAL']) }),
  ),
  totalExpectedWorkingDays: z.number().int().positive(),
});

export class PreviewBodyDto extends createZodDto(previewBodySchema) {}
export class PreviewResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ preview: previewSchema })),
) {}
export type PreviewWire = z.infer<typeof previewSchema>;
