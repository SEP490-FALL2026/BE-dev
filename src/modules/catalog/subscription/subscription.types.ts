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
export type MissingItem = 'QUANTITY' | 'START_DATE' | 'BILLING_CYCLE' | 'UNIT_PRICE';
export type SubscriptionWarning = 'NO_ALERT_ANCHOR' | 'RESPONSIBLE_MISSING' | 'BILLING_CYCLE_LEGACY' | 'SHOULD_MERGE';
export type PlanPricingModel = 'PER_SEAT' | 'FLAT_RATE' | 'CONCURRENT' | 'CONSUMPTION' | 'PER_HOST';
export type ApplicationKind = 'SAAS' | 'LICENSED' | 'INTERNAL';
export type ProvisioningType = 'K1' | 'K2' | 'K3' | 'K4' | 'K5';
/** How a K4 plan is bound once bought (a copy of the plan capability's type, which this one does not import). */
export type PlanKeyBinding = 'ACCOUNT' | 'DEVICE_KEY' | 'DEVICE_BUNDLED';

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

/** The price a vendor quoted in another currency, kept beside the price in dong so that an invoice can be matched against it (`QĐ-111an`, R-44). */
export interface OriginalPriceRecord {
  amountMinor: bigint;
  currency: string;
}

export interface SubscriptionRecord {
  id: string;
  planId: string;
  planName: string;
  planPricingModel: PlanPricingModel | null;
  /** The kind of the plan and whether it is a `K4` plan with an admin console: which plans need admins at the vendor (`R-53`). */
  planProvisioningType: ProvisioningType;
  planHasAdminConsole: boolean;
  applicationId: string;
  applicationName: string;
  /** The https link to the logo the IT Admin pasted for the application, never checked; null when none is set. */
  applicationLogoUrl: string | null;
  applicationKind: ApplicationKind;
  vendor: { id: string; name: string };
  kind: SubscriptionKind;
  status: SubscriptionStatus;
  purchasedQuantity: number | null;
  unitPrice: UnitPriceRecord | null;
  monthlyUnitPriceMinor: bigint | null;
  priceSnapshot: PriceSnapshotRecord | null;
  originalPrice: OriginalPriceRecord | null;
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
  kind: SubscriptionKind;
  status: SubscriptionStatus;
  purchasedQuantity: number | null;
  unitPrice: UnitPriceRecord | null;
  monthlyUnitPriceMinor?: bigint | null;
  priceSnapshot: PriceSnapshotRecord | null;
  originalPrice: OriginalPriceRecord | null;
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
export type SubscriptionState = Omit<NewSubscription, 'organizationId' | 'planId' | 'kind' | 'renewedFromId'>;

export interface SubscriptionListFilter {
  applicationId?: string;
  planId?: string;
  status?: SubscriptionStatus;
  kind?: SubscriptionKind;
  /** Only the subscriptions that have no anchor for an alert: found by the same rule that derives the warning. */
  withoutAlertAnchor?: boolean;
  /** Only the subscriptions this IT Admin answers for (`QĐ-103v`(4)). */
  responsibleItAdminEmployeeId?: string;
  /** Only these subscriptions: what the filter by expiry found (none when empty). */
  ids?: readonly string[];
  skip: number;
  take: number;
}

/** The filters of a list, before any page: what the subscriptions that are near or past their point of adjustment are found among. */
export type SubscriptionListScope = Omit<SubscriptionListFilter, 'skip' | 'take' | 'ids'>;

export interface TaxEstimateSummary {
  basis: 'PROFILE' | 'DEFAULT_NO_PROFILE';
  label: 'ESTIMATE' | 'ESTIMATE_NO_PROFILE';
  group: 'T1' | 'T2' | 'T3';
  taxAmount: string;
  deductibleTaxAmount: string;
  nonDeductibleTaxAmount: string;
  estimatedCost: string;
}

/** An admin of a plan at the vendor as a subscription answers it. */
export interface VendorAdminView {
  employeeId: string;
  employeeCode: string;
  fullName: string;
  role: 'OWNER' | 'ADMIN';
  working: boolean;
}

/** A subscription as it is answered: the stored data and everything derived from it when it is read. */
export interface SubscriptionView {
  id: string;
  planId: string;
  planName: string;
  applicationId: string;
  applicationName: string;
  logoUrl: string | null;
  vendor: { id: string; name: string };
  kind: SubscriptionKind;
  status: SubscriptionStatus;
  missingFinancialData: boolean;
  missing: MissingItem[];
  purchasedQuantity: number | null;
  unitPrice: { amount: string; currency: string } | null;
  monthlyUnitPrice: { amount: string; currency: string } | null;
  /** The price a vendor quoted in another currency, when one is recorded (`QĐ-111an`): beside the price in dong, never converted again. */
  originalPrice: { amount: string; currency: string } | null;
  billingCycle: BillingCycle | null;
  commitmentTermMonths: CommitmentTermMonths | null;
  startDate: BusinessDate | null;
  endDate: BusinessDate | null;
  renewalDate: BusinessDate | null;
  noticePeriodDays: number | null;
  autoRenew: boolean;
  allowsMidTermReduction: boolean;
  responsibleItAdminEmployeeId: string | null;
  /** Who answers for the subscription, by name; null when none is named. */
  responsibleItAdmin: { employeeId: string; employeeCode: string; fullName: string } | null;
  vendorMinimumSeats: number | null;
  isPrimaryForPlan: boolean;
  /** Near (SOON) or past (EXPIRED) the point of adjustment today (`QĐ-111o`); null before it, for a purchase made once and with no date to count from. */
  expiry: ExpiryState | null;
  /** Days to the deadline the point counts to, negative once it is past; null with no point. */
  daysLeft: number | null;
  deadlineKind: DeadlineKind | null;
  /** The seats of a shared pool of a K2 plan; null for any other kind of plan. */
  seats: { purchased: number | null; assigned: number; free: number | null; inRevocation: number } | null;
  noticeDeadline: { value: BusinessDate | null; source: NoticeSource };
  alerts: { baseDate: BusinessDate | null; dates: BusinessDate[] };
  warnings: SubscriptionWarning[];
  /** The other live subscriptions of the same K2 or K4 plan: set with the warning `SHOULD_MERGE`, empty otherwise (`QĐ-104k`(3)). */
  mergeCandidateIds: string[];
  /** Who administers the plan at the vendor (`QĐ-110k`, `QĐ-110u`): empty for a plan that needs no admins; `working` says whether the person is an IT Admin who works now. */
  vendorAdmins: VendorAdminView[];
  ownerAccountEmail: string | null;
  adminNote: string | null;
  vendorAdminsBelowMinimum: boolean;
  ownerAccountEmailMissing: boolean;
  taxProfile: { status: 'DECLARED' | 'MISSING'; group: 'T1' | 'T2' | 'T3' | null };
  taxEstimate: TaxEstimateSummary | null;
  createdAt: Date;
  updatedAt: Date;
}

/** What the point of adjustment of a subscription counts to: the payment day of a plan by the month, or, by the year, the deadline to cancel, the renewal day or the end day (`QĐ-111o`). */
export type DeadlineKind = 'PAYMENT_DATE' | 'NOTICE_DEADLINE' | 'RENEWAL_DATE' | 'END_DATE';

/** Near (SOON) or past (EXPIRED) the point of adjustment today. */
export type ExpiryState = 'SOON' | 'EXPIRED';
