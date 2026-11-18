import type { BusinessDate } from '../../../core/business-date';

/**
 * The columns of a seat baseline file: the first two are required, the others may be left out. `reason` and `cost_center_code` were the
 * columns of a service account (`QĐ-110m`): a file that still has them is read, and the two columns are ignored and named as ignored.
 */
export const SEAT_COLUMNS = ['employee_code', 'account_identifier', 'kind', 'granted_on', 'expected_end_date'] as const;
export type SeatColumn = (typeof SEAT_COLUMNS)[number];
export const REQUIRED_SEAT_COLUMNS: readonly SeatColumn[] = ['employee_code', 'account_identifier'];

/** What a row said, by column, as read; an identifier that looks like a secret is masked before it is kept. */
export type SeatCells = Partial<Record<SeatColumn, string>>;

export type SeatRowOutcome = 'VALID' | 'ERROR';

/** Why a row cannot be written; the codes are the ones the preview shows (`US-02-05`). The list is what the codec of `errors` reads. */
export const SEAT_ROW_ERROR_CODES = [
  'EMPLOYEE_NOT_FOUND',
  'EMPLOYEE_NOT_ACTIVE',
  'KIND_INVALID',
  'SHARED_ACCOUNT_NOT_SUPPORTED',
  'SERVICE_ACCOUNT_NOT_SUPPORTED',
  'ACCOUNT_IDENTIFIER_MISSING',
  'ACCOUNT_IDENTIFIER_INVALID',
  'ACCOUNT_IDENTIFIER_LOOKS_LIKE_SECRET',
  'ACCOUNT_IDENTIFIER_IN_USE',
  'NOT_COMPANY_ACCOUNT',
  'GRANTED_ON_INVALID',
  'GRANTED_ON_IN_FUTURE',
  'EFFECTIVE_BEFORE_HIRE',
  'EXPECTED_END_REQUIRED',
  'EXPECTED_END_INVALID',
  'OVERLAP',
  'SEAT_LIMIT_EXCEEDED',
  'SUBSCRIPTION_DEPARTMENT_MISMATCH',
] as const;
export type SeatRowErrorCode = (typeof SEAT_ROW_ERROR_CODES)[number];

/**
 * Codes the preview wrote into `seat_baseline_import_rows.errors` and stopped writing: the first two on 23/10/2026, when a Cost Center
 * stopped being required of a seat row; the others on 13/11/2026 (`QĐ-110m`), when the import stopped taking a service account and the
 * columns `reason` and `cost_center_code` with it. No migration rewrote the rows already stored, so an old import still reads them: the
 * codec accepts these when it reads and never when it writes.
 */
export const RETIRED_SEAT_ROW_ERROR_CODES = [
  'COST_CENTER_REQUIRED',
  'COST_CENTER_NOT_COMPANY',
  'REASON_REQUIRED',
  'OWNING_DEPARTMENT_NOT_FOUND',
  'COST_CENTER_NOT_FOUND',
  'COST_CENTER_INACTIVE',
  'COST_CENTER_NOT_OWNING_UNIT',
  'COST_CENTER_NOT_ALLOWED',
] as const;
export type RetiredSeatRowErrorCode = (typeof RETIRED_SEAT_ROW_ERROR_CODES)[number];

export interface SeatRowError {
  code: SeatRowErrorCode;
}

/** An error as a stored row keeps it: what the preview writes now, or a code it wrote before it was retired. */
export interface StoredSeatRowError {
  code: SeatRowErrorCode | RetiredSeatRowErrorCode;
}

/** What a valid row asks to be written, with the people and the Cost Center it names already found. */
export interface ParsedSeatRow {
  /** A personal seat: the import takes no service account any more (`QĐ-110m`), so it names no reason and no Cost Center. */
  kind: 'PERSONAL';
  employeeId: string;
  accountIdentifier: string;
  reason: null;
  costCenterId: null;
  /** The department the seat belongs to: the one the person is in on the day of the import (`QĐ-103d`); null when they are in none. */
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
