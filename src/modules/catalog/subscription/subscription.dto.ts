import { z } from 'zod';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';
import { businessDate } from '../../../infrastructure/http/dto/business-date.dto';

/**
 * Only the shape and a generous bound are checked here. Whether the kind and the plan fit, a perpetual purchase carries
 * a term, the dates are in order, or the price is a valid amount of a supported currency is judged by the policy and the
 * finance facade and answers with its own code. Money is text, never a JSON number (ADR-0007). The plan and the kind are
 * not fields of a change, and nothing required can be cleared: only the four optional term fields take `null`.
 */
const kind = z.enum(['TERM', 'PERPETUAL']);
const status = z.enum(['DRAFT', 'ACTIVE']);
// Data written earlier may hold a quarterly or other cycle, so the answer names all four; new writes only accept MONTHLY or ANNUAL.
const billingCycle = z.enum(['MONTHLY', 'QUARTERLY', 'ANNUAL', 'OTHER']);
const declarableBillingCycle = z.enum(['MONTHLY', 'ANNUAL']);
const commitmentTermMonths = z.union([z.literal(1), z.literal(12)]);
const vendorMinimumSeats = z.number().int().min(1).max(1_000_000_000);
const minimumSeatsTotal = z.number().int().min(1).max(1_000_000_000).meta({
  description: 'The least number of seats the vendor sells across the workspace, when it says one.',
});
const seatCounting = z.enum(['FIXED', 'MEMBERS']).meta({
  description:
    'FIXED: a number of seats bought (the default). MEMBERS: the members the vendor counts; a one-month commitment only, with the payment day in renewalDate. It cannot change once the subscription is active.',
});
const quantity = z.number().int().min(0).max(1_000_000_000);
/** The vendor admins a subscription lists: the members of the workspace profile of its plan, at most this many (X-IT.5, QĐ-110k). */
export const VENDOR_ADMINS_MAX = 20;
const noticeDays = z.number().int().min(0).max(3650);
const money = z.strictObject({ amount: z.string().max(40), currency: z.string().regex(/^[A-Z]{3}$/) });
const unitPrice = money.meta({
  description:
    'The unit price in dong for the billing cycle (or price of one license for K4): a decimal string in major units, currency VND. Another currency is refused (SUBSCRIPTION.PRICE_NOT_VND).',
});
const monthlyUnitPrice = money.meta({
  description:
    'The monthly unit price per seat in dong (VND). Preferred on new writes; when sent alongside unitPrice, unitPrice must equal monthlyUnitPrice multiplied by the billing cycle months (SUBSCRIPTION.PRICE_MISMATCH).',
});
const originalPrice = money.meta({
  description:
    'The price the vendor quoted in another currency, kept beside the price in dong so an invoice can be matched against it: a decimal string in major units of its currency. It is only kept, never converted.',
});

export const SUBSCRIPTION_LINES_MAX = 20;

const declareSubscriptionLineSchema = z.strictObject({
  planId: z.uuid(),
  monthlyUnitPrice: monthlyUnitPrice,
  quantity: z.number().int().min(0).max(1_000_000),
  minimumSeats: z.number().int().min(1).max(1_000_000).optional(),
});

export const declareSubscriptionBodySchema = z.strictObject({
  planId: z.uuid().optional(),
  lines: z.array(declareSubscriptionLineSchema).min(1).max(SUBSCRIPTION_LINES_MAX).optional(),
  kind,
  purchasedQuantity: quantity.optional(),
  unitPrice: unitPrice.optional(),
  monthlyUnitPrice: monthlyUnitPrice.optional(),
  originalPrice: originalPrice.optional(),
  billingCycle: declarableBillingCycle.optional(),
  commitmentTermMonths: commitmentTermMonths.optional(),
  startDate: businessDate.optional(),
  endDate: businessDate.optional(),
  renewalDate: businessDate.optional(),
  noticeDeadline: businessDate.optional(),
  noticePeriodDays: noticeDays.optional(),
  autoRenew: z.boolean().optional(),
  allowsMidTermReduction: z.boolean().optional(),
  // The IT Admin who answers for the subscription (QĐ-103v(4)): needed once it is active.
  responsibleItAdminEmployeeId: z.uuid().optional().meta({
    description:
      'The IT Admin who answers for the subscription. When it is not sent, the IT Admin responsible for the application of the plan is taken if they still work as an IT Admin; otherwise it stays empty and an active subscription refuses to be saved without one.',
  }),
  vendorMinimumSeats: vendorMinimumSeats.optional(),
  workspaceId: z.uuid().optional().meta({
    description:
      'The workspace the subscription is held in; its vendor must be the vendor of the plan. Left out, a subscription of a plan the company administers at the vendor takes the only workspace of the vendor, or a workspace named after the vendor is made when it has none; with several the caller must say which.',
  }),
  seatCounting: seatCounting.optional(),
  minimumSeatsTotal: minimumSeatsTotal.optional(),
  invoicedLater: z.boolean().optional().meta({ description: 'The vendor invoices after the period.' }),
});

export const updateSubscriptionBodySchema = z.strictObject({
  purchasedQuantity: quantity.optional().meta({
    description:
      'No longer used to write: sending a value is refused. The seats of a subscription are bought, corrected and reduced on its lines and counted from their ledger.',
  }),
  unitPrice: unitPrice.optional(),
  monthlyUnitPrice: monthlyUnitPrice.optional(),
  originalPrice: originalPrice.nullable().optional().meta({
    description: 'The original price the vendor quoted; null takes the recorded one away.',
  }),
  billingCycle: declarableBillingCycle.optional(),
  commitmentTermMonths: commitmentTermMonths.optional(),
  startDate: businessDate.optional(),
  endDate: businessDate.nullable().optional(),
  renewalDate: businessDate.nullable().optional(),
  noticeDeadline: businessDate.nullable().optional(),
  noticePeriodDays: noticeDays.nullable().optional(),
  autoRenew: z.boolean().optional(),
  allowsMidTermReduction: z.boolean().optional(),
  vendorMinimumSeats: vendorMinimumSeats.nullable().optional(),
  workspaceId: z.uuid().optional().meta({
    description:
      'Moves the subscription to another workspace of the same vendor, unless it would duplicate a live plan there.',
  }),
  seatCounting: seatCounting.optional(),
  minimumSeatsTotal: minimumSeatsTotal.nullable().optional(),
  invoicedLater: z.boolean().optional(),
  isPrimaryForPlan: z.boolean().optional().meta({
    description:
      'No longer used to write: marking a subscription as the one that prices its plan is refused. The price of a plan is read from the lines of its workspace.',
  }),
  quantityChangeReason: z.string().trim().min(1).max(500).optional().meta({
    description:
      'Reason for increasing purchasedQuantity on an active K2 subscription (1-500 characters after trimming; required when increasing, ignored when not increasing).',
  }),
  expectedUpdatedAt: z.iso.datetime({ offset: true }).optional().meta({
    description:
      'The updatedAt of the subscription as the client read it. Required whenever purchasedQuantity is sent (missing gives SUBSCRIPTION.VERSION_REQUIRED); when sent and no longer current the change is refused (SUBSCRIPTION.STALE) and nothing is written.',
  }),
});

const queryFlag = z.enum(['true', 'false']).transform((value) => value === 'true');

export const listSubscriptionsQuerySchema = z.strictObject({
  applicationId: z.uuid().optional(),
  planId: z.uuid().optional(),
  workspaceId: z.uuid().optional().meta({ description: 'Only the subscriptions held in this workspace.' }),
  status: status.optional(),
  kind: kind.optional(),
  warning: z.enum(['NO_ALERT_ANCHOR']).optional(),
  mine: queryFlag.optional().meta({
    description:
      'true lists only the subscriptions the caller answers for as their IT Admin; false or absent lists them all.',
  }),
  expiry: z.enum(['SOON', 'EXPIRED']).optional().meta({
    description:
      'SOON lists the subscriptions from the point of adjustment to the last day of their period (a plan by the year stays SOON after its deadline to cancel, up to its renewal day, else its end day); EXPIRED those past that last day while seats are still held. A plan by the month goes on from one payment day to the next, so only one that does not renew itself is EXPIRED, after its end day. A purchase made once is never listed.',
  }),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});
export const subscriptionIdParamSchema = z.strictObject({ id: z.uuid() });

const taxEstimate = z.strictObject({
  basis: z.enum(['PROFILE', 'DEFAULT_NO_PROFILE']),
  label: z.enum(['ESTIMATE', 'ESTIMATE_NO_PROFILE']),
  group: z.enum(['T1', 'T2', 'T3']),
  taxAmount: z.string(),
  deductibleTaxAmount: z.string(),
  nonDeductibleTaxAmount: z.string(),
  estimatedCost: z.string(),
});
const subscriptionLineSummarySchema = z.strictObject({
  id: z.uuid(),
  plan: z.strictObject({ id: z.uuid(), name: z.string() }),
  monthlyUnitPrice: money,
  minimumSeats: z.number().int().nullable(),
  seatsToday: z.number().int().nonnegative(),
  assignedToday: z.number().int().nonnegative(),
  freeToday: z.number().int().nonnegative(),
  closedOn: z.string().nullable(),
  closedReason: z.enum(['RENEWED', 'ENDED', 'REMOVED']).nullable(),
});

const subscriptionBaseFields = {
  id: z.uuid(),
  planId: z.uuid(),
  planName: z.string(),
  applicationId: z.uuid(),
  applicationName: z.string(),
  logoUrl: z.string().nullable().meta({
    description:
      'The https link to the logo image of the application that the IT Admin pasted, or null. The server never checks it: it may be broken, so show the first letter of the name when the image does not load.',
  }),
  vendor: z.strictObject({ id: z.uuid(), name: z.string() }),
  kind,
  status,
  missingFinancialData: z.boolean(),
  missing: z.array(z.enum(['QUANTITY', 'START_DATE', 'BILLING_CYCLE', 'UNIT_PRICE'])),
  purchasedQuantity: z.number().int().nullable(),
  unitPrice: z.strictObject({ amount: z.string(), currency: z.string() }).nullable(),
  monthlyUnitPrice: z.strictObject({ amount: z.string(), currency: z.string() }).nullable(),
  originalPrice: z.strictObject({ amount: z.string(), currency: z.string() }).nullable(),
  billingCycle: billingCycle.nullable(),
  commitmentTermMonths: commitmentTermMonths.nullable(),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  renewalDate: z.string().nullable(),
  noticePeriodDays: z.number().int().nullable(),
  autoRenew: z.boolean(),
  allowsMidTermReduction: z.boolean(),
  responsibleItAdminEmployeeId: z.uuid().nullable(),
  responsibleItAdmin: z
    .strictObject({ employeeId: z.uuid(), employeeCode: z.string(), fullName: z.string() })
    .nullable()
    .meta({ description: 'The IT Admin who answers for the subscription, by name; null when none is named.' }),
  vendorMinimumSeats: z.number().int().nullable(),
  workspace: z.strictObject({ id: z.uuid(), name: z.string() }).nullable(),
  seatCounting,
  minimumSeatsTotal: z.number().int().nullable(),
  invoicedLater: z.boolean(),
  isPrimaryForPlan: z.boolean(),
  expiry: z.enum(['SOON', 'EXPIRED']).nullable().meta({
    description:
      'SOON from the point of adjustment to the last day of the period (a plan by the year stays SOON past its deadline to cancel); EXPIRED the day after the last day of the period (the renewal day, else the end day; for a plan by the month that does not renew itself, its end day) while seats are still held; null before the point, for a purchase made once and when no date is known to count from.',
  }),
  daysLeft: z.number().int().nullable().meta({
    description:
      'The days from today to the deadline the point counts to; negative once it is past while the period still runs (a plan by the year after its deadline to cancel); once EXPIRED it counts from the last day of the period instead, and deadlineKind says which; null when there is no point.',
  }),
  deadlineKind: z.enum(['PAYMENT_DATE', 'NOTICE_DEADLINE', 'RENEWAL_DATE', 'END_DATE']).nullable().meta({
    description:
      'What daysLeft counts to: the next payment day of a plan by the month; by the year, the deadline to cancel, else the renewal day, else the end day; once EXPIRED, the last day of the period it counts from (the renewal day or the end day; the payment day of a plan by the month that ends; the deadline itself when no later day is known).',
  }),
  seats: z
    .strictObject({
      purchased: z.number().int().nullable(),
      assigned: z.number().int().nonnegative(),
      free: z.number().int().nonnegative().nullable(),
      inRevocation: z.number().int().nonnegative(),
    })
    .nullable()
    .meta({
      description:
        'The seats of the shared pool of a K2 plan: bought, taken by an assignment from today on, free to grant, and held by a right being taken back. Null for any other kind of plan.',
    }),
  noticeDeadline: z.strictObject({
    value: z.string().nullable(),
    source: z.enum(['DECLARED', 'INFERRED_UNCONFIRMED', 'BY_END_DATE', 'MISSING', 'NOT_APPLICABLE']),
  }),
  alerts: z.strictObject({ baseDate: z.string().nullable(), dates: z.array(z.string()) }),
  warnings: z.array(z.enum(['NO_ALERT_ANCHOR', 'RESPONSIBLE_MISSING', 'BILLING_CYCLE_LEGACY', 'SHOULD_MERGE'])),
  /** The other live subscriptions of the same K2 or K4 plan when `warnings` has SHOULD_MERGE: the ones to fold into one. */
  mergeCandidateIds: z.array(z.uuid()),
  /** Who administers the plan at the vendor: empty for a plan that needs no admins (K1, K5, K4 with no admin console). At most 20. */
  vendorAdmins: z
    .array(
      z.strictObject({
        employeeId: z.uuid(),
        employeeCode: z.string(),
        fullName: z.string(),
        role: z.enum(['OWNER', 'ADMIN']),
        /** The person is an IT Admin who works now. */
        working: z.boolean(),
      }),
    )
    .max(VENDOR_ADMINS_MAX),
  /** The email of the company account that owns the plan at the vendor (no password); null when none is recorded. */
  ownerAccountEmail: z.string().nullable(),
  adminNote: z.string().nullable(),
  /** The plan needs admins at the vendor and fewer than two of the ones recorded work now: a flag, never a refusal (a subscription older than the rule has it). */
  vendorAdminsBelowMinimum: z.boolean(),
  /** The plan needs admins at the vendor and no email of the company account is recorded: a flag, never a refusal. */
  ownerAccountEmailMissing: z.boolean(),
  taxProfile: z.strictObject({ status: z.enum(['DECLARED', 'MISSING']), group: z.enum(['T1', 'T2', 'T3']).nullable() }),
  taxEstimate: taxEstimate.nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
};

const subscriptionSchema = z.strictObject({
  ...subscriptionBaseFields,
  lines: z.array(subscriptionLineSummarySchema).max(SUBSCRIPTION_LINES_MAX),
});

const subscriptionListItemSchema = z.strictObject({
  ...subscriptionBaseFields,
  lineCount: z.number().int().nonnegative(),
  seatsToday: z.number().int().nonnegative(),
});

export class DeclareSubscriptionBodyDto extends createZodDto(declareSubscriptionBodySchema) {}
export class UpdateSubscriptionBodyDto extends createZodDto(updateSubscriptionBodySchema) {}
export class ListSubscriptionsQueryDto extends createZodDto(listSubscriptionsQuerySchema) {}
export class SubscriptionIdParamDto extends createZodDto(subscriptionIdParamSchema) {}
export class SubscriptionResponseDto extends createZodDto(successEnvelopeSchema(subscriptionSchema)) {}
export class SubscriptionPageResponseDto extends createZodDto(
  successEnvelopeSchema(
    z.strictObject({
      items: z.array(subscriptionListItemSchema),
      pagination: z.strictObject({
        page: z.number().int().positive(),
        pageSize: z.number().int().positive(),
        totalItems: z.number().int().nonnegative(),
        totalPages: z.number().int().nonnegative(),
      }),
      emptyState: z
        .strictObject({
          reason: z.enum(['NO_APPLICATIONS', 'NO_SUBSCRIPTIONS']),
          nextStep: z.strictObject({
            step: z.number().int().min(2).max(3),
            key: z.enum(['APPLICATIONS', 'CONTRACTS_AND_SUBSCRIPTIONS']),
          }),
        })
        .nullable(),
    }),
  ),
) {}
export class SubscriptionResponsibleChangeResponseDto extends createZodDto(
  successEnvelopeSchema(
    subscriptionSchema.extend({
      changed: z.boolean().meta({
        description: 'False when the IT Admin named already answered for the subscription and nothing was written.',
      }),
    }),
  ),
) {}
