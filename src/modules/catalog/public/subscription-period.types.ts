import type { BusinessDate } from '../../../core/business-date';

/** Where the milestone of a term comes from (`US-04-03`): declared, inferred from the notice period, the end date, or missing. */
export type PeriodNoticeSource = 'DECLARED' | 'INFERRED_UNCONFIRMED' | 'BY_END_DATE' | 'MISSING' | 'NOT_APPLICABLE';

/**
 * What the renewal of a subscription period needs to know of it (EP-11): the term, the milestone as the catalog derives it,
 * the price and the seats bought, the department that owns it, and whether a later period already continues it. Nothing of
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
  ownerDepartmentId: string;
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
  renewedFromId: string | null;
  /** The period that continues this one, once a renewal recorded it; null while none does. */
  renewedById: string | null;
}

/** The new period the IT Admin records from what the vendor confirmed (`US-11-05` AC-11): a term of the same plan and owner. */
export interface NextPeriodInput {
  previousSubscriptionId: string;
  purchasedQuantity: number;
  unitPrice: { amount: string; currency: string };
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
  | 'NO_OWNER_DEPARTMENT';
