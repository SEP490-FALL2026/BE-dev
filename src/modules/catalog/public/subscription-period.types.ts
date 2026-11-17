import type { BusinessDate } from '../../../core/business-date';

/** Where the milestone of a term comes from (`US-04-03`): declared, inferred from the notice period, the end date, or missing. */
export type PeriodNoticeSource = 'DECLARED' | 'INFERRED_UNCONFIRMED' | 'BY_END_DATE' | 'MISSING' | 'NOT_APPLICABLE';

/**
 * The point of adjustment of a period as the catalog derives it (`FR-1.4`, `QĐ-103e`): the day the IT Admin has to act by (`deadline`, of
 * the kind `kind`), the day the point opens (`point`), the last day of the period (`end`) and, for a plan by the year, the day the red alert opens.
 */
export interface PeriodAdjustment {
  kind: 'PAYMENT_DATE' | 'NOTICE_DEADLINE' | 'RENEWAL_DATE' | 'END_DATE';
  deadline: BusinessDate;
  point: BusinessDate;
  end: BusinessDate;
  /** The day the red alert opens, for a plan by the year; null for a plan by the month. */
  redAlertOn: BusinessDate | null;
  commitment: 'MONTHLY' | 'ANNUAL';
}

/**
 * What the renewal of a subscription period needs to know of it (EP-11): the term, the milestone as the catalog derives it,
 * the price and the seats bought, the department that owns it (none for the shared pool), and whether a later period already continues it. Nothing of
 * how the catalog keeps it.
 */
export interface RenewalPeriodFacts {
  subscriptionId: string;
  planId: string;
  planName: string;
  planPricingModel: 'PER_SEAT' | 'FLAT_RATE' | 'CONCURRENT' | 'CONSUMPTION' | 'PER_HOST' | null;
  applicationId: string;
  applicationName: string;
  applicationKind: 'SAAS' | 'LICENSED' | 'INTERNAL';
  /** The department that owns it; null for a subscription of the shared pool (K2 workspaces, K4 keys), which every IT Admin works. */
  ownerDepartmentId: string | null;
  /** The IT Admin who answers for the subscription; null when it names none (`QĐ-103v`(4)). */
  responsibleItAdminEmployeeId: string | null;
  provisioningType: 'K1' | 'K2' | 'K3' | 'K4' | 'K5';
  /** The months the purchase commits to (`QĐ-103e`); null when none is declared. */
  commitmentTermMonths: 1 | 12 | null;
  /** The least number of seats the vendor sells, when it says one (`QĐ-103e`). */
  vendorMinimumSeats: number | null;
  /** The subscription that prices its plan when there are several of it. */
  isPrimaryForPlan: boolean;
  kind: 'TERM' | 'PERPETUAL';
  status: 'DRAFT' | 'ACTIVE';
  purchasedQuantity: number | null;
  unitPrice: { amountMinor: bigint; currency: string } | null;
  billingCycle: 'MONTHLY' | 'QUARTERLY' | 'ANNUAL' | 'OTHER' | null;
  startDate: BusinessDate | null;
  endDate: BusinessDate | null;
  renewalDate: BusinessDate | null;
  autoRenew: boolean;
  allowsMidTermReduction: boolean;
  notice: { source: PeriodNoticeSource; deadline: BusinessDate | null; baseDate: BusinessDate | null };
  /** The point of adjustment of the period on the business day it was read; null when no date gives one or the purchase was made once. */
  adjustment: PeriodAdjustment | null;
  renewedFromId: string | null;
  /** The period that continues this one, once a renewal recorded it; null while none does. */
  renewedById: string | null;
}

/** The new period the IT Admin records from what the vendor confirmed (`US-11-05` AC-11): a term of the same plan and owner. */
export interface NextPeriodInput {
  previousSubscriptionId: string;
  purchasedQuantity: number;
  unitPrice: { amount: string; currency: string };
  /** Where the price sits in the body of the request the caller answers (`nextPeriod.unitPrice`), so a money error points at that field; `unitPrice` when absent. */
  unitPricePath?: string;
  billingCycle: 'MONTHLY' | 'QUARTERLY' | 'ANNUAL' | 'OTHER';
  startDate: BusinessDate;
  endDate?: BusinessDate;
  renewalDate?: BusinessDate;
  noticeDeadline?: BusinessDate;
  noticePeriodDays?: number;
  autoRenew: boolean;
  allowsMidTermReduction: boolean;
}

/** Why a new period was not recorded: nothing is written. */
export type PeriodRefusal =
  | 'NOT_FOUND'
  | 'NOT_TERM'
  | 'ALREADY_RENEWED'
  | 'APPLICATION_RETIRED'
  | 'STARTS_TOO_EARLY'
  | 'INVALID_DATES'
  | 'INVALID_TERMS'
  | 'NO_OWNER_DEPARTMENT'
  /** The price of the new period is not in dong: a price is entered in dong only (`QĐ-111an`). */
  | 'PRICE_NOT_VND';

/**
 * What the payment days of a subscription follow (`PI-2`): the cycle it is paid by, the days it begins, ends and renews, whether it renews itself,
 * and the day the system came to know it. Of a subscription that runs a period, owned by a department or by the shared pool.
 */
export interface PaymentScheduleFacts {
  subscriptionId: string;
  planId: string;
  /** The department that owns it; null for a subscription of the shared pool (K2 workspaces, K4 keys), which every IT Admin works. */
  ownerDepartmentId: string | null;
  billingCycle: 'MONTHLY' | 'QUARTERLY' | 'ANNUAL';
  startDate: BusinessDate;
  endDate: BusinessDate | null;
  renewalDate: BusinessDate | null;
  autoRenew: boolean;
  /** The instant the subscription was recorded: a period paid before it is not one the system answers for. */
  recordedAt: Date;
}

/**
 * What a purchase invoice reads of the subscription it names (`PI-1`): the plan, how many were bought, who owns it and who answers for it. Of any
 * subscription, one a department owns and one of the shared pool alike (the facts of a renewal leave the pool out: nobody decides its renewal).
 */
export interface SubscriptionPurchaseFacts {
  subscriptionId: string;
  planId: string;
  /** The department that owns it; null for a subscription of the shared pool, which every IT Admin may submit an invoice for. */
  ownerDepartmentId: string | null;
  /** The IT Admin who answers for the subscription; null when it names none (`QĐ-103v`(4)). */
  responsibleItAdminEmployeeId: string | null;
  purchasedQuantity: number | null;
  /** What one seat costs a month in dong: the price of a cycle over its months, rounded up; null when the price or the cycle is not known. */
  monthlyPriceMinor: bigint | null;
  /** The months a payment pays for (1, 3 or 12); null for another cycle or none. */
  cycleMonths: number | null;
  /** The day the period renews; null when none is set. */
  renewalDate: BusinessDate | null;
}
