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
// Data written earlier may hold a quarterly or other cycle, so the answer names all four; a new write is refused the two others by the policy.
const billingCycle = z.enum(['MONTHLY', 'QUARTERLY', 'ANNUAL', 'OTHER']);
const commitmentTermMonths = z.union([z.literal(1), z.literal(12)]);
const vendorMinimumSeats = z.number().int().min(1).max(1_000_000_000);
const quantity = z.number().int().min(0).max(1_000_000_000);
/** The vendor admins a subscription lists: the members of the workspace profile of its plan, at most this many (X-IT.5, QĐ-110k). */
export const VENDOR_ADMINS_MAX = 20;
const noticeDays = z.number().int().min(0).max(3650);
const money = z.strictObject({ amount: z.string().max(40), currency: z.string().regex(/^[A-Z]{3}$/) });
const unitPrice = money.meta({
  description:
    'The unit price in dong: a decimal string in major units, currency VND. Another currency is refused (SUBSCRIPTION.PRICE_NOT_VND).',
});
const originalPrice = money.meta({
  description:
    'The price the vendor quoted in another currency, kept beside the price in dong so an invoice can be matched against it: a decimal string in major units of its currency. It is only kept, never converted.',
});

export const declareSubscriptionBodySchema = z.strictObject({
  planId: z.uuid(),
  // The department that owns the purchase (QĐ-89a), never part of a change: it is not a field of PATCH. A K2/K4 purchase is the company's
  // shared pool (QĐ-103d) and may name none; a K1 purchase must name one (SUBSCRIPTION.OWNER_DEPARTMENT_INACTIVE when it does not).
  ownerDepartmentId: z.uuid().optional(),
  kind,
  purchasedQuantity: quantity.optional(),
  unitPrice: unitPrice.optional(),
  originalPrice: originalPrice.optional(),
  billingCycle: billingCycle.optional(),
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
});

export const updateSubscriptionBodySchema = z.strictObject({
  purchasedQuantity: quantity.optional(),
  unitPrice: unitPrice.optional(),
  originalPrice: originalPrice.nullable().optional().meta({
    description: 'The original price the vendor quoted; null takes the recorded one away.',
  }),
  billingCycle: billingCycle.optional(),
  commitmentTermMonths: commitmentTermMonths.optional(),
  startDate: businessDate.optional(),
  endDate: businessDate.nullable().optional(),
  renewalDate: businessDate.nullable().optional(),
  noticeDeadline: businessDate.nullable().optional(),
  noticePeriodDays: noticeDays.nullable().optional(),
  autoRenew: z.boolean().optional(),
  allowsMidTermReduction: z.boolean().optional(),
  responsibleItAdminEmployeeId: z.uuid().optional(),
  vendorMinimumSeats: vendorMinimumSeats.nullable().optional(),
  // Makes this the subscription that prices its plan (Q-04); the flag of the other subscriptions of the plan is taken off.
  isPrimaryForPlan: z.boolean().optional(),
});

const queryFlag = z.enum(['true', 'false']).transform((value) => value === 'true');

export const listSubscriptionsQuerySchema = z.strictObject({
  applicationId: z.uuid().optional(),
  planId: z.uuid().optional(),
  status: status.optional(),
  kind: kind.optional(),
  warning: z.enum(['NO_ALERT_ANCHOR']).optional(),
  mine: queryFlag.optional().meta({
    description:
      'true lists only the subscriptions the caller answers for as their IT Admin; false or absent lists them all.',
  }),
  expiry: z.enum(['SOON', 'EXPIRED']).optional().meta({
    description:
      'SOON lists the subscriptions from the point of adjustment to the day of its deadline, EXPIRED those past the deadline while seats are still held. A purchase made once is never listed.',
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
const subscriptionSchema = z.strictObject({
  id: z.uuid(),
  planId: z.uuid(),
  planName: z.string(),
  // The department that owns the purchase (`QĐ-89a`); null on a subscription of the shared pool that no department owns.
  ownerDepartmentId: z.uuid().nullable(),
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
  isPrimaryForPlan: z.boolean(),
  expiry: z.enum(['SOON', 'EXPIRED']).nullable().meta({
    description:
      'SOON from the point of adjustment to the day of its deadline, EXPIRED past it while seats are still held; null before the point, for a purchase made once and when no date is known to count from.',
  }),
  daysLeft: z.number().int().nullable().meta({
    description:
      'The days from today to the deadline the point counts to; negative once it is past; null when there is no point.',
  }),
  deadlineKind: z.enum(['PAYMENT_DATE', 'NOTICE_DEADLINE', 'RENEWAL_DATE', 'END_DATE']).nullable().meta({
    description:
      'What daysLeft counts to: the payment day of a plan by the month; by the year, the deadline to cancel, else the renewal day, else the end day.',
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
});

export class DeclareSubscriptionBodyDto extends createZodDto(declareSubscriptionBodySchema) {}
export class UpdateSubscriptionBodyDto extends createZodDto(updateSubscriptionBodySchema) {}
export class ListSubscriptionsQueryDto extends createZodDto(listSubscriptionsQuerySchema) {}
export class SubscriptionIdParamDto extends createZodDto(subscriptionIdParamSchema) {}
export class SubscriptionResponseDto extends createZodDto(successEnvelopeSchema(subscriptionSchema)) {}
export class SubscriptionPageResponseDto extends createZodDto(
  successEnvelopeSchema(
    z.strictObject({
      items: z.array(subscriptionSchema),
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
