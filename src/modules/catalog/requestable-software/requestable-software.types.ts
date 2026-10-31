import type { ApplicationKind, DataSensitivity } from '../catalog-entry/application.types';
import type { ProvisioningType, SharingPolicy } from '../plan/plan.types';

/** Why a person cannot send a request for software they may still pick: their department has no Cost Center in use yet. */
export type SubmitBlockedReason = 'FINANCE_SETUP_INCOMPLETE';
/** Whether the department of the person can price the plan: never the price itself. */
export type PriceStatus = 'PRICED' | 'MISSING' | 'NOT_APPLICABLE';
/** Why the price is missing, as far as it is known before the term of the request is: the term can still make it too large. */
export type MissingPriceReason = 'NO_PRICED_SUBSCRIPTION' | 'CYCLE_UNKNOWN';

/** The department of the day of the person who picks software, and whether it has a Cost Center in use. */
export interface Submitter {
  departmentId: string;
  hasCostCenter: boolean;
}

/** Whether a request for it can be sent today, and why not. */
export interface Submission {
  canSubmit: boolean;
  submitBlockedReason: SubmitBlockedReason | null;
}

export interface PriceAvailability {
  status: PriceStatus;
  missingReason: MissingPriceReason | null;
}

/** An application a person may ask for, as a row of the list reads it: no owner, cost, contract or seat. */
export interface RequestableApplicationRecord {
  id: string;
  name: string;
  kind: ApplicationKind;
  vendorName: string | null;
  functionalGroup: { id: string; name: string } | null;
  planCount: number;
}

export interface RequestableApplicationDetailRecord extends RequestableApplicationRecord {
  dataSensitivity: DataSensitivity;
}

/** A plan a person may ask for, as a row of the list reads it. */
export interface RequestablePlanRecord {
  id: string;
  name: string;
  provisioningType: ProvisioningType;
  application: { id: string; name: string; kind: ApplicationKind };
}

export interface RequestablePlanDetailRecord extends RequestablePlanRecord {
  vendorName: string | null;
  sharingPolicy: SharingPolicy | null;
  dataLossOnRemoval: boolean;
}

export interface RequestableApplicationFilter {
  search?: string;
  kind?: ApplicationKind;
  functionalGroupId?: string;
  skip: number;
  take: number;
}

export interface RequestablePlanFilter {
  search?: string;
  kind?: ApplicationKind;
  applicationId?: string;
  skip: number;
  take: number;
}

export type RequestableApplicationView = RequestableApplicationRecord & { costsMoney: boolean } & Submission;
export type RequestableApplicationDetailView = RequestableApplicationDetailRecord & {
  costsMoney: boolean;
} & Submission;
export type RequestablePlanView = RequestablePlanRecord & {
  costsMoney: boolean;
  price: PriceAvailability;
} & Submission;
export type RequestablePlanDetailView = RequestablePlanDetailRecord & {
  costsMoney: boolean;
  price: PriceAvailability;
} & Submission;
