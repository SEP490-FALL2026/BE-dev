import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';
import { z } from 'zod';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import {
  costEstimateSchema,
  employeeRef,
  limitExemptionSchema,
  moneySchema,
  pricingSchema,
  submitBodySchema,
} from '../access-request/access-request.dto';

/**
 * What is asked before a request is sent: the plan and, when the sender has one, the day the right ends. The reason is for
 * sending, not for looking.
 * There is no field for an amount, a price or a budget year: nobody gives the system a number (`US-05-01` AC-14).
 */
export const previewBodySchema = submitBodySchema.pick({
  planId: true,
  expectedEndDate: true,
});

const chainStepSchema = z.strictObject({
  sequence: z.number().int().positive(),
  kind: z.enum(['NEED', 'SPEND_SUBMISSION', 'SPEND_APPROVAL', 'IT_EXECUTION']),
  role: z.enum(['MANAGER', 'SPENDING_APPROVER', 'IT_ADMIN']),
  assignee: employeeRef.nullable(),
  expectedWorkingDays: z.number().int().positive(),
  explanation: z
    .enum(['DEPARTMENT_HEAD', 'HEAD_ASKS_FOR_SELF', 'WAITS_FOR_DEPARTMENT_HEAD', 'WAITING_FOR_AN_APPROVER'])
    .nullable(),
  waitingReason: z.enum(['NO_SPENDING_APPROVER', 'NO_DEPARTMENT_HEAD']).nullable(),
});

const previewSchema = z.strictObject({
  plan: z.strictObject({
    planId: z.uuid(),
    planName: z.string(),
    applicationId: z.uuid(),
    applicationName: z.string(),
  }),
  branch: z.enum(['INTERNAL_FREE', 'PAID_IN_CATALOG']),
  /** The day the right ends as the sender gave it; null for a right with no end. */
  expectedEndDate: z.string().nullable(),
  department: z.strictObject({ id: z.uuid(), code: z.string(), name: z.string() }),
  /**
   * Read only: the Unit of the department of the day; nothing the sender or a project changes (`US-05-01` AC-7). Null when the
   * department has none in use and the request is free internal software, which is judged without it (`QĐ-87g(2)`).
   */
  costCenter: z.strictObject({ id: z.uuid(), code: z.string(), name: z.string() }).nullable(),
  /** The last day a right asked for today may end: the day before the same day a year later (`US-05-23` AC-9). */
  maxEndDate: z.string(),
  /** True when the person it is for is not staff and no end date was given: the request cannot be sent without one (`FR-2.8`). */
  termRequired: z.boolean(),
  /** What one person costs a year at the vendor, whatever month the right begins in; null when the request is free or has no price (`P2-02`). */
  annualVendorAmount: moneySchema.nullable(),
  /** The seat the person already holds of the plan; when present, the request cannot be sent. */
  existingAccess: z
    .strictObject({ assignmentId: z.uuid(), effectiveFrom: z.string(), validUntil: z.string().nullable() })
    .nullable(),
  /**
   * Why the request cannot be sent whoever sends it: the first side and reason that apply, with every person of the request that has
   * them (`D-S21`). Null when nobody is refused; the rest of the preview is then what sending would fix, as for anybody else.
   */
  blockedBy: z
    .strictObject({
      reason: z.enum(['SPENDING_APPROVER', 'UNPLACED']),
      party: z.enum(['REQUESTER', 'BENEFICIARY']),
      employeeIds: z.array(z.uuid()),
    })
    .nullable(),
  /**
   * GH-1/GH-2/GH-3 of the person on the day (`BR-MF1-01`): the requests for new access they have open and the most they may, the paid
   * applications they use and the threshold, whether a reason is required, and why sending would be refused (`openRequestId` is the
   * request of the same plan already open). Read without a lock: sending judges again.
   */
  limits: z.strictObject({
    openNewCount: z.number().int().nonnegative(),
    openNewMax: z.number().int().positive(),
    paidSoftwareCount: z.number().int().nonnegative(),
    paidSoftwareThreshold: z.number().int().positive(),
    reasonRequired: z.boolean(),
    refusal: z.enum(['HAS_OPEN_REQUEST', 'OPEN_LIMIT_REACHED']).nullable(),
    openRequestId: z.uuid().nullable(),
  }),
  /**
   * Set when the person holds the software asked for from before a transfer whose grace still lasts: the request is then let through the check of the seat
   * held and left out of GH-1/GH-2 (`QĐ-110q`, P10), and the grant ends the old right if it is given on the same subscription (R-49). Null otherwise.
   */
  limitExemption: limitExemptionSchema.nullable(),
  canSubmit: z.boolean(),
  budgetYear: z.number().int().nullable(),
  pricing: pricingSchema,
  /** The estimated tax of a priced request; null with no price or no vendor. Never a budget figure. */
  costEstimate: costEstimateSchema.nullable(),
  /** Whether the request can go on to be decided as spend once the need is approved. */
  spendSubmission: z.enum(['NOT_NEEDED', 'ALLOWED', 'BLOCKED_UNTIL_PRICED']),
  chain: z.array(chainStepSchema),
  totalExpectedWorkingDays: z.number().int().positive(),
});

export class PreviewBodyDto extends createZodDto(previewBodySchema) {}
export class PreviewResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ preview: previewSchema })),
) {}
export type PreviewWire = z.infer<typeof previewSchema>;
