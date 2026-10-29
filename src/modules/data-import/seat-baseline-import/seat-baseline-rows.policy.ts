import {
  hasInvalidCharacters,
  isCompanyAccount,
  looksLikeSecret,
  normalizeAccountIdentifier,
} from '../../../core/account-identifier';
import { isBusinessDate, type BusinessDate } from '../../../core/business-date';
import { occupies, peakOccupancy, type SeatPeriod } from '../../../core/seat-occupancy';
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
  /** By Cost Center code. */
  costCenters: ReadonlyMap<string, { id: string; kind: string; status: string }>;
  companyDomains: readonly string[];
  existing: readonly ExistingAssignment[];
}

const TIME_LIMITED = new Set(['CONTRACTOR', 'FREELANCER', 'INTERN']);
const MASK = '[masked]';
/** Kept where an identifier was not a name at all (spaces, invisible or control characters): what it said is not kept either. */
const MASK_INVALID = '[masked: invalid]';

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
  kind: 'PERSONAL' | 'SERVICE';
  normalizedAccountIdentifier: string;
  period: SeatPeriod;
}

type SeatKind = 'PERSONAL' | 'SERVICE';
type SeatEmployee = NonNullable<ReturnType<SeatFacts['employees']['get']>>;
type OwningUnit = NonNullable<SeatEmployee['owningUnit']>;

/** The day a seat starts, and why the granted date was refused when it was. */
interface SeatStart {
  effectiveFrom: BusinessDate;
  refusal: 'GRANTED_ON_INVALID' | 'GRANTED_ON_IN_FUTURE' | null;
}

/** Where a seat is charged: the Cost Center and the department written with it. */
interface SeatCharge {
  errors: SeatRowErrorCode[];
  costCenterId: string | null;
  owningDepartmentId: string | null;
}

/** The kind the row asks for: an empty kind is a personal seat; a shared account is refused by its own reason. */
function judgeKind(kindText: string): { kind: SeatKind | null; errors: SeatRowErrorCode[] } {
  if (kindText === '' || kindText === 'personal') return { kind: 'PERSONAL', errors: [] };
  if (kindText === 'service') return { kind: 'SERVICE', errors: [] };

  return { kind: null, errors: [kindText === 'shared' ? 'SHARED_ACCOUNT_NOT_SUPPORTED' : 'KIND_INVALID'] };
}

function employeeErrors(employee: SeatEmployee | undefined): SeatRowErrorCode[] {
  if (!employee) return ['EMPLOYEE_NOT_FOUND'];

  return employee.status !== 'ACTIVE' ? ['EMPLOYEE_NOT_ACTIVE'] : [];
}

/** The account identifier: given, not a secret, a name at all, and of the company for a personal seat or an email. */
function identifierErrors(
  identifier: string,
  kind: SeatKind | null,
  companyDomains: readonly string[],
): SeatRowErrorCode[] {
  if (identifier === '') return ['ACCOUNT_IDENTIFIER_MISSING'];
  // A stored row holds the mask where a token was: it is judged again as the token it replaced, so the preview stands.
  if (identifier === MASK) return ['ACCOUNT_IDENTIFIER_LOOKS_LIKE_SECRET'];
  if (identifier === MASK_INVALID) return ['ACCOUNT_IDENTIFIER_INVALID'];
  if (looksLikeSecret(identifier)) return ['ACCOUNT_IDENTIFIER_LOOKS_LIKE_SECRET'];
  if (hasInvalidCharacters(identifier)) return ['ACCOUNT_IDENTIFIER_INVALID'];
  const ofTheCompany = kind !== null && (kind === 'PERSONAL' || identifier.includes('@'));

  return ofTheCompany && !isCompanyAccount(identifier, companyDomains) ? ['NOT_COMPANY_ACCOUNT'] : [];
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

/** The Cost Center the row names, when it names one: it exists, and it is the Unit the account is charged to. */
function namedCostCenterErrors(costCenterCode: string, unit: OwningUnit | null, facts: SeatFacts): SeatRowErrorCode[] {
  if (costCenterCode === '') return [];
  const named = facts.costCenters.get(costCenterCode);
  if (!named) return ['COST_CENTER_NOT_FOUND'];

  return unit && named.id !== unit.costCenter?.id ? ['COST_CENTER_NOT_OWNING_UNIT'] : [];
}

function owningUnitErrors(unit: OwningUnit, facts: SeatFacts): SeatRowErrorCode[] {
  const errors: SeatRowErrorCode[] = [];
  // A department that has no Cost Center in use yet (`QĐ-87d(1)`) has nothing to charge the account to: the same refusal
  // as a Unit that was retired.
  if (!unit.costCenter || unit.costCenter.status !== 'ACTIVE') errors.push('COST_CENTER_INACTIVE');
  // A service account of one department does not sit on the subscription of another (`QĐ-89a`, F20).
  const owner = facts.target.ownerDepartmentId ?? null;
  if (owner !== null && owner !== unit.departmentId) errors.push('SUBSCRIPTION_DEPARTMENT_MISMATCH');

  return errors;
}

/**
 * A service account belongs to the department of the person who answers for it, and is charged to the Unit of that
 * department (`QĐ-86c`); the Cost Center column, when given, can only name that Unit.
 */
function judgeServiceCharge(
  employee: SeatEmployee | undefined,
  reason: string,
  costCenterCode: string,
  facts: SeatFacts,
): SeatCharge {
  const errors: SeatRowErrorCode[] = [];
  if (reason === '') errors.push('REASON_REQUIRED');
  const unit = employee?.owningUnit ?? null;
  if (employee && !unit) errors.push('OWNING_DEPARTMENT_NOT_FOUND');
  errors.push(...namedCostCenterErrors(costCenterCode, unit, facts));
  if (!unit) return { errors, costCenterId: null, owningDepartmentId: null };
  errors.push(...owningUnitErrors(unit, facts));

  return { errors, costCenterId: unit.costCenter?.id ?? null, owningDepartmentId: unit.departmentId };
}

/**
 * A personal seat names no Cost Center. It is written on the subscription of its owner department whatever department
 * the person is in; when they are in another one, closing the baseline opens the review of their own head (F21, `QĐ-89e`).
 */
function judgePersonalCharge(costCenterCode: string, facts: SeatFacts): SeatCharge {
  return {
    errors: costCenterCode !== '' ? ['COST_CENTER_NOT_ALLOWED'] : [],
    costCenterId: null,
    owningDepartmentId: facts.target.ownerDepartmentId ?? null,
  };
}

function judgeCharge(
  kind: SeatKind | null,
  employee: SeatEmployee | undefined,
  cells: SeatCells,
  facts: SeatFacts,
): SeatCharge {
  const costCenterCode = cell(cells, 'cost_center_code');
  if (kind === 'SERVICE') return judgeServiceCharge(employee, cell(cells, 'reason'), costCenterCode, facts);
  if (kind === 'PERSONAL') return judgePersonalCharge(costCenterCode, facts);

  return { errors: [], costCenterId: null, owningDepartmentId: null };
}

/**
 * What one row says, read and checked on its own: the errors it has and, when it has none, what to write. The reasons
 * come in a fixed order: the kind, the person, the account, the dates, then where the seat is charged.
 */
function judgeAlone(cells: SeatCells, facts: SeatFacts): { errors: SeatRowErrorCode[]; parsed: ParsedSeatRow | null } {
  const { kind, errors: kindErrors } = judgeKind(cell(cells, 'kind').toLowerCase());
  const employee = facts.employees.get(cell(cells, 'employee_code'));
  const identifier = cell(cells, 'account_identifier');
  const grantedOn = cell(cells, 'granted_on');
  const start = judgeStart(grantedOn, facts.recordedOn);
  const end = judgeEnd(cell(cells, 'expected_end_date'), start, employee);
  const charge = judgeCharge(kind, employee, cells, facts);
  const errors: SeatRowErrorCode[] = [
    ...kindErrors,
    ...employeeErrors(employee),
    ...identifierErrors(identifier, kind, facts.companyDomains),
    ...startErrors(start, employee),
    ...end.errors,
    ...charge.errors,
  ];

  if (errors.length > 0 || kind === null || !employee) return { errors, parsed: null };
  const reason = cell(cells, 'reason');

  return {
    errors,
    parsed: {
      kind,
      employeeId: employee.id,
      accountIdentifier: identifier,
      reason: reason === '' ? null : reason,
      costCenterId: charge.costCenterId,
      owningDepartmentId: charge.owningDepartmentId,
      effectiveFrom: start.effectiveFrom,
      effectiveFromBasis: grantedOn === '' ? 'RECORDED' : 'ACTUAL',
      expectedEndDate: end.expectedEndDate,
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
