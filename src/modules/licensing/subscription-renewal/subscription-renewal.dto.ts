import { z } from 'zod';
import { businessDate } from '../../../infrastructure/http/dto/business-date.dto';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';
import { RENEWAL_CHOICES, RENEWAL_OUTCOMES } from './subscription-renewal.types';

/**
 * Only the shape and a generous bound are checked here; whether a choice fits the subscription, who may decide and what the seats
 * allow is judged by the policies and answers with its own code. Money is text, never a JSON number (ADR-0007).
 */
const choice = z.enum(RENEWAL_CHOICES);
const outcome = z.enum(RENEWAL_OUTCOMES);
const states = z.enum(['PROPOSED', 'DECIDED', 'OUTCOME_RECORDED', 'STALE']);
const executionPoint = z.enum(['AS_PLANNED', 'MID_TERM', 'NEXT_RENEWAL']);
const deadlineKind = z.enum(['AUTO_RENEWAL_INCIDENT', 'EXPIRY_MARKED']);
const quantity = z.number().int().min(0).max(1_000_000_000);
const text = z.string().trim().min(1).max(2000);
const flag = z.enum(['true', 'false']).transform((value) => value === 'true');
const pageQuery = {
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
};
const pagination = z.strictObject({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalItems: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});
const money = z.strictObject({ amount: z.string().max(40), currency: z.string().regex(/^[A-Z]{3}$/) });

const nextPeriodSchema = z.strictObject({
  purchasedQuantity: quantity,
  unitPrice: money,
  billingCycle: z.enum(['MONTHLY', 'QUARTERLY', 'ANNUAL', 'OTHER']),
  startDate: businessDate,
  endDate: businessDate.optional(),
  renewalDate: businessDate.optional(),
  noticeDeadline: businessDate.optional(),
  noticePeriodDays: z.number().int().min(0).max(3650).optional(),
  autoRenew: z.boolean(),
  allowsMidTermReduction: z.boolean(),
});

/** What the vendor did instead of the decision needs the reason and the evidence the IT Admin has (`QĐ-96i`). */
const NEEDS_NOTE: readonly (typeof RENEWAL_OUTCOMES)[number][] = ['VENDOR_REFUSED', 'DIFFERENT'];

export const recordOutcomeBodySchema = z
  .strictObject({
    outcome,
    note: text.optional(),
    nextPeriod: nextPeriodSchema.optional(),
  })
  .refine((body) => !NEEDS_NOTE.includes(body.outcome) || body.note !== undefined, {
    path: ['note'],
    message: 'The note (the reason and the evidence) is required when the vendor refused or did something else.',
  });

/**
 * What the vendor did that the one write records: it is recorded once the vendor confirmed, so a result the vendor has not confirmed
 * (`UNCONFIRMED`) is not one the route takes (`A1C-03`); the route of the outcome of a case of before still reads it.
 */
const writtenOutcome = z.enum(['AS_DECIDED', 'VENDOR_REFUSED', 'DIFFERENT']);

/**
 * The one write of the result at the point of adjustment (`SBF-20` §4.4): the choice and the seats, what the vendor did and the new period, and
 * for a cancellation the two confirmations of closing the subscription (`QĐ-99i`). Only the shape is judged here; which number the seats must be
 * is the count of the system (`QĐ-104d`), answered with its own code.
 */
export const proposeRenewalBodySchema = z
  .strictObject({
    subscriptionId: z.uuid(),
    choice,
    proposedQuantity: quantity.optional(),
    /** The evidence of the vendor minimum when the seats are that minimum above the need. */
    note: text.optional(),
    outcome: writtenOutcome,
    outcomeNote: text.optional(),
    nextPeriod: nextPeriodSchema.optional(),
    closure: z.strictObject({ dataExported: z.boolean(), adminsTransferred: z.boolean() }).optional(),
  })
  .superRefine((body, context) => {
    if (NEEDS_NOTE.includes(body.outcome) && body.outcomeNote === undefined) {
      context.addIssue({
        code: 'custom',
        path: ['outcomeNote'],
        message: 'The note (the reason and the evidence) is required when the vendor refused or did something else.',
      });
    }
    if (body.closure !== undefined && body.choice !== 'CANCEL') {
      context.addIssue({
        code: 'custom',
        path: ['closure'],
        message: 'The closure is confirmed only with a cancellation.',
      });
    }
    const closing = body.choice === 'CANCEL' && body.outcome === 'AS_DECIDED';
    if (closing && !(body.closure?.dataExported === true && body.closure.adminsTransferred === true)) {
      context.addIssue({
        code: 'custom',
        path: ['closure'],
        message: 'Closing a subscription needs the data exported and the admins transferred, both confirmed.',
      });
    }
  });

const listQuerySchema = z.strictObject({
  state: states.optional(),
  subscriptionId: z.uuid().optional(),
  late: flag.optional(),
  mine: flag.optional().meta({
    description:
      'true lists only the renewals of the subscriptions the caller answers for as their IT Admin; false or absent lists them all.',
  }),
  ...pageQuery,
});
const deadlineEventsQuerySchema = z.strictObject({
  kind: deadlineKind.optional(),
  from: businessDate.optional(),
  to: businessDate.optional(),
  ...pageQuery,
});
const seatRankingQuerySchema = z.strictObject({ proposedOnly: flag.optional(), ...pageQuery });
const idParamSchema = z.strictObject({ id: z.uuid() });
const adjustmentQuerySchema = z.strictObject({ subscriptionId: z.uuid() });

const subscriptionBrief = z.strictObject({
  id: z.uuid(),
  planId: z.uuid(),
  planName: z.string(),
  applicationId: z.uuid(),
  applicationName: z.string(),
  provisioningType: z.enum(['K1', 'K2', 'K3', 'K4', 'K5']).meta({
    description: 'K1 is a plan of personal seats; K2 and K4 are shared pools (a workspace, a key pool).',
  }),
  responsibleItAdmin: z
    .strictObject({ employeeId: z.uuid(), employeeCode: z.string(), fullName: z.string() })
    .nullable()
    .meta({ description: 'The IT Admin who answers for the subscription, by name; null when none is named.' }),
});

export const renewalSummarySchema = z.strictObject({
  id: z.uuid(),
  state: states,
  subscription: subscriptionBrief,
  /** The milestone the period was proposed against and where it comes from. */
  milestone: z.strictObject({
    basis: z.enum(['DECLARED', 'INFERRED_UNCONFIRMED', 'BY_END_DATE', 'BY_RENEWAL_DATE', 'BY_PAYMENT_DATE']),
    baseDate: z.string(),
  }),
  proposedChoice: choice,
  proposedQuantity: z.number().int().nullable(),
  decidedChoice: choice.nullable(),
  executionPoint: executionPoint.nullable(),
  outcome: outcome.nullable(),
  lateFlagged: z.boolean(),
  /** Always null now: no case waits for a head (`QĐ-103e`); kept so a reader of the earlier contract still finds it. */
  waitingReason: z.enum(['NO_HEAD']).nullable(),
  proposedAt: z.iso.datetime(),
});

const figure = z.string().nullable();
const financialSnapshot = z.strictObject({
  status: z.enum(['BUDGET', 'NO_BUDGET', 'NO_COST_CENTER']),
  costCenterId: z.uuid().nullable(),
  fiscalYear: z.number().int().nullable(),
  currency: z.string().nullable(),
  budget: figure,
  spent: figure,
  committed: figure,
  remaining: figure,
  pendingRequests: figure,
  periodEffectiveCost: figure,
  periodDeductibleTax: figure,
  asOf: z.string(),
});
const decisionSnapshot = z.discriminatedUnion('source', [
  z.strictObject({ source: z.literal('CONNECTED'), financial: financialSnapshot }),
  z.strictObject({ source: z.literal('NOT_CONNECTED'), takenAt: z.string() }),
]);

export const renewalDetailSchema = renewalSummarySchema.extend({
  period: z.strictObject({
    purchasedQuantity: z.number().int().nullable(),
    billingCycle: z.string().nullable(),
    startDate: z.string().nullable(),
    endDate: z.string().nullable(),
    renewalDate: z.string().nullable(),
    autoRenew: z.boolean(),
    allowsMidTermReduction: z.boolean(),
    seatsInUse: z.number().int().nonnegative(),
  }),
  /** Whether a source of usage evidence is connected; without one the usage of the seats cannot be judged, never 0. */
  usage: z.strictObject({ status: z.enum(['AVAILABLE', 'NOT_AVAILABLE']) }),
  proposal: z.strictObject({
    choice,
    quantity: z.number().int().nullable(),
    note: z.string().nullable(),
    proposedByEmployeeId: z.uuid(),
    proposedAt: z.iso.datetime(),
    /** The seats the system counted for the next period when the result was recorded; null on a case of before. */
    seatsNeeded: z.number().int().nonnegative().nullable(),
    /** How many seats the IT Admin proposed to take back (a case of before; none is chosen now). */
    releasedSeatCount: z.number().int().nonnegative(),
  }),
  decision: z
    .strictObject({
      choice,
      quantity: z.number().int().nullable(),
      reason: z.string().nullable(),
      decidedByEmployeeId: z.uuid(),
      /** `IT_ADMIN_IN_CHARGE` is the one written now; the others are historical: a decision of before the one-write renewal (`QĐ-103e`). */
      deciderRole: z.enum(['OWNER_DEPARTMENT_HEAD', 'SPENDING_APPROVER', 'CONFLICT_SUBSTITUTE', 'IT_ADMIN_IN_CHARGE']),
      decidedAt: z.iso.datetime(),
      decidedOn: z.string(),
      decidedAfterDeadline: z.boolean(),
      executionPoint,
      seatsInUseAtDecision: z.number().int().nonnegative(),
      /** How many seats in use the decider chose to take back; each is a revocation task of the provisioning queue. */
      releasedSeatCount: z.number().int().nonnegative(),
      /** What the head saw of money when they confirmed; null for the IT Admin, who does not read the figures of a department. */
      snapshot: decisionSnapshot.nullable(),
    })
    .nullable(),
  lateFlaggedAt: z.iso.datetime().nullable(),
  outcomeDetail: z
    .strictObject({
      kind: outcome,
      note: z.string().nullable(),
      recordedByEmployeeId: z.uuid(),
      recordedAt: z.iso.datetime(),
      vendorFollowUpOpen: z.boolean(),
      nextSubscriptionId: z.uuid().nullable(),
      realisedSavings: money.nullable(),
      /** The outcome was recorded after the renewal day of the period (`QĐ-98e`). */
      lateRenewal: z.boolean(),
    })
    .nullable(),
});

export const rankedSeatSchema = z.strictObject({
  assignmentId: z.uuid(),
  employee: z.strictObject({ id: z.uuid(), employeeCode: z.string(), fullName: z.string() }),
  group: z.enum(['REVOCATION_DECIDED', 'HOLDER_LEFT', 'USAGE_FLAGGED', 'OTHER']),
  position: z.number().int().positive(),
  validFrom: z.string(),
  /** The day of the last activity when a source of usage evidence is connected; null while none is. */
  lastActivityOn: z.string().nullable(),
  /** The IT Admin proposed to take this seat back. */
  inProposal: z.boolean(),
});

export const deadlineEventSchema = z.strictObject({
  id: z.uuid(),
  subscription: subscriptionBrief,
  kind: deadlineKind,
  milestoneDate: z.string(),
  autoRenewAtTime: z.boolean(),
  recordedOn: z.string(),
  recordedAt: z.iso.datetime(),
});

/**
 * The seats a subscription needs for its next period, read before the result is recorded (`SBF-20` §5): the point of adjustment, the count of the
 * seats in its three parts, the seats to buy (`target`) and whether a cancellation is allowed. `suggestedChoice` is the choice the count points
 * to (null when the seats bought are not known and something is needed); the IT Admin still chooses.
 */
export const renewalAdjustmentSchema = z.strictObject({
  subscriptionId: z.uuid(),
  commitment: z.enum(['MONTHLY', 'ANNUAL']),
  deadlineKind: z.enum(['PAYMENT_DATE', 'NOTICE_DEADLINE', 'RENEWAL_DATE', 'END_DATE']),
  /** The last day to act by. */
  deadline: z.string(),
  /** The day the point of adjustment opens: a result is recorded from it. */
  adjustmentPointOn: z.string(),
  /** The day the period renews: a seat that ends on it is not needed after it. */
  renewalOn: z.string(),
  /** The day the red alert opens, for a plan by the year; null for a plan by the month. */
  redAlertOn: z.string().nullable(),
  purchasedQuantity: z.number().int().nullable(),
  vendorMinimumSeats: z.number().int().nullable(),
  seatsNeeded: z.strictObject({
    total: z.number().int().nonnegative(),
    heldPastRenewal: z.number().int().nonnegative(),
    pendingContinuations: z.number().int().nonnegative(),
    approvedAwaitingGrant: z.number().int().nonnegative(),
  }),
  /** The seats to buy for the next period: the need raised to the vendor minimum, zero when nothing is needed. */
  target: z.number().int().nonnegative(),
  suggestedChoice: choice.nullable(),
  /** The target is zero, no seat is in effect and no request for the plan is open. */
  canCancel: z.boolean(),
  activeSeatsToday: z.number().int().nonnegative(),
  openRequests: z.number().int().nonnegative(),
  /** The IT Admin who answers for the subscription while they are a usable IT Admin; null when none does. */
  responsibleItAdminEmployeeId: z.uuid().nullable(),
  /** False when another person reads or records in place of the one responsible (it does not block anything). */
  callerIsResponsible: z.boolean(),
  /** The case that already stands for the period (the result is recorded); null while none does. */
  recordedRenewalId: z.uuid().nullable(),
});

export type RenewalSummaryWire = z.infer<typeof renewalSummarySchema>;
export type RenewalDetailWire = z.infer<typeof renewalDetailSchema>;
export type RankedSeatWire = z.infer<typeof rankedSeatSchema>;
export type DeadlineEventWire = z.infer<typeof deadlineEventSchema>;
export type RenewalAdjustmentWire = z.infer<typeof renewalAdjustmentSchema>;

export class SubscriptionRenewalProposeBodyDto extends createZodDto(proposeRenewalBodySchema) {}
export class SubscriptionRenewalOutcomeBodyDto extends createZodDto(recordOutcomeBodySchema) {}
export class SubscriptionRenewalListQueryDto extends createZodDto(listQuerySchema) {}
export class SubscriptionDeadlineEventListQueryDto extends createZodDto(deadlineEventsQuerySchema) {}
export class SubscriptionRenewalSeatRankingQueryDto extends createZodDto(seatRankingQuerySchema) {}
export class SubscriptionRenewalIdParamDto extends createZodDto(idParamSchema) {}
export class SubscriptionRenewalAdjustmentQueryDto extends createZodDto(adjustmentQuerySchema) {}
export class SubscriptionRenewalResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ renewal: renewalDetailSchema })),
) {}
export class SubscriptionRenewalAdjustmentResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ adjustment: renewalAdjustmentSchema })),
) {}
export class SubscriptionRenewalPageResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ items: z.array(renewalSummarySchema), pagination })),
) {}
export class SubscriptionRenewalSeatRankingResponseDto extends createZodDto(
  successEnvelopeSchema(
    z.strictObject({
      usage: z.strictObject({ status: z.enum(['AVAILABLE', 'NOT_AVAILABLE']) }),
      seatsInUse: z.number().int().nonnegative(),
      items: z.array(rankedSeatSchema),
      pagination,
    }),
  ),
) {}
export class SubscriptionDeadlineEventPageResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ items: z.array(deadlineEventSchema), pagination })),
) {}
