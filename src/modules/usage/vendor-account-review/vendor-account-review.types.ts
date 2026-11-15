/** Where a difference between what the company has on record and what the vendor shows came from (`SBF-08`, RC-2). */
export type VendorAccountSource = 'NO_ASSIGNMENT' | 'UNMATCHED_IDENTITY' | 'INVOICE_DIFFERENCE' | 'COLLECTOR_UNLISTED';

export type VendorAccountState = 'OPEN' | 'DECIDED';

/** What the IT Admin decides about a difference: it goes through a Request, the access is revoked, it is a false alarm, or it is outside the process. */
export type VendorAccountDecision = 'LEGALIZE_VIA_REQUEST' | 'REVOKE' | 'FALSE_ALARM' | 'OUT_OF_PROCESS';

export type OutOfProcessState = 'OPEN' | 'CLOSED';

/** How a case outside the process ends (R-45): nothing happened, money was spent that has a proof of payment, or only a report with the reason. */
export type OutOfProcessOutcome = 'FALSE_ALARM' | 'RECORD_SPENT' | 'REPORT_ONLY';

/** The two values side by side, as they were when the difference was seen. */
export interface DiscrepancyValues {
  internalValue: string;
  vendorValue: string;
}

export interface DiscrepancyRecord extends DiscrepancyValues {
  id: string;
  organizationId: string;
  source: VendorAccountSource;
  applicationId: string | null;
  vendorId: string | null;
  employeeId: string | null;
  identity: string | null;
  evidenceOn: string;
  firstSeenAt: Date;
  lastSeenAt: Date;
  state: VendorAccountState;
  decision: VendorAccountDecision | null;
  decisionNote: string | null;
  decidedByEmployeeId: string | null;
  decidedAt: Date | null;
  outOfProcessCaseId: string | null;
}

export interface OutOfProcessCaseRecord {
  id: string;
  organizationId: string;
  discrepancyId: string;
  applicationId: string | null;
  vendorId: string | null;
  openedAt: Date;
  state: OutOfProcessState;
  outcome: OutOfProcessOutcome | null;
  note: string | null;
  closedByEmployeeId: string | null;
  closedAt: Date | null;
  amountMinor: bigint | null;
  costCenterId: string | null;
  documentIds: string[];
}

/** A difference as it is written when it is first seen, or seen again (only the day of the evidence moves). */
export interface NewDiscrepancy extends DiscrepancyValues {
  organizationId: string;
  source: VendorAccountSource;
  sourceRef: string;
  applicationId: string | null;
  vendorId: string | null;
  employeeId: string | null;
  identity: string | null;
  evidenceOn: string;
  now: Date;
}

export interface DiscrepancyFilter {
  state?: VendorAccountState;
  source?: VendorAccountSource;
  applicationId?: string;
}

export interface OutOfProcessCaseFilter {
  state?: OutOfProcessState;
  outcome?: OutOfProcessOutcome;
}
