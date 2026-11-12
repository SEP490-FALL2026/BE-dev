import {
  hasInvalidCharacters,
  isCompanyAccount,
  looksLikeSecret,
  normalizeAccountIdentifier,
} from '../../licensing/public/account-identifier.policy';
import { isBusinessDate, type BusinessDate } from '../../../core/business-date';
import { occupies, peakOccupancy, type SeatPeriod } from './seat-occupancy.policy';
import type { ExistingAssignment } from '../../licensing/public/licensing.types';
import {
  REQUIRED_SEAT_COLUMNS,
  SEAT_COLUMNS,
  type ParsedSeatRow,
  type SeatCells,
  type SeatColumn,
  type SeatRowError,
  type SeatRowErrorCode,
  type SeatRowResult,
} from './seat-baseline-import.types';

/** A header as it is compared: lower case, with every run of other characters one underscore (`Employee Code`). */
const foldHeader = (raw: string): string =>
  raw
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

export interface MappedSeatColumns {
  indexOf: Partial<Record<SeatColumn, number>>;
  missing: SeatColumn[];
  /** Headers of the file that no column uses, or that repeat a column: kept out of the import, reported in the preview. */
  ignored: string[];
}

export function mapSeatColumns(header: readonly string[]): MappedSeatColumns {
  const indexOf: Partial<Record<SeatColumn, number>> = {};
  const ignored: string[] = [];
  header.forEach((raw, index) => {
    const folded = foldHeader(raw);
    const column = SEAT_COLUMNS.find((candidate) => candidate === folded);
    if (column === undefined || indexOf[column] !== undefined) ignored.push(raw);
    else indexOf[column] = index;
  });

  return { indexOf, missing: REQUIRED_SEAT_COLUMNS.filter((column) => indexOf[column] === undefined), ignored };
}

/** What the database says about the people and the Cost Centers the file names, and about the seats already kept. */
export interface SeatFacts {
  target: {
    kind: 'SUBSCRIPTION' | 'PLAN';
    purchasedQuantity: number | null;
    /** The department that owns the subscription (`QĐ-89a`); null only for an internal plan, which has no subscription. */
    ownerDepartmentId?: string | null;
  };
  recordedOn: BusinessDate;
  /** By employee code. */
  employees: ReadonlyMap<
    string,
    {
      id: string;
      status: string;
      employmentType: string;
      hireDate: BusinessDate;
      /** The department the person is in on `recordedOn` and its Unit; null when they are in none. */
      owningUnit?: { departmentId: string; costCenter: { id: string; code: string; status: string } | null } | null;
    }
  >;
  companyDomains: readonly string[];
  existing: readonly ExistingAssignment[];
}

const TIME_LIMITED = new Set(['CONTRACTOR', 'FREELANCER', 'INTERN']);
const MASK = '[masked]';
/** Kept where an identifier was not a name at all (spaces, invisible or control characters): what it said is not kept either. */
const MASK_INVALID = '[masked: invalid]';

const cell = (cells: SeatCells, column: SeatColumn): string => (cells[column] ?? '').trim();

/** The codes of the people the rows name, to look up in one read. */
export function lookupNamesOf(rows: readonly { cells: SeatCells }[]): { employeeCodes: string[] } {
  const employees = new Set<string>();
  for (const { cells } of rows) {
    if (cell(cells, 'employee_code')) employees.add(cell(cells, 'employee_code').toUpperCase());
  }

  return { employeeCodes: [...employees] };
}

/**
 * The row as it is kept: an identifier that any check flags is replaced, so a token is never stored (`SEC-03`). What looks
 * like a secret, with its spaces and invisible characters taken out, is masked as one; what is not a name at all is masked as
 * invalid, because a secret of a shape nobody knows looks just like that.
 */
export function maskSecretCells(cells: SeatCells): SeatCells {
  const identifier = cells.account_identifier;
  if (identifier === undefined) return cells;
  if (looksLikeSecret(identifier)) return { ...cells, account_identifier: MASK };
  if (hasInvalidCharacters(identifier.trim())) return { ...cells, account_identifier: MASK_INVALID };

  return cells;
}

const periodOf = (assignment: ExistingAssignment): SeatPeriod => ({
  from: assignment.effectiveFrom,
  until: assignment.validUntil,
});
const overlaps = (a: SeatPeriod, b: SeatPeriod): boolean =>
  a.from < (b.until ?? '9999-12-31') && b.from < (a.until ?? '9999-12-31');

interface Accepted {
  employeeId: string;
  /** Counts for INV-02: a personal seat that is not flagged as a machine account (`R-9`). A row of a file is always one. */
  personal: boolean;
  normalizedAccountIdentifier: string;
  period: SeatPeriod;
}

type SeatEmployee = NonNullable<ReturnType<SeatFacts['employees']['get']>>;

/** The day a seat starts, and why the granted date was refused when it was. */
interface SeatStart {
  effectiveFrom: BusinessDate;
  refusal: 'GRANTED_ON_INVALID' | 'GRANTED_ON_IN_FUTURE' | null;
}

/**
 * The kind the row asks for: an empty kind is a personal seat; a shared account and a service account are refused by their own reasons
 * (`QĐ-110m`: the seat of an IT Admin used for a machine account is flagged after it is granted, never written by the import).
 */
function judgeKind(kindText: string): SeatRowErrorCode[] {
  if (kindText === '' || kindText === 'personal') return [];
  if (kindText === 'service') return ['SERVICE_ACCOUNT_NOT_SUPPORTED'];

  return [kindText === 'shared' ? 'SHARED_ACCOUNT_NOT_SUPPORTED' : 'KIND_INVALID'];
}

function employeeErrors(employee: SeatEmployee | undefined): SeatRowErrorCode[] {
  if (!employee) return ['EMPLOYEE_NOT_FOUND'];

  return employee.status !== 'ACTIVE' ? ['EMPLOYEE_NOT_ACTIVE'] : [];
}

/**
 * The account identifier: given, not a secret, a name at all, and of the company (`companyChecked` is false for a row refused for its kind,
 * which is not asked to be a personal seat's account).
 */
function identifierErrors(
  identifier: string,
  companyDomains: readonly string[],
  companyChecked: boolean,
): SeatRowErrorCode[] {
  if (identifier === '') return ['ACCOUNT_IDENTIFIER_MISSING'];
  // A stored row holds the mask where a token was: it is judged again as the token it replaced, so the preview stands.
  if (identifier === MASK) return ['ACCOUNT_IDENTIFIER_LOOKS_LIKE_SECRET'];
  if (identifier === MASK_INVALID) return ['ACCOUNT_IDENTIFIER_INVALID'];
  if (looksLikeSecret(identifier)) return ['ACCOUNT_IDENTIFIER_LOOKS_LIKE_SECRET'];
  if (hasInvalidCharacters(identifier)) return ['ACCOUNT_IDENTIFIER_INVALID'];

  return companyChecked && !isCompanyAccount(identifier, companyDomains) ? ['NOT_COMPANY_ACCOUNT'] : [];
}

/** The granted date when it is a real day not after the record date; without one, the record date. */
function judgeStart(grantedOn: string, recordedOn: BusinessDate): SeatStart {
  if (grantedOn === '') return { effectiveFrom: recordedOn, refusal: null };
  if (!isBusinessDate(grantedOn)) return { effectiveFrom: recordedOn, refusal: 'GRANTED_ON_INVALID' };
  if (grantedOn > recordedOn) return { effectiveFrom: recordedOn, refusal: 'GRANTED_ON_IN_FUTURE' };

  return { effectiveFrom: grantedOn, refusal: null };
}

/** A seat never starts before the person does (US-02-02 AC-15); a date already refused is not judged a second time. */
function startErrors(start: SeatStart, employee: SeatEmployee | undefined): SeatRowErrorCode[] {
  if (start.refusal !== null) return [start.refusal];

  return employee && start.effectiveFrom < employee.hireDate ? ['EFFECTIVE_BEFORE_HIRE'] : [];
}

/** The expected end: a real day not before the start, and required for the time-limited staff. */
function judgeEnd(
  endText: string,
  start: SeatStart,
  employee: SeatEmployee | undefined,
): { expectedEndDate: BusinessDate | null; errors: SeatRowErrorCode[] } {
  if (endText === '') {
    const required = employee && TIME_LIMITED.has(employee.employmentType);
    return { expectedEndDate: null, errors: required ? ['EXPECTED_END_REQUIRED'] : [] };
  }
  if (!isBusinessDate(endText) || (start.refusal !== 'GRANTED_ON_INVALID' && endText < start.effectiveFrom)) {
    return { expectedEndDate: null, errors: ['EXPECTED_END_INVALID'] };
  }

  return { expectedEndDate: endText, errors: [] };
}

/**
 * What one row says, read and checked on its own: the errors it has and, when it has none, what to write. The reasons
 * come in a fixed order: the kind, the person, the account, the dates, then where the seat is charged.
 */
function judgeAlone(cells: SeatCells, facts: SeatFacts): { errors: SeatRowErrorCode[]; parsed: ParsedSeatRow | null } {
  const kindErrors = judgeKind(cell(cells, 'kind').toLowerCase());
  const employee = facts.employees.get(cell(cells, 'employee_code').toUpperCase());
  const identifier = cell(cells, 'account_identifier');
  const grantedOn = cell(cells, 'granted_on');
  const start = judgeStart(grantedOn, facts.recordedOn);
  const end = judgeEnd(cell(cells, 'expected_end_date'), start, employee);
  const errors: SeatRowErrorCode[] = [
    ...kindErrors,
    ...employeeErrors(employee),
    ...identifierErrors(identifier, facts.companyDomains, kindErrors.length === 0),
    ...startErrors(start, employee),
    ...end.errors,
  ];

  if (errors.length > 0 || !employee) return { errors, parsed: null };

  return {
    errors,
    parsed: {
      kind: 'PERSONAL',
      employeeId: employee.id,
      accountIdentifier: identifier,
      reason: null,
      costCenterId: null,
      // The department the person is in on the day of the import, whoever owns the subscription: the pool of seats is every department's.
      owningDepartmentId: employee.owningUnit?.departmentId ?? null,
      effectiveFrom: start.effectiveFrom,
      effectiveFromBasis: grantedOn === '' ? 'RECORDED' : 'ACTUAL',
      expectedEndDate: end.expectedEndDate,
    },
  };
}

/**
 * Judges the rows of a seat baseline file against the data as it is (`US-02-05`), in the order of the file: each row on
 * its own first (the person, the account, the dates, the time-limited staff), then, for a row that
 * is right in itself, against the seats already kept and the rows accepted before it: one person once at a time
 * (`INV-02`), one account identifier at a time, and for a subscription the seats bought (`INV-01`), counted on the days
 * the seats start as the database does. A row that is wrong takes no seat. Pure: the preview and the confirmation judge
 * with this one function, so they cannot disagree about the rules.
 */
export function judgeSeatRows(
  rows: readonly { lineNumber: number; cells: SeatCells }[],
  facts: SeatFacts,
): SeatRowResult[] {
  const accepted: Accepted[] = facts.existing.map((assignment) => ({
    employeeId: assignment.employeeId,
    personal: assignment.kind === 'PERSONAL' && !assignment.isMachineAccount,
    normalizedAccountIdentifier: assignment.normalizedAccountIdentifier,
    period: periodOf(assignment),
  }));
  const seats = facts.target.kind === 'SUBSCRIPTION' ? facts.target.purchasedQuantity : null;

  return rows.map(({ lineNumber, cells }) => {
    const alone = judgeAlone(cells, facts);
    const errors: SeatRowErrorCode[] = [...alone.errors];
    const parsed = alone.parsed;

    if (parsed) {
      const period: SeatPeriod = { from: parsed.effectiveFrom, until: null };
      const normalized = normalizeAccountIdentifier(parsed.accountIdentifier);
      if (
        accepted.some((other) => other.normalizedAccountIdentifier === normalized && overlaps(other.period, period))
      ) {
        errors.push('ACCOUNT_IDENTIFIER_IN_USE');
      }
      if (
        accepted.some(
          (other) => other.personal && other.employeeId === parsed.employeeId && overlaps(other.period, period),
        )
      ) {
        errors.push('OVERLAP');
      }
      if (seats !== null && peakOccupancy([...accepted.map((other) => other.period), period], period) > seats) {
        errors.push('SEAT_LIMIT_EXCEEDED');
      }
      if (errors.length === 0) {
        accepted.push({
          employeeId: parsed.employeeId,
          personal: true,
          normalizedAccountIdentifier: normalized,
          period,
        });
      }
    }

    const result: SeatRowResult = {
      lineNumber,
      cells: maskSecretCells(cells),
      outcome: errors.length === 0 ? 'VALID' : 'ERROR',
      errors: errors.map((code): SeatRowError => ({ code })),
    };
    if (errors.length === 0 && parsed) result.parsed = parsed;

    return result;
  });
}

/** How many of the periods occupy `day`: the seats taken then. */
export function occupiedOn(periods: readonly SeatPeriod[], day: BusinessDate): number {
  return periods.filter((period) => occupies(period, day)).length;
}

/** Whether two judgements of a row are the same: the outcome and the set of error codes. */
export function sameJudgement(
  a: { outcome: string; errors: readonly { code: string }[] },
  b: { outcome: string; errors: readonly { code: string }[] },
): boolean {
  const codes = (judgement: { errors: readonly { code: string }[] }) =>
    judgement.errors
      .map((error) => error.code)
      .sort()
      .join(',');

  return a.outcome === b.outcome && codes(a) === codes(b);
}
