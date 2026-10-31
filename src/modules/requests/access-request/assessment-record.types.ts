import type { BusinessDate } from '../../../core/business-date';
import type { Money } from '../../../core/money/money';

/**
 * The record of the assessment the IT Admin gives for software that is not in the catalog (`US-05-06`) and of the quote in it, as
 * the request, the spend check and the approver read them. The rules that judge them are in `assessment/`; what is read lives here
 * so that nothing below `assessment/` has to import it.
 */

export type Classification = 'INTERNAL' | 'PAID_LICENSED';
export type ControlLevelCode = 'FULL' | 'PARTIAL' | 'UNCONTROLLABLE';
export type SensitivityCode = 'LOW' | 'MEDIUM' | 'HIGH';
export type OpinionStatusCode = 'OBTAINED' | 'NOT_AVAILABLE';

/** The fields of the assessment as the IT Admin has filled them so far; anything not given is null. */
export interface AssessmentFields {
  classification: Classification | null;
  vendorName: string | null;
  plannedPlanName: string | null;
  provisioningType: 'K1' | 'K2' | 'K3' | 'K4' | 'K5' | null;
  adminConsole: boolean | null;
  memberExport: boolean | null;
  sso: boolean | null;
  termsSummary: string | null;
  memberUsageMethod: string | null;
  grantRevokeMethod: string | null;
  dataSensitivity: SensitivityCode | null;
  opinionStatus: OpinionStatusCode | null;
  opinionNote: string | null;
  controlLevel: ControlLevelCode | null;
  quote: Quote | null;
}

export type QuoteCycle = 'MONTHLY' | 'QUARTERLY' | 'ANNUAL';
export type QuotePaymentFrequency = 'MONTHLY' | 'QUARTERLY' | 'ANNUAL' | 'UPFRONT_ONCE';

export interface Quote {
  /** The price before tax of one person for one billing cycle. */
  unitPrice: Money;
  billingCycle: QuoteCycle;
  validFrom: BusinessDate;
  validUntil: BusinessDate | null;
  /** How many months the contract binds the company; null when the whole term is paid up front. */
  commitmentMonths: number | null;
  paymentFrequency: QuotePaymentFrequency | null;
  /** The day of the first payment; the day the money is expected to go out when the quote does not say. */
  firstPaymentOn: BusinessDate | null;
}

/** What the Employee declares when the software is not in the catalog (`US-05-06` AC-1). */
export interface ProposalRecord {
  softwareName: string;
  homepageUrl: string;
  purpose: string;
  dataDescription: string;
  expectedUsers: number;
}

/** The assessment as kept: the fields the rules judge and the ones that are only recorded. */
export interface AssessmentRecord extends AssessmentFields {
  status: 'DRAFT' | 'COMPLETED' | 'REJECTED';
  vendorId: string | null;
  equivalentPlanId: string | null;
  proposedBusinessOwnerEmployeeId: string | null;
  controlRiskNote: string | null;
  rejectionKind: 'UNCONTROLLABLE' | 'NOT_ELIGIBLE' | null;
  rejectionReason: string | null;
  alternativePlanId: string | null;
  alternativeNote: string | null;
  rejectedAt: Date | null;
  rejectedByEmployeeId: string | null;
  savedByEmployeeId: string | null;
  completedByEmployeeId: string | null;
  completedAt: Date | null;
  updatedAt: Date;
}
