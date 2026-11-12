import type { BusinessDate } from '../../core/business-date';
import type { InAppNotificationCode, InAppParamValue } from '../notifications/public/notifications.types';
import type { AccessState, RevocationSource } from './public/licensing.types';

/**
 * The inbox alerts of the rights (`FR-5.14`, `US-12-15` lines 3, 12, 13, 38; item `a03-license-inbox-alerts`): what each one says
 * and the key that makes it once for a person. Pure: the services find the people and write in their own transaction. A notice
 * carries ids, codes and days only — never an account identifier, a key, a price or the text of a note — and its key is built
 * from the fact it tells, so a pass or a call that runs again tells nobody twice.
 */
export interface LicensingAlert {
  code: InAppNotificationCode;
  subject: { type: string; id: string };
  params: Record<string, InAppParamValue>;
  eventKey: string;
}

/** The sources of a revocation that a person who leaves opens. */
const DEPARTURE_SOURCES: ReadonlySet<RevocationSource> = new Set(['DEPARTURE', 'ABRUPT_DEPARTURE']);

/** The people to tell, each once and in the order given; a missing person (nobody holds the role) is left out, never replaced. */
export function recipientsOf(people: readonly (string | null | undefined)[]): string[] {
  return [...new Set(people.filter((person): person is string => typeof person === 'string' && person !== ''))];
}

/** Keeps the IT Admin only while the person can act as one (role held, account usable): an alert never goes to a lost role. */
export function usableOrNull(itAdminEmployeeId: string | null, usable: ReadonlySet<string>): string | null {
  return itAdminEmployeeId !== null && usable.has(itAdminEmployeeId) ? itAdminEmployeeId : null;
}

/** Line 3: a right ends within seven days; once for each right, end date and person, whichever audience they were told as first. */
export function expiryReminderAlert(input: {
  assignmentId: string;
  holderEmployeeId: string;
  planId: string;
  expectedEndDate: BusinessDate;
  audience: 'EMPLOYEE' | 'HEAD' | 'IT_ADMIN';
}): LicensingAlert {
  return {
    code: 'LICENSE_EXPIRY_REMINDER',
    subject: { type: 'LicenseAssignment', id: input.assignmentId },
    params: {
      assignmentId: input.assignmentId,
      holderEmployeeId: input.holderEmployeeId,
      planId: input.planId,
      expectedEndDate: input.expectedEndDate,
      audience: input.audience,
    },
    eventKey: `LICENSE_EXPIRY_REMINDER:${input.assignmentId}:${input.expectedEndDate}`,
  };
}

/** The window of the renewal of a right opened (`BR-MF1-08a`): told once for the right and its end to each person. */
export function renewalWindowOpenedAlert(input: {
  assignmentId: string;
  holderEmployeeId: string;
  planId: string;
  expectedEndDate: BusinessDate;
  opensOn: BusinessDate;
  audience: 'EMPLOYEE' | 'HEAD';
}): LicensingAlert {
  return {
    code: 'RENEWAL_WINDOW_OPENED',
    subject: { type: 'LicenseAssignment', id: input.assignmentId },
    params: {
      assignmentId: input.assignmentId,
      holderEmployeeId: input.holderEmployeeId,
      planId: input.planId,
      expectedEndDate: input.expectedEndDate,
      opensOn: input.opensOn,
      audience: input.audience,
    },
    eventKey: `RENEWAL_WINDOW_OPENED:${input.assignmentId}:${input.expectedEndDate}:${input.audience}`,
  };
}

/** Line 13, the reminder: the person who answers for service accounts has a file that takes effect on a day; once for the file and day. */
export function serviceAccountDueAlert(
  file: { employeeId: string; fileKind: string; fileId: string; dueOn: BusinessDate },
  accountCount: number,
): LicensingAlert {
  return {
    code: 'SERVICE_ACCOUNT_RESPONSIBLE_DUE',
    subject: { type: 'Employee', id: file.employeeId },
    params: {
      employeeId: file.employeeId,
      fileKind: file.fileKind,
      fileId: file.fileId,
      dueOn: file.dueOn,
      accountCount,
    },
    eventKey: `SERVICE_ACCOUNT_RESPONSIBLE_DUE:${file.fileId}:${file.dueOn}`,
  };
}

/** Line 13, the alert: the day came and the account still has nobody new; once for the account and the day. */
export function serviceAccountOverdueAlert(row: {
  assignmentId: string;
  employeeId: string;
  owningDepartmentId: string | null;
  fileKind: string;
  fileId: string;
  dueOn: BusinessDate;
}): LicensingAlert {
  return {
    code: 'SERVICE_ACCOUNT_RESPONSIBLE_OVERDUE',
    subject: { type: 'LicenseAssignment', id: row.assignmentId },
    // Picked one by one: the row a caller holds also carries the identifier of the account, which no notice may say.
    params: {
      assignmentId: row.assignmentId,
      employeeId: row.employeeId,
      owningDepartmentId: row.owningDepartmentId,
      fileKind: row.fileKind,
      fileId: row.fileId,
      dueOn: row.dueOn,
    },
    eventKey: `SERVICE_ACCOUNT_RESPONSIBLE_OVERDUE:${row.assignmentId}:${row.dueOn}`,
  };
}

/**
 * Line 38: whether a completed revocation leaves a person who leaves with a K1 access until the end of the paid period — the renewal
 * was cancelled with the access left to run, and a departure is among the reasons that asked for it (`QĐ-77l`).
 */
export function leaverKeepsAccess(input: {
  accessState: AccessState | null;
  sources: readonly RevocationSource[];
}): boolean {
  return input.accessState === 'UNTIL_PAID_END' && input.sources.some((source) => DEPARTURE_SOURCES.has(source));
}

/** Line 38: once for the revocation task. */
export function leaverAccessAlert(input: {
  taskId: string;
  assignmentId: string;
  employeeId: string;
  planId: string;
  accessUntil: BusinessDate;
}): LicensingAlert {
  return {
    code: 'LEAVER_K1_ACCESS_RUNS_ON',
    subject: { type: 'ProvisioningTask', id: input.taskId },
    params: {
      taskId: input.taskId,
      assignmentId: input.assignmentId,
      employeeId: input.employeeId,
      planId: input.planId,
      accessUntil: input.accessUntil,
    },
    eventKey: `LEAVER_K1_ACCESS_RUNS_ON:${input.taskId}`,
  };
}
