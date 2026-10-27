import type { BusinessDate } from '../../../core/business-date';
import type { GroundsInput } from '../grounds/grounds.policy';

/**
 * What a notice can be about as it is read: a person going to another department, coming to theirs, a new job title, leaving,
 * leaving suddenly, or long leave. A change of job title is no longer told (`QĐ-87e`): a notice of that kind that already exists
 * is read, rejected and kept as history, and none is sent.
 */
export const NOTICE_KINDS = [
  'DEPARTMENT_TRANSFER_OUT',
  'DEPARTMENT_TRANSFER_IN',
  'JOB_TITLE_CHANGE',
  'DEPARTURE',
  'ABRUPT_DEPARTURE',
  'LONG_LEAVE',
] as const;

export type NoticeKind = (typeof NOTICE_KINDS)[number];

/** The kinds a head can send: all but the retired change of job title (`QĐ-87e`). */
export const SENDABLE_NOTICE_KINDS = [
  'DEPARTMENT_TRANSFER_OUT',
  'DEPARTMENT_TRANSFER_IN',
  'DEPARTURE',
  'ABRUPT_DEPARTURE',
  'LONG_LEAVE',
] as const satisfies readonly NoticeKind[];

export type NoticeStatus = 'PENDING_VERIFICATION' | 'RECORDED' | 'REJECTED' | 'WITHDRAWN';

export const VERIFICATION_METHODS = ['ATTACHED_DOCUMENT', 'EMAIL_FROM_ISSUER', 'DIRECT_CONTACT'] as const;
export type VerificationMethod = (typeof VERIFICATION_METHODS)[number];

/** The kind of official event a notice led to, as the notice names it. */
export type NoticeEventKind = 'DEPARTMENT_TRANSFER' | 'LONG_LEAVE' | 'OFFBOARDING_CASE';

/** The two kinds that move a person to a department and so name the one they go to. */
export const TRANSFER_KINDS: readonly NoticeKind[] = ['DEPARTMENT_TRANSFER_OUT', 'DEPARTMENT_TRANSFER_IN'];

export interface NoticeRecord {
  id: string;
  code: string;
  organizationId: string;
  employeeId: string;
  kind: NoticeKind;
  proposedOn: BusinessDate;
  targetDepartmentId: string | null;
  note: string | null;
  senderEmployeeId: string;
  senderDepartmentId: string;
  status: NoticeStatus;
  rejectReason: string | null;
  recordedEventKind: NoticeEventKind | null;
  recordedEventId: string | null;
  defaultItAdminEmployeeId: string | null;
  dueOn: BusinessDate;
  handledByAppUserId: string | null;
  handledAt: Date | null;
  overdueNoticedAt: Date | null;
  createdAt: Date;
}

/** The row of the list: what identifies the notice and where it stands; no note, no outcome, no verification. */
export interface NoticeSummaryRecord {
  id: string;
  code: string;
  employeeId: string;
  kind: NoticeKind;
  proposedOn: BusinessDate;
  status: NoticeStatus;
  dueOn: BusinessDate;
  createdAt: Date;
}

export interface NoticeVerificationRecord {
  method: VerificationMethod;
  reference: string;
  /** Null only for an event the controlled procedure of the release after this one recorded (spec L.2); this release always writes its account. */
  verifiedByAppUserId: string | null;
  verifiedAt: Date;
}

export interface SendNoticeInput {
  employeeId: string;
  kind: NoticeKind;
  proposedOn: BusinessDate;
  targetDepartmentId?: string | undefined;
  note?: string | undefined;
}

export interface VerificationInput {
  method: VerificationMethod;
  reference: string;
}

/**
 * The event a notice is recorded as, with the fields of every kind optional: the policy says which the notice needs (a transfer
 * a day and, for a job title change, the title; a departure a last working day; a long leave its days) and which it may not carry.
 */
export interface NoticeEventInput {
  toDepartmentId?: string | undefined;
  effectiveOn?: BusinessDate | undefined;
  lastWorkingDay?: BusinessDate | undefined;
  successor?: { kind: 'EMPLOYEE'; employeeId: string } | { kind: 'NONE' } | undefined;
  pendingTransferCancellation?: { reason: string } | undefined;
  startedOn?: BusinessDate | undefined;
  approvedReturnOn?: BusinessDate | undefined;
}

export type NoticeEventField = keyof NoticeEventInput;

export interface RecordNoticeInput {
  verification: VerificationInput;
  grounds?: GroundsInput | undefined;
  event: NoticeEventInput;
}

export interface LinkNoticeInput {
  eventId: string;
  verification: VerificationInput;
}

/** What a recorder made or found: the kind of event and its id. */
export interface NoticeEventRef {
  kind: NoticeEventKind;
  id: string;
}

export interface NoticeListFilter {
  /** Set for a head: only the notices they sent. An IT Admin has none and reads the queue. */
  senderEmployeeId?: string;
  status?: NoticeStatus;
  kind?: NoticeKind;
  employeeId?: string;
  overdue?: boolean;
  /** Only the notices that tell of a sudden departure (the ones the IT Admin is warned of first). */
  priority?: boolean;
  today: BusinessDate;
  page: number;
  pageSize: number;
}
