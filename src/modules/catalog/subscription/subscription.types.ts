import type { BusinessDate } from '../../../core/business-date';

export type SubscriptionKind = 'TERM' | 'PERPETUAL';
export type SubscriptionStatus = 'DRAFT' | 'ACTIVE';
export type BillingCycle = 'MONTHLY' | 'QUARTERLY' | 'ANNUAL' | 'OTHER';
export type PriceRateSource = 'MANUAL' | 'SAME_CURRENCY';
export type NoticeSource = 'DECLARED' | 'INFERRED_UNCONFIRMED' | 'BY_END_DATE' | 'MISSING' | 'NOT_APPLICABLE';
export type MissingItem = 'QUANTITY' | 'START_DATE' | 'BILLING_CYCLE' | 'UNIT_PRICE' | 'EXCHANGE_RATE';
export type SubscriptionWarning = 'NO_ALERT_ANCHOR';
export type PlanPricingModel = 'PER_SEAT' | 'FLAT_RATE' | 'CONCURRENT' | 'CONSUMPTION' | 'PER_HOST';
export type ApplicationKind = 'SAAS' | 'LICENSED' | 'INTERNAL';
export type ProvisioningType = 'K1' | 'K2' | 'K3' | 'K4' | 'K5';

/** The conversion snapshot of the unit price, frozen when the price was recorded (ADR-0007). */
export interface PriceSnapshotRecord {
  rate: bigint;
  rateDate: BusinessDate;
  rateSource: PriceRateSource;
  reportingMinor: bigint;
  reportingCurrency: string;
  exchangeRateId: string | null;
}

export interface UnitPriceRecord {
  amountMinor: bigint;
  currency: string;
  recordedOn: BusinessDate;
}

export interface SubscriptionRecord {
  id: string;
  planId: string;
  planName: string;
  planPricingModel: PlanPricingModel | null;
  /** The department that owns the purchase: always set, and never changed (`QĐ-89a`). */
  ownerDepartmentId: string;
  applicationId: string;
  applicationName: string;
  applicationKind: ApplicationKind;
  vendor: { id: string; name: string };
  kind: SubscriptionKind;
  status: SubscriptionStatus;
  purchasedQuantity: number | null;
  unitPrice: UnitPriceRecord | null;
  priceSnapshot: PriceSnapshotRecord | null;
  billingCycle: BillingCycle | null;
  startDate: BusinessDate | null;
  endDate: BusinessDate | null;
  renewalDate: BusinessDate | null;
  noticeDeadline: BusinessDate | null;
  noticePeriodDays: number | null;
  autoRenew: boolean;
  allowsMidTermReduction: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface NewSubscription {
  organizationId: string;
  planId: string;
  /** Required in the type: the one writer of `subscriptions` never stores a subscription without its owner. */
  ownerDepartmentId: string;
  kind: SubscriptionKind;
  status: SubscriptionStatus;
  purchasedQuantity: number | null;
  unitPrice: UnitPriceRecord | null;
  priceSnapshot: PriceSnapshotRecord | null;
  billingCycle: BillingCycle | null;
  startDate: BusinessDate | null;
  endDate: BusinessDate | null;
  renewalDate: BusinessDate | null;
  noticeDeadline: BusinessDate | null;
  noticePeriodDays: number | null;
  autoRenew: boolean;
  allowsMidTermReduction: boolean;
}

/** What a write stores: the whole mutable state of the subscription, as computed. */
export type SubscriptionState = Omit<NewSubscription, 'organizationId' | 'planId' | 'kind' | 'ownerDepartmentId'>;

export interface SubscriptionListFilter {
  applicationId?: string;
  planId?: string;
  status?: SubscriptionStatus;
  kind?: SubscriptionKind;
  /** Only the subscriptions that have no anchor for an alert: found by the same rule that derives the warning. */
  withoutAlertAnchor?: boolean;
  skip: number;
  take: number;
}

export interface TaxEstimateSummary {
  basis: 'PROFILE' | 'DEFAULT_NO_PROFILE';
  label: 'ESTIMATE' | 'ESTIMATE_NO_PROFILE';
  group: 'T1' | 'T2' | 'T3';
  taxAmount: string;
  deductibleTaxAmount: string;
  nonDeductibleTaxAmount: string;
  estimatedCost: string;
}

/** A subscription as it is answered: the stored data and everything derived from it when it is read. */
export interface SubscriptionView {
  id: string;
  planId: string;
  planName: string;
  ownerDepartmentId: string;
  applicationId: string;
  applicationName: string;
  vendor: { id: string; name: string };
  kind: SubscriptionKind;
  status: SubscriptionStatus;
  missingFinancialData: boolean;
  missing: MissingItem[];
  purchasedQuantity: number | null;
  unitPrice: { amount: string; currency: string } | null;
  priceSnapshot: {
    recordedOn: BusinessDate;
    rate: string;
    rateDate: BusinessDate;
    rateSource: PriceRateSource;
    reportingAmount: string;
    reportingCurrency: string;
    exchangeRateId: string | null;
  } | null;
  billingCycle: BillingCycle | null;
  startDate: BusinessDate | null;
  endDate: BusinessDate | null;
  renewalDate: BusinessDate | null;
  noticePeriodDays: number | null;
  autoRenew: boolean;
  allowsMidTermReduction: boolean;
  noticeDeadline: { value: BusinessDate | null; source: NoticeSource };
  alerts: { baseDate: BusinessDate | null; dates: BusinessDate[] };
  warnings: SubscriptionWarning[];
  taxProfile: { status: 'DECLARED' | 'MISSING'; group: 'T1' | 'T2' | 'T3' | null };
  taxEstimate: TaxEstimateSummary | null;
  createdAt: Date;
  updatedAt: Date;
}
