import type { BusinessDate } from '../../../core/business-date';

/** The columns of a seat baseline file: the first two are required, the others may be left out. */
export const SEAT_COLUMNS = [
  'employee_code',
  'account_identifier',
  'kind',
  'granted_on',
  'expected_end_date',
  'reason',
  'cost_center_code',
] as const;
export type SeatColumn = (typeof SEAT_COLUMNS)[number];
export const REQUIRED_SEAT_COLUMNS: readonly SeatColumn[] = ['employee_code', 'account_identifier'];

/** What a row said, by column, as read; an identifier that looks like a secret is masked before it is kept. */
export type SeatCells = Partial<Record<SeatColumn, string>>;

export type SeatRowOutcome = 'VALID' | 'ERROR';

/** Why a row cannot be written; the codes are the ones the preview shows (`US-02-05`). */
export type SeatRowErrorCode =
  | 'EMPLOYEE_NOT_FOUND'
  | 'EMPLOYEE_NOT_ACTIVE'
  | 'KIND_INVALID'
  | 'SHARED_ACCOUNT_NOT_SUPPORTED'
  | 'ACCOUNT_IDENTIFIER_MISSING'
  | 'ACCOUNT_IDENTIFIER_INVALID'
  | 'ACCOUNT_IDENTIFIER_LOOKS_LIKE_SECRET'
  | 'ACCOUNT_IDENTIFIER_IN_USE'
  | 'NOT_COMPANY_ACCOUNT'
  | 'GRANTED_ON_INVALID'
  | 'GRANTED_ON_IN_FUTURE'
  | 'EFFECTIVE_BEFORE_HIRE'
  | 'EXPECTED_END_REQUIRED'
  | 'EXPECTED_END_INVALID'
  | 'OVERLAP'
  | 'SEAT_LIMIT_EXCEEDED'
  | 'REASON_REQUIRED'
  | 'OWNING_DEPARTMENT_NOT_FOUND'
  | 'COST_CENTER_NOT_FOUND'
  | 'COST_CENTER_INACTIVE'
  | 'COST_CENTER_NOT_OWNING_UNIT'
  | 'COST_CENTER_NOT_ALLOWED'
  | 'SUBSCRIPTION_DEPARTMENT_MISMATCH';

export interface SeatRowError {
  code: SeatRowErrorCode;
}

/** What a valid row asks to be written, with the people and the Cost Center it names already found. */
export interface ParsedSeatRow {
  kind: 'PERSONAL' | 'SERVICE';
  employeeId: string;
  accountIdentifier: string;
  reason: string | null;
  costCenterId: string | null;
  /**
   * The department the seat belongs to: for a service account the department of the responsible person on the day of the import
   * (`QĐ-86c`), for a personal seat the owner of the subscription (`QĐ-89a`); null on an internal plan, which has no owner.
   */
  owningDepartmentId: string | null;
  effectiveFrom: BusinessDate;
  effectiveFromBasis: 'ACTUAL' | 'RECORDED';
  expectedEndDate: BusinessDate | null;
}

export interface SeatRowResult {
  lineNumber: number;
  cells: SeatCells;
  outcome: SeatRowOutcome;
  errors: SeatRowError[];
  parsed?: ParsedSeatRow;
}

export interface SeatImportSummary {
  /** What the seats are for, as it was when the file was uploaded. */
  target: SeatImportTarget;
  totalRows: number;
  valid: number;
  errors: number;
  /** How many rows each error code was found on. */
  byCode: Record<string, number>;
  /** The seats before and after the valid rows, for a subscription; null for an internal plan, which has no seats bought. */
  seats: { purchased: number; occupiedBefore: number; freeBefore: number; freeAfter: number } | null;
  recordedOn: BusinessDate;
}

export interface SeatImportResult {
  created: number;
  errors: number;
  /** Assignments occupying today after the write, and the seats free then; null for an internal plan. */
  occupied: number | null;
  free: number | null;
}

export interface SeatImportTarget {
  kind: 'SUBSCRIPTION' | 'PLAN';
  subscriptionId: string | null;
  planId: string;
  planName: string;
  applicationName: string;
  provisioningType: string;
}

export type SeatImportStatus = 'PREVIEW' | 'COMPLETED' | 'CANCELLED';

export interface SeatImportView {
  id: string;
  fileName: string;
  status: SeatImportStatus;
  previewVersion: number;
  target: SeatImportTarget;
  ignoredColumns: string[];
  summary: SeatImportSummary;
  result: SeatImportResult | null;
  createdAt: Date;
  expiresAt: Date;
  confirmedAt: Date | null;
  cancelledAt: Date | null;
}
