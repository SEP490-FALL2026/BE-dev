/** What the overview of an Employee counts of their own rights and reports (`US-12-15` AC-2). */
export interface EmployeeLicensingFacts {
  /** Rights held on the business day or starting later, as "my software" lists them by default. */
  currentRights: number;
  /** Of those, the rights in force whose expected end day is within the seven days of the reminder. */
  expiringRights: number;
  /** The SaaS error reports the person sent that are not resolved, closed or marked duplicate. */
  openSaasIssues: number;
}

/** What the overview of a head counts of the software of their department (`US-12-15` AC-3): the seats held on the business day. */
export interface DepartmentLicensingFacts {
  seatsInUse: number;
}

/**
 * What the overview of an IT Admin counts of the work in their charge (`US-12-15` AC-4): the open grant and revocation tasks whose IT
 * Admin in charge by default is them, the open SaaS error reports given to them, and the license keys in the vault not assigned yet.
 */
export interface ItAdminLicensingFacts {
  openGrantTasks: number;
  openRevocationTasks: number;
  openSaasIssues: number;
  keysInStore: number;
}

/**
 * What the overviews of an IT Admin and of the Super Admin count of the seats of the shared pools this month (SPEC P21, R5 E6): `returned` are the seats of
 * `K2` plans whose revocation for a departure or a transfer was completed, `reused` the seats of `K2` pools given out again (the grants of the shared stock
 * completed). Seats of a pool are not told apart one by one, so `reused` is the stock handed out in the same time, whatever freed it.
 */
export interface SeatsReturnedFacts {
  returned: number;
  reused: number;
}

/** What a report of the revocations a departure or a transfer asked for reads of one task (SPEC P22): where it stands, the day it was completed, who it was given to. */
export interface RevocationTaskFacts {
  /** The id of the departure or the transfer that asked for it. */
  referenceId: string;
  status: 'QUEUED' | 'RETRY_SCHEDULED' | 'IN_PROGRESS' | 'FAILED' | 'COMPLETED';
  completedOn: string | null;
  /** The IT Admin in charge by default when the task was made. */
  responsibleEmployeeId: string | null;
}
