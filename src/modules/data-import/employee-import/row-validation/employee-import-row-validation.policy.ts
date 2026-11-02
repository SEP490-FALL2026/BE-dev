import { isBusinessDate } from '../../../../core/business-date';
import { normalizeDisplayName } from '../../../../core/display-name';
import { InvalidEmailError, normalizeEmail } from '../../../../core/email';
import {
  PlacementSubject,
  isJobTitleTooLong,
  placementReasons,
} from '../../../organization/public/employee-placement.policy';
import type { EmployeeImportLookupData } from '../../../organization/public/organization.types';
import {
  EMPLOYEE_COLUMNS,
  EmployeeCells,
  EmployeeColumn,
  EmployeeRowOutcome,
  RowDifference,
  RowIssue,
} from '../employee-import-row.types';

/**
 * Without these the file cannot become people (US-02-02 AC-2); the work email and the job title may be left out of the file: the
 * title is optional free text (`QĐ-87e`) and a row without one is a person like any other.
 */
const OPTIONAL_COLUMNS: readonly EmployeeColumn[] = ['work_email', 'job_title'];
const REQUIRED_COLUMNS: readonly EmployeeColumn[] = EMPLOYEE_COLUMNS.filter(
  (column) => !OPTIONAL_COLUMNS.includes(column),
);

/** What each column may be called, folded: no accents, lower case, words joined by `_`. */
const COLUMN_ALIASES: Record<EmployeeColumn, readonly string[]> = {
  employee_code: ['employee_code', 'code', 'ma_nhan_vien', 'ma_nv'],
  full_name: ['full_name', 'name', 'ho_ten', 'ho_va_ten'],
  work_email: ['work_email', 'email', 'email_cong_viec'],
  employment_type: ['employment_type', 'type', 'loai_nhan_su'],
  hire_date: ['hire_date', 'start_date', 'ngay_vao'],
  department_code: ['department_code', 'department', 'ma_phong_ban', 'phong_ban', 'ma_phong'],
  job_title: ['job_title', 'position', 'chuc_vu'],
};

function foldHeader(header: string): string {
  return header
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replaceAll('đ', 'd')
    .replaceAll('Đ', 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export interface MappedColumns {
  indexOf: Partial<Record<EmployeeColumn, number>>;
  /** Required columns the file does not have. */
  missing: EmployeeColumn[];
  /** Headers of the file that no column uses: kept out of the import, reported in the preview. */
  ignored: string[];
}

export function mapEmployeeColumns(header: readonly string[]): MappedColumns {
  const indexOf: Partial<Record<EmployeeColumn, number>> = {};
  const ignored: string[] = [];
  header.forEach((raw, index) => {
    const folded = foldHeader(raw);
    const column = EMPLOYEE_COLUMNS.find((candidate) => COLUMN_ALIASES[candidate].includes(folded));
    if (column === undefined || indexOf[column] !== undefined) ignored.push(raw);
    else indexOf[column] = index;
  });

  return { indexOf, missing: REQUIRED_COLUMNS.filter((column) => indexOf[column] === undefined), ignored };
}

export type EmploymentTypeName = 'STAFF' | 'CONTRACTOR' | 'FREELANCER' | 'INTERN';
const EMPLOYMENT_TYPES: readonly EmploymentTypeName[] = ['STAFF', 'CONTRACTOR', 'FREELANCER', 'INTERN'];

export interface ExistingEmployee {
  id: string;
  employeeCode: string;
  fullName: string;
  workEmail: string | null;
  employmentType: EmploymentTypeName;
  hireDate: string;
  departmentCode: string | null;
  jobTitleName: string | null;
}

/** What the database says about the codes, emails and departments the file names. */
export interface EmployeeImportLookup {
  departments: ReadonlyMap<string, { id: string; active: boolean }>;
  existing: ReadonlyMap<string, ExistingEmployee>;
  /** Normalized work email of an employee ⟹ that employee's code. */
  emailOwners: ReadonlyMap<string, string>;
  /** The record of the person importing: a row naming it is refused, however it compares (`US-02-02` AC-18). */
  own?: { employeeCode: string; normalizedEmail: string | null } | null;
}

export interface ParsedEmployeeRow {
  employeeCode: string;
  fullName: string;
  workEmail: string | null;
  employmentType: EmploymentTypeName;
  hireDate: string;
  departmentCode: string;
  /** The free-text title of the row, or null when the cell is blank. */
  jobTitleName: string | null;
  departmentId: string;
}

export interface EmployeeRowResult {
  outcome: EmployeeRowOutcome;
  errors: RowIssue[];
  differences?: RowDifference[];
  /** Present for a row that will become a person. */
  parsed?: ParsedEmployeeRow;
}

/** Where the preview shows a placement reason (the manual form names a field instead). */
const FILE_COLUMN: Record<PlacementSubject, EmployeeColumn> = {
  DEPARTMENT: 'department_code',
  JOB_TITLE: 'job_title',
};

/** A cell as it is read: its display form — NFC, ends trimmed, inner whitespace runs collapsed. */
export const clean = (value: string | undefined): string => normalizeDisplayName(value ?? '');

/**
 * The key two job titles are compared by when a person that exists is reported as the same or different: the display form
 * in lower case, so case and stray spaces do not matter but accents do. The title itself is free text (`QĐ-87e`).
 */
export const jobTitleKey = (text: string): string => normalizeDisplayName(text).toLowerCase();

/** The cells of a row as they are judged: each in its display form, the employment type in upper case. */
interface RowText {
  code: string;
  fullName: string;
  emailText: string;
  typeText: string;
  hireDate: string;
  departmentCode: string;
  jobTitleText: string;
}

function readRow(cells: EmployeeCells): RowText {
  return {
    code: clean(cells.employee_code).toUpperCase(),
    fullName: clean(cells.full_name),
    emailText: clean(cells.work_email),
    typeText: clean(cells.employment_type).toUpperCase(),
    hireDate: clean(cells.hire_date),
    departmentCode: clean(cells.department_code).toUpperCase(),
    jobTitleText: clean(cells.job_title),
  };
}

/** A row naming the record of the person importing, by code or by work email, is refused (`US-02-02` AC-18). */
function ownRecordIssues(own: EmployeeImportLookup['own'], code: string, normalizedEmail: string | null): RowIssue[] {
  const issues: RowIssue[] = [];
  if (own && code !== '' && code === own.employeeCode) issues.push({ column: 'employee_code', code: 'OWN_RECORD' });
  if (own?.normalizedEmail && normalizedEmail === own.normalizedEmail) {
    issues.push({ column: 'work_email', code: 'OWN_RECORD' });
  }

  return issues;
}

/** The employment type is one of the four, and the hire date a real day. */
function typeAndDateIssues(row: RowText): RowIssue[] {
  const issues: RowIssue[] = [];
  if (!EMPLOYMENT_TYPES.includes(row.typeText as EmploymentTypeName)) {
    issues.push({ column: 'employment_type', code: 'EMPLOYMENT_TYPE_INVALID' });
  }
  if (!isBusinessDate(row.hireDate)) issues.push({ column: 'hire_date', code: 'HIRE_DATE_INVALID' });

  return issues;
}

/** Only a person to create is placed; the placement reasons come after this file's own. */
function placementIssues(row: RowText, department: { id: string; active: boolean } | undefined): RowIssue[] {
  return placementReasons({
    department: { named: row.departmentCode !== '', found: department ?? null },
    jobTitle: { tooLong: isJobTitleTooLong(row.jobTitleText) },
  }).map(({ subject, code }) => ({ column: FILE_COLUMN[subject], code }));
}

/** The person a valid row creates. */
function parsedRow(row: RowText, departmentId: string): ParsedEmployeeRow {
  return {
    employeeCode: row.code,
    fullName: row.fullName,
    workEmail: row.emailText === '' ? null : row.emailText,
    employmentType: row.typeText as EmploymentTypeName,
    hireDate: row.hireDate,
    departmentCode: row.departmentCode,
    jobTitleName: row.jobTitleText === '' ? null : row.jobTitleText,
    departmentId,
  };
}

/**
 * Decides, row by row and in file order, what a row of the people file is: a person to create, a person who is
 * already there (the same, or different, which is only reported), or an error naming the column (`US-02-02`,
 * `US-02-03`). It keeps what it has seen so a second row with the same code or work email is an error and never
 * overwrites the first (AC-8). It reads the database only through the lookup it was given.
 */
export class EmployeeRowClassifier {
  private readonly seenCodes = new Set<string>();
  private readonly seenEmails = new Set<string>();

  constructor(private readonly lookup: EmployeeImportLookup) {}

  /** The reasons come in a fixed order: the code, the name, the work email, the own record, the type and the date. */
  classify(cells: EmployeeCells): EmployeeRowResult {
    const row = readRow(cells);
    const errors = this.codeIssues(row.code);
    const existing = row.code === '' ? undefined : this.lookup.existing.get(row.code);
    if (existing === undefined && row.fullName === '') errors.push({ column: 'full_name', code: 'FULL_NAME_REQUIRED' });
    const email = this.judgeEmail(row.emailText, existing);
    errors.push(
      ...email.issues,
      ...ownRecordIssues(this.lookup.own, row.code, email.normalizedEmail),
      ...typeAndDateIssues(row),
    );

    if (existing !== undefined) {
      if (errors.length > 0) return { outcome: 'ERROR', errors };

      return this.compare(existing, { ...row, normalizedEmail: email.normalizedEmail });
    }

    const department = row.departmentCode === '' ? undefined : this.lookup.departments.get(row.departmentCode);
    errors.push(...placementIssues(row, department));
    if (errors.length > 0 || !department) return { outcome: 'ERROR', errors };

    return { outcome: 'VALID', errors: [], parsed: parsedRow(row, department.id) };
  }

  /** The employee code: given, and once in the file. */
  private codeIssues(code: string): RowIssue[] {
    if (code === '') return [{ column: 'employee_code', code: 'EMPLOYEE_CODE_REQUIRED' }];
    const issues: RowIssue[] = this.seenCodes.has(code)
      ? [{ column: 'employee_code', code: 'EMPLOYEE_CODE_DUPLICATE_IN_FILE' }]
      : [];
    this.seenCodes.add(code);

    return issues;
  }

  /** The work email, when given: an address, once in the file, and for a person to create not someone else's already. */
  private judgeEmail(
    emailText: string,
    existing: ExistingEmployee | undefined,
  ): { normalizedEmail: string | null; issues: RowIssue[] } {
    if (emailText === '') return { normalizedEmail: null, issues: [] };
    const normalizedEmail = safeNormalize(emailText);
    if (normalizedEmail === null) {
      return { normalizedEmail, issues: [{ column: 'work_email', code: 'WORK_EMAIL_INVALID' }] };
    }
    const issues: RowIssue[] = [];
    if (this.seenEmails.has(normalizedEmail)) {
      issues.push({ column: 'work_email', code: 'WORK_EMAIL_DUPLICATE_IN_FILE' });
    } else if (
      existing === undefined &&
      this.lookup.emailOwners.has(normalizedEmail) &&
      normalizedEmail !== this.lookup.own?.normalizedEmail
    ) {
      issues.push({ column: 'work_email', code: 'WORK_EMAIL_TAKEN' });
    }
    this.seenEmails.add(normalizedEmail);

    return { normalizedEmail, issues };
  }

  /** The six columns that are not the key, against the person as they are now (US-02-02 AC-10). */
  private compare(
    existing: ExistingEmployee,
    incoming: {
      fullName: string;
      normalizedEmail: string | null;
      typeText: string;
      hireDate: string;
      departmentCode: string;
      jobTitleText: string;
    },
  ): EmployeeRowResult {
    const differences: RowDifference[] = [];
    const add = (column: EmployeeColumn, current: string, incomingValue: string) =>
      differences.push({ column, current, incoming: incomingValue });

    if (clean(existing.fullName) !== incoming.fullName) add('full_name', existing.fullName, incoming.fullName);
    const currentEmail = existing.workEmail === null ? null : safeNormalize(existing.workEmail);
    if (currentEmail !== incoming.normalizedEmail) {
      add('work_email', existing.workEmail ?? '', incoming.normalizedEmail ?? '');
    }
    if (existing.employmentType !== incoming.typeText)
      add('employment_type', existing.employmentType, incoming.typeText);
    if (existing.hireDate !== incoming.hireDate) add('hire_date', existing.hireDate, incoming.hireDate);
    if ((existing.departmentCode ?? '') !== incoming.departmentCode) {
      add('department_code', existing.departmentCode ?? '', incoming.departmentCode);
    }
    if (jobTitleKey(existing.jobTitleName ?? '') !== jobTitleKey(incoming.jobTitleText)) {
      add('job_title', existing.jobTitleName ?? '', incoming.jobTitleText);
    }

    return differences.length === 0
      ? { outcome: 'EXISTS_SAME', errors: [] }
      : { outcome: 'EXISTS_DIFFERENT', errors: [], differences };
  }
}

function safeNormalize(email: string): string | null {
  try {
    return normalizeEmail(email);
  } catch (error) {
    if (error instanceof InvalidEmailError) return null;
    throw error;
  }
}

// --- judging the rows of a preview, and judging them again --------------------------------------------------------

/** The codes and emails the rows name, each once and without blanks: what to look up for them. */
export function lookupNamesOf(rows: readonly { cells: EmployeeCells }[]): {
  departmentCodes: string[];
  employeeCodes: string[];
  normalizedEmails: string[];
} {
  const cells = rows.map((row) => row.cells);
  const unique = (values: string[]) => [...new Set(values.filter((value) => value !== ''))];

  return {
    departmentCodes: unique(cells.map((cell) => clean(cell.department_code).toUpperCase())),
    employeeCodes: unique(cells.map((cell) => clean(cell.employee_code).toUpperCase())),
    normalizedEmails: unique(cells.map((cell) => safeNormalize(clean(cell.work_email)) ?? '')),
  };
}

/** The lookup the classifier reads, keyed the way it reads it, from what the organization facade answered. */
export function toEmployeeImportLookup(data: EmployeeImportLookupData): EmployeeImportLookup {
  return {
    departments: new Map(data.departments.map((row) => [row.code, row])),
    existing: new Map<string, ExistingEmployee>(data.employees.map((row) => [row.employeeCode, row])),
    emailOwners: new Map(data.emailOwners.map((row) => [row.normalizedEmail, row.employeeCode])),
  };
}

/** Every row judged in file order by one classifier, so a code or email seen twice in the file is caught. */
export function judgeEmployeeRows<Row extends { lineNumber: number; cells: EmployeeCells }>(
  rows: readonly Row[],
  lookup: EmployeeImportLookup,
): ({ lineNumber: number; cells: EmployeeCells } & EmployeeRowResult)[] {
  const classifier = new EmployeeRowClassifier(lookup);

  return rows.map((row) => ({ lineNumber: row.lineNumber, cells: row.cells, ...classifier.classify(row.cells) }));
}

/** The departments the rows judged valid rely on: what the confirmation locks before judging again. */
export function idsUsedByValidRows(
  rows: readonly { outcome: EmployeeRowOutcome; cells: EmployeeCells }[],
  lookup: EmployeeImportLookup,
): { departmentIds: string[] } {
  const departmentIds = new Set<string>();
  for (const row of rows) {
    if (row.outcome !== 'VALID') continue;
    const department = lookup.departments.get(clean(row.cells.department_code));
    if (department) departmentIds.add(department.id);
  }

  return { departmentIds: [...departmentIds] };
}

/** The same text for the same data whatever order the keys came in: PostgreSQL stores `jsonb` with its own key order. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, nested]) => `${JSON.stringify(key)}:${canonical(nested)}`)
      .join(',')}}`;
  }

  return JSON.stringify(value) ?? 'null';
}

/** Whether a row is judged the same way now as in the preview: same outcome, same reasons, same differences. */
export function sameJudgement(
  fresh: { outcome: EmployeeRowOutcome; errors: unknown; differences?: unknown },
  stored: { outcome: EmployeeRowOutcome; errors: unknown; differences: unknown },
): boolean {
  return (
    fresh.outcome === stored.outcome &&
    canonical(fresh.errors) === canonical(stored.errors) &&
    canonical(fresh.differences ?? null) === canonical(stored.differences)
  );
}
