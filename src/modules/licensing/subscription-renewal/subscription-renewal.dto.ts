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

export const proposeRenewalBodySchema = z.strictObject({
  subscriptionId: z.uuid(),
  choice,
  proposedQuantity: quantity.optional(),
  note: text.optional(),
  businessOwnerOpinion: text.optional(),
  /** The seats to take back when reducing below the seats in use: exactly the excess (`QĐ-66x`); none for another choice. */
  releasedAssignmentIds: z.array(z.uuid()).max(10_000).optional(),
});

/** The head of the owner department confirms the proposal as it is; nothing of it is changed here (`QĐ-94d`(2)). */
export const decideRenewalBodySchema = z.strictObject({
  decision: z.literal('CONFIRM'),
  reason: text.optional(),
  acknowledgeActiveUsers: z.boolean().optional(),
});

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

const listQuerySchema = z.strictObject({
  state: states.optional(),
  subscriptionId: z.uuid().optional(),
  late: flag.optional(),
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

const subscriptionBrief = z.strictObject({
  id: z.uuid(),
  planId: z.uuid(),
  planName: z.string(),
  applicationId: z.uuid(),
  applicationName: z.string(),
  ownerDepartmentId: z.uuid(),
});

export const renewalSummarySchema = z.strictObject({
  id: z.uuid(),
  state: states,
  subscription: subscriptionBrief,
  /** The milestone the period was proposed against and where it comes from. */
  milestone: z.strictObject({
    basis: z.enum(['DECLARED', 'INFERRED_UNCONFIRMED', 'BY_END_DATE']),
    baseDate: z.string(),
  }),
  proposedChoice: choice,
  proposedQuantity: z.number().int().nullable(),
  decidedChoice: choice.nullable(),
  executionPoint: executionPoint.nullable(),
  outcome: outcome.nullable(),
  lateFlagged: z.boolean(),
  /** Set while the case waits to be confirmed and the department that owns the subscription has no head today: nobody else confirms it (`QĐ-93c`). */
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
    businessOwnerOpinion: z.string().nullable(),
    proposedByEmployeeId: z.uuid(),
    proposedAt: z.iso.datetime(),
    /** How many seats the IT Admin proposed to take back. */
    releasedSeatCount: z.number().int().nonnegative(),
  }),
  decision: z
    .strictObject({
      choice,
      quantity: z.number().int().nullable(),
      reason: z.string().nullable(),
      decidedByEmployeeId: z.uuid(),
      /** `SPENDING_APPROVER` and `CONFLICT_SUBSTITUTE` are historical: a decision of before `QĐ-94d`(2); none is written now. */
      deciderRole: z.enum(['OWNER_DEPARTMENT_HEAD', 'SPENDING_APPROVER', 'CONFLICT_SUBSTITUTE']),
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

export type RenewalSummaryWire = z.infer<typeof renewalSummarySchema>;
export type RenewalDetailWire = z.infer<typeof renewalDetailSchema>;
export type RankedSeatWire = z.infer<typeof rankedSeatSchema>;
export type DeadlineEventWire = z.infer<typeof deadlineEventSchema>;

export class SubscriptionRenewalProposeBodyDto extends createZodDto(proposeRenewalBodySchema) {}
export class SubscriptionRenewalDecideBodyDto extends createZodDto(decideRenewalBodySchema) {}
export class SubscriptionRenewalOutcomeBodyDto extends createZodDto(recordOutcomeBodySchema) {}
export class SubscriptionRenewalListQueryDto extends createZodDto(listQuerySchema) {}
export class SubscriptionDeadlineEventListQueryDto extends createZodDto(deadlineEventsQuerySchema) {}
export class SubscriptionRenewalSeatRankingQueryDto extends createZodDto(seatRankingQuerySchema) {}
export class SubscriptionRenewalIdParamDto extends createZodDto(idParamSchema) {}
export class SubscriptionRenewalResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ renewal: renewalDetailSchema })),
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
