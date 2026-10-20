import {
  hasInvalidCharacters,
  isCompanyAccount,
  looksLikeSecret,
  normalizeAccountIdentifier,
} from '../../../core/account-identifier';
import { isBusinessDate, type BusinessDate } from '../../../core/business-date';
import { occupies, peakOccupancy, type SeatPeriod } from '../../../core/seat-occupancy';
import type { ExistingAssignment } from '../../licensing/licensing.types';
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
  target: { kind: 'SUBSCRIPTION' | 'PLAN'; purchasedQuantity: number | null };
  recordedOn: BusinessDate;
  /** By employee code. */
  employees: ReadonlyMap<string, { id: string; status: string; employmentType: string }>;
  /** By Cost Center code. */
  costCenters: ReadonlyMap<string, { id: string; kind: string; status: string }>;
  companyDomains: readonly string[];
  existing: readonly ExistingAssignment[];
}

const TIME_LIMITED = new Set(['CONTRACTOR', 'FREELANCER', 'INTERN']);
const MASK = '[masked]';

const cell = (cells: SeatCells, column: SeatColumn): string => (cells[column] ?? '').trim();

/** The codes of the people and of the Cost Centers the rows name, to look up in one read each. */
export function lookupNamesOf(rows: readonly { cells: SeatCells }[]): {
  employeeCodes: string[];
  costCenterCodes: string[];
} {
  const employees = new Set<string>();
  const costCenters = new Set<string>();
  for (const { cells } of rows) {
    if (cell(cells, 'employee_code')) employees.add(cell(cells, 'employee_code'));
    if (cell(cells, 'cost_center_code')) costCenters.add(cell(cells, 'cost_center_code'));
  }

  return { employeeCodes: [...employees], costCenterCodes: [...costCenters] };
}

/** The row as it is kept: an identifier that looks like a secret is replaced, so a token is never stored. */
export function maskSecretCells(cells: SeatCells): SeatCells {
  const identifier = cells.account_identifier;

  return identifier !== undefined && looksLikeSecret(identifier) ? { ...cells, account_identifier: MASK } : cells;
}

const periodOf = (assignment: ExistingAssignment): SeatPeriod => ({
  from: assignment.effectiveFrom,
  until: assignment.validUntil,
});
const overlaps = (a: SeatPeriod, b: SeatPeriod): boolean =>
  a.from < (b.until ?? '9999-12-31') && b.from < (a.until ?? '9999-12-31');

interface Accepted {
  employeeId: string;
  kind: 'PERSONAL' | 'SERVICE';
  normalizedAccountIdentifier: string;
  period: SeatPeriod;
}

/** What one row says, read and checked on its own: the errors it has and, when it has none, what to write. */
function judgeAlone(cells: SeatCells, facts: SeatFacts): { errors: SeatRowErrorCode[]; parsed: ParsedSeatRow | null } {
  const errors: SeatRowErrorCode[] = [];
  const kindText = cell(cells, 'kind').toLowerCase();
  let kind: 'PERSONAL' | 'SERVICE' | null = null;
  if (kindText === '' || kindText === 'personal') kind = 'PERSONAL';
  else if (kindText === 'service') kind = 'SERVICE';
  else if (kindText === 'shared') errors.push('SHARED_ACCOUNT_NOT_SUPPORTED');
  else errors.push('KIND_INVALID');

  const employee = facts.employees.get(cell(cells, 'employee_code'));
  if (!employee) errors.push('EMPLOYEE_NOT_FOUND');
  else if (employee.status !== 'ACTIVE') errors.push('EMPLOYEE_NOT_ACTIVE');

  const identifier = cell(cells, 'account_identifier');
  if (identifier === '') errors.push('ACCOUNT_IDENTIFIER_MISSING');
  else if (hasInvalidCharacters(identifier)) errors.push('ACCOUNT_IDENTIFIER_INVALID');
  else if (looksLikeSecret(identifier)) errors.push('ACCOUNT_IDENTIFIER_LOOKS_LIKE_SECRET');
  else if (kind !== null && (kind === 'PERSONAL' || identifier.includes('@'))) {
    if (!isCompanyAccount(identifier, facts.companyDomains)) errors.push('NOT_COMPANY_ACCOUNT');
  }

  const grantedOn = cell(cells, 'granted_on');
  let effectiveFrom: BusinessDate = facts.recordedOn;
  if (grantedOn !== '') {
    if (!isBusinessDate(grantedOn)) errors.push('GRANTED_ON_INVALID');
    else if (grantedOn > facts.recordedOn) errors.push('GRANTED_ON_IN_FUTURE');
    else effectiveFrom = grantedOn;
  }

  const endText = cell(cells, 'expected_end_date');
  let expectedEndDate: BusinessDate | null = null;
  if (endText !== '') {
    if (!isBusinessDate(endText) || (!errors.includes('GRANTED_ON_INVALID') && endText < effectiveFrom)) {
      errors.push('EXPECTED_END_INVALID');
    } else {
      expectedEndDate = endText;
    }
  } else if (employee && TIME_LIMITED.has(employee.employmentType)) {
    errors.push('EXPECTED_END_REQUIRED');
  }

  const reason = cell(cells, 'reason');
  const costCenterCode = cell(cells, 'cost_center_code');
  let costCenterId: string | null = null;
  if (kind === 'SERVICE') {
    if (reason === '') errors.push('REASON_REQUIRED');
    if (costCenterCode === '') {
      errors.push('COST_CENTER_REQUIRED');
    } else {
      const costCenter = facts.costCenters.get(costCenterCode);
      if (!costCenter) errors.push('COST_CENTER_NOT_FOUND');
      else if (costCenter.status !== 'ACTIVE') errors.push('COST_CENTER_INACTIVE');
      else if (costCenter.kind !== 'COMPANY') errors.push('COST_CENTER_NOT_COMPANY');
      else costCenterId = costCenter.id;
    }
  } else if (kind === 'PERSONAL' && costCenterCode !== '') {
    errors.push('COST_CENTER_NOT_ALLOWED');
  }

  if (errors.length > 0 || kind === null || !employee) return { errors, parsed: null };

  return {
    errors,
    parsed: {
      kind,
      employeeId: employee.id,
      accountIdentifier: identifier,
      reason: reason === '' ? null : reason,
      costCenterId,
      effectiveFrom,
      effectiveFromBasis: grantedOn === '' ? 'RECORDED' : 'ACTUAL',
      expectedEndDate,
    },
  };
}

/**
 * Judges the rows of a seat baseline file against the data as it is (`US-02-05`), in the order of the file: each row on
 * its own first (the person, the account, the dates, the time-limited staff, the service account), then, for a row that
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
    kind: assignment.kind,
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
        parsed.kind === 'PERSONAL' &&
        accepted.some(
          (other) =>
            other.kind === 'PERSONAL' && other.employeeId === parsed.employeeId && overlaps(other.period, period),
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
          kind: parsed.kind,
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
