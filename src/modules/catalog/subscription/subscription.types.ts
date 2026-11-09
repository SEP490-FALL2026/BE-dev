import type { BusinessDate } from '../../../core/business-date';

export type SubscriptionKind = 'TERM' | 'PERPETUAL';
export type SubscriptionStatus = 'DRAFT' | 'ACTIVE';
/** What the database can hold; a new write takes only `MONTHLY` and `ANNUAL` (`SUBSCRIPTION.BILLING_CYCLE_UNSUPPORTED`). */
export type BillingCycle = 'MONTHLY' | 'QUARTERLY' | 'ANNUAL' | 'OTHER';
export type DeclarableBillingCycle = 'MONTHLY' | 'ANNUAL';
export type PriceRateSource = 'MANUAL' | 'SAME_CURRENCY';
export type NoticeSource = 'DECLARED' | 'INFERRED_UNCONFIRMED' | 'BY_END_DATE' | 'MISSING' | 'NOT_APPLICABLE';
/** The months a purchase commits to (`QĐ-103e`): a month or a year. */
export type CommitmentTermMonths = 1 | 12;
export type MissingItem = 'QUANTITY' | 'START_DATE' | 'BILLING_CYCLE' | 'UNIT_PRICE' | 'EXCHANGE_RATE';
export type SubscriptionWarning = 'NO_ALERT_ANCHOR' | 'RESPONSIBLE_MISSING' | 'BILLING_CYCLE_LEGACY' | 'SHOULD_MERGE';
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
  /** The department that owns the purchase; **Gói 9: nullable — kho dùng chung không gắn với phòng** (`QĐ-103d`). */
  ownerDepartmentId: string | null;
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
  commitmentTermMonths: CommitmentTermMonths | null;
  startDate: BusinessDate | null;
  endDate: BusinessDate | null;
  renewalDate: BusinessDate | null;
  noticeDeadline: BusinessDate | null;
  noticePeriodDays: number | null;
  autoRenew: boolean;
  allowsMidTermReduction: boolean;
  /** The IT Admin who answers for the subscription (`QĐ-103v`(4)); null for data older than the rule. */
  responsibleItAdminEmployeeId: string | null;
  /** The least number of seats the vendor sells, when it says one (`QĐ-103e`). */
  vendorMinimumSeats: number | null;
  /** The subscription that prices its plan when there are several of it; at most one per plan. */
  isPrimaryForPlan: boolean;
  /** The period this one continues (`QĐ-16`); null for a first period. */
  renewedFromId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface NewSubscription {
  organizationId: string;
  planId: string;
  /** Gói 9: nullable — kho dùng chung không gắn với phòng; khi tạo BE tự chọn */
  ownerDepartmentId: string | null;
  kind: SubscriptionKind;
  status: SubscriptionStatus;
  purchasedQuantity: number | null;
  unitPrice: UnitPriceRecord | null;
  priceSnapshot: PriceSnapshotRecord | null;
  billingCycle: BillingCycle | null;
  commitmentTermMonths: CommitmentTermMonths | null;
  startDate: BusinessDate | null;
  endDate: BusinessDate | null;
  renewalDate: BusinessDate | null;
  noticeDeadline: BusinessDate | null;
  noticePeriodDays: number | null;
  autoRenew: boolean;
  allowsMidTermReduction: boolean;
  responsibleItAdminEmployeeId: string | null;
  vendorMinimumSeats: number | null;
  isPrimaryForPlan: boolean;
  /** Only the period a renewal records names the one it continues; set at insert and never changed. */
  renewedFromId?: string | null;
}

/** What a write stores: the whole mutable state of the subscription, as computed. */
export type SubscriptionState = Omit<
  NewSubscription,
  'organizationId' | 'planId' | 'kind' | 'ownerDepartmentId' | 'renewedFromId'
>;

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
  ownerDepartmentId: string | null; // Gói 9: nullable kho dùng chung
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
  commitmentTermMonths: CommitmentTermMonths | null;
  startDate: BusinessDate | null;
  endDate: BusinessDate | null;
  renewalDate: BusinessDate | null;
  noticePeriodDays: number | null;
  autoRenew: boolean;
  allowsMidTermReduction: boolean;
  responsibleItAdminEmployeeId: string | null;
  vendorMinimumSeats: number | null;
  isPrimaryForPlan: boolean;
  noticeDeadline: { value: BusinessDate | null; source: NoticeSource };
  alerts: { baseDate: BusinessDate | null; dates: BusinessDate[] };
  warnings: SubscriptionWarning[];
  /** The other live subscriptions of the same K2 or K4 plan: set with the warning `SHOULD_MERGE`, empty otherwise (`QĐ-104k`(3)). */
  mergeCandidateIds: string[];
  taxProfile: { status: 'DECLARED' | 'MISSING'; group: 'T1' | 'T2' | 'T3' | null };
  taxEstimate: TaxEstimateSummary | null;
  createdAt: Date;
  updatedAt: Date;
}
