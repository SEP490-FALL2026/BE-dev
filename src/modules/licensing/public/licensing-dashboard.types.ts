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
