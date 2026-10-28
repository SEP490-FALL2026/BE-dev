import type { EmploymentType } from '../../organization/organization.types';

/** The ten modes of `pnpm ops:record-super-admin-event` (spec L.2), the tenth being the correction of the official fields of the record. */
export const SUPER_ADMIN_EVENT_MODES = [
  'transfer-record',
  'transfer-reschedule',
  'transfer-cancel',
  'leave-start',
  'leave-return',
  'departure-record',
  'departure-change',
  'departure-cancel',
  'abrupt-departure-record',
  'profile-correct',
] as const;

export type SuperAdminEventModeName = (typeof SUPER_ADMIN_EVENT_MODES)[number];

export type SuperAdminEventEnvironment = 'LOCAL_TEST' | 'SHARED';

/** The authoritative document outside the system the event rests on: the same four parts as the basis of an HTTP write. */
export interface EventBasis {
  type: string;
  reference: string;
  issuer: string;
  issuedOn: string;
}

/** What the operator typed for every mode, parsed and trimmed. Nothing in it is a secret. */
export interface SuperAdminEventContext {
  ticketRef: string;
  approvedBy: string;
  operator: string;
  environment: SuperAdminEventEnvironment;
  /** The employee code of the person the event is about: the one who holds the `SUPER_ADMIN` role. */
  subjectCode: string;
  basis: EventBasis;
}

/** Who follows the head of the department a person leaves: an employee, or nobody. */
export type EventSuccessor = { kind: 'EMPLOYEE'; employeeId: string } | { kind: 'NONE' };

export const VERIFICATION_METHODS = ['ATTACHED_DOCUMENT', 'EMAIL_FROM_ISSUER', 'DIRECT_CONTACT'] as const;

/**
 * The `BM-09` the event came from (`--from-notice`): the notice becomes `RECORDED` with the record of how it was checked, written as the
 * path of the application writes it. Without `--verification-method` the check is the document of the basis.
 */
export interface NoticeSource {
  noticeId: string;
  verificationMethod: (typeof VERIFICATION_METHODS)[number];
  /** Left out, the reference of the basis. */
  verificationReference?: string;
}

/** The parameters of each mode: exactly the fields of the body of the HTTP write it stands for. */
export type SuperAdminEventParameters =
  | {
      mode: 'transfer-record';
      toDepartmentId: string;
      effectiveOn: string;
      successor?: EventSuccessor;
      fromNotice?: NoticeSource;
    }
  | {
      mode: 'transfer-reschedule';
      transferId: string;
      newEffectiveOn: string;
      reason: string;
      successor?: EventSuccessor;
    }
  | { mode: 'transfer-cancel'; transferId: string; reason: string }
  | { mode: 'leave-start'; startedOn: string; approvedReturnOn: string; fromNotice?: NoticeSource }
  | { mode: 'leave-return'; leaveId: string; returnedOn: string }
  | {
      mode: 'departure-record';
      lastWorkingDay: string;
      successor?: EventSuccessor;
      cancelTransferReason?: string;
      fromNotice?: NoticeSource;
    }
  | { mode: 'departure-change'; caseId: string; lastWorkingDay: string; reason: string; successor?: EventSuccessor }
  | { mode: 'departure-cancel'; caseId: string; reason: string }
  | {
      mode: 'abrupt-departure-record';
      lastWorkingDay: string;
      successor?: EventSuccessor;
      cancelTransferReason?: string;
      fromNotice?: NoticeSource;
    }
  | ProfileCorrection;

/**
 * The official fields of the record of the Super Admin the command corrects, the same as the correction the application makes of
 * anyone else's record (`US-02-02` AC-19): only what is given changes, `null` clears the work email or the job title. At least one.
 * The department, the status, the account, its roles and the login email are never here.
 */
export interface ProfileCorrection {
  mode: 'profile-correct';
  fullName?: string;
  workEmail?: string | null;
  employmentType?: EmploymentType;
  hireDate?: string;
  jobTitle?: string | null;
}

export interface SuperAdminEventCommand {
  context: SuperAdminEventContext;
  parameters: SuperAdminEventParameters;
}

export type ParsedSuperAdminEventArguments = { help: true } | { help: false; command: SuperAdminEventCommand };

/**
 * What the command answers: the ticket, the mode, whether it wrote the event or found it already written under the same ticket, and
 * the id of the record it created or changed. Never a name, an email, an employee code, a reference of a person, a basis or a reason.
 */
export interface SuperAdminEventResult {
  ticketRef: string;
  mode: SuperAdminEventModeName;
  outcome: 'RECORDED' | 'ALREADY_RECORDED';
  recordId: string;
}
