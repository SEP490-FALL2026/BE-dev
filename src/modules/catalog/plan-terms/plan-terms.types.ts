import type { BusinessDate } from '../../../core/business-date';

export type ProvisioningType = 'K1' | 'K2' | 'K3' | 'K4' | 'K5';
export type SharingPolicy = 'ALLOWED' | 'NOT_ALLOWED';
export type NoticeSource = 'DECLARED' | 'INFERRED_UNCONFIRMED' | 'BY_END_DATE';

/** What IT read in the terms of a plan, as the plan keeps it. Every point is optional. */
export interface TermsRecord {
  planId: string;
  termsUrl: string | null;
  lastReviewedOn: BusinessDate | null;
  aiTraining: string | null;
  dataLocation: string | null;
  installLimitMaxDevices: number | null;
  installLimitNote: string | null;
  commercialUse: string | null;
  cancellationRefund: string | null;
  updatedAt: Date;
}

/** The fields of a `PUT`: the whole terms; what is absent becomes empty. */
export type TermsContent = Omit<TermsRecord, 'planId' | 'updatedAt'>;

export interface OpinionRecord {
  id: string;
  planId: string;
  businessOwnerEmployeeId: string;
  opinion: string;
  recordedByAppUserId: string;
  recordedAt: Date;
}

export interface OpinionView {
  id: string;
  businessOwner: { employeeId: string; employeeCode: string; fullName: string };
  opinion: string;
  recordedBy: string;
  recordedAt: Date;
}

/** An open alert: the terms of a plan need a new review before the deadline of one of its subscriptions. */
export interface ReviewWarning {
  code: 'TERMS_REVIEW_DUE';
  planId: string;
  planName: string;
  applicationId: string;
  applicationName: string;
  subscriptionId: string;
  noticeDeadline: { value: BusinessDate | null; source: NoticeSource };
  baseDate: BusinessDate;
  reviewFrom: BusinessDate;
  lastReviewedOn: BusinessDate | null;
}
