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
const noticeDays = z.number().int().min(0).max(3650);
const money = z.strictObject({ amount: z.string().max(40), currency: z.string().regex(/^[A-Z]{3}$/) });

export const declareSubscriptionBodySchema = z.strictObject({
  planId: z.uuid(),
  // The department that owns the purchase (QĐ-89a), never part of a change: it is not a field of PATCH. A K2/K4 purchase is the company's
  // shared pool (QĐ-103d) and may name none; a K1 purchase must name one (SUBSCRIPTION.OWNER_DEPARTMENT_INACTIVE when it does not).
  ownerDepartmentId: z.uuid().optional(),
  kind,
  purchasedQuantity: quantity.optional(),
  unitPrice: money.optional(),
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
  unitPrice: money.optional(),
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

export const listSubscriptionsQuerySchema = z.strictObject({
  applicationId: z.uuid().optional(),
  planId: z.uuid().optional(),
  status: status.optional(),
  kind: kind.optional(),
  warning: z.enum(['NO_ALERT_ANCHOR']).optional(),
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
  vendor: z.strictObject({ id: z.uuid(), name: z.string() }),
  kind,
  status,
  missingFinancialData: z.boolean(),
  missing: z.array(z.enum(['QUANTITY', 'START_DATE', 'BILLING_CYCLE', 'UNIT_PRICE', 'EXCHANGE_RATE'])),
  purchasedQuantity: z.number().int().nullable(),
  unitPrice: z.strictObject({ amount: z.string(), currency: z.string() }).nullable(),
  priceSnapshot: z
    .strictObject({
      recordedOn: z.string(),
      rate: z.string(),
      rateDate: z.string(),
      rateSource: z.enum(['MANUAL', 'SAME_CURRENCY']),
      reportingAmount: z.string(),
      reportingCurrency: z.string(),
      exchangeRateId: z.uuid().nullable(),
    })
    .nullable(),
  billingCycle: billingCycle.nullable(),
  commitmentTermMonths: commitmentTermMonths.nullable(),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  renewalDate: z.string().nullable(),
  noticePeriodDays: z.number().int().nullable(),
  autoRenew: z.boolean(),
  allowsMidTermReduction: z.boolean(),
  responsibleItAdminEmployeeId: z.uuid().nullable(),
  vendorMinimumSeats: z.number().int().nullable(),
  isPrimaryForPlan: z.boolean(),
  noticeDeadline: z.strictObject({
    value: z.string().nullable(),
    source: z.enum(['DECLARED', 'INFERRED_UNCONFIRMED', 'BY_END_DATE', 'MISSING', 'NOT_APPLICABLE']),
  }),
  alerts: z.strictObject({ baseDate: z.string().nullable(), dates: z.array(z.string()) }),
  warnings: z.array(z.enum(['NO_ALERT_ANCHOR', 'RESPONSIBLE_MISSING', 'BILLING_CYCLE_LEGACY', 'SHOULD_MERGE'])),
  /** The other live subscriptions of the same K2 or K4 plan when `warnings` has SHOULD_MERGE: the ones to fold into one. */
  mergeCandidateIds: z.array(z.uuid()),
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
