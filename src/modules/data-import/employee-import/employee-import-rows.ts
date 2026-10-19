import { isBusinessDate } from '../../../core/business-date';
import { normalizeDisplayName } from '../../../core/display-name';
import { InvalidEmailError, normalizeEmail } from '../../../core/email';
import type { EmployeeImportLookupData } from '../../organization/organization.types';

export const EMPLOYEE_COLUMNS = [
  'employee_code',
  'full_name',
  'work_email',
  'employment_type',
  'hire_date',
  'department_code',
  'job_title',
] as const;
export type EmployeeColumn = (typeof EMPLOYEE_COLUMNS)[number];

/** Without these the file cannot become people (US-02-02 AC-2); the work email may be left out of the file. */
const REQUIRED_COLUMNS: readonly EmployeeColumn[] = EMPLOYEE_COLUMNS.filter((column) => column !== 'work_email');

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

/** What the database says about the codes, emails, departments and job titles the file names. */
export interface EmployeeImportLookup {
  departments: ReadonlyMap<string, { id: string; active: boolean; costCenterActive: boolean }>;
  /** Keyed by the normalized name of the job title. */
  jobTitles: ReadonlyMap<string, { id: string; name: string; status: 'ACTIVE' | 'INACTIVE' }>;
  existing: ReadonlyMap<string, ExistingEmployee>;
  /** Normalized work email of an employee ⟹ that employee's code. */
  emailOwners: ReadonlyMap<string, string>;
}

export interface ParsedEmployeeRow {
  employeeCode: string;
  fullName: string;
  workEmail: string | null;
  employmentType: EmploymentTypeName;
  hireDate: string;
  departmentCode: string;
  jobTitleName: string;
  departmentId: string;
  jobTitleId: string;
}

export type EmployeeRowOutcome = 'VALID' | 'ERROR' | 'EXISTS_SAME' | 'EXISTS_DIFFERENT';

export interface RowIssue {
  column: EmployeeColumn;
  code: string;
}

export interface RowDifference {
  column: EmployeeColumn;
  current: string;
  incoming: string;
}

export interface EmployeeRowResult {
  outcome: EmployeeRowOutcome;
  errors: RowIssue[];
  differences?: RowDifference[];
  /** Present for a row that will become a person. */
  parsed?: ParsedEmployeeRow;
}

/** The cells of one row of the file, by the column they were read into. */
export type EmployeeCells = Partial<Record<EmployeeColumn, string>>;

/** A cell as it is read: its display form (T-12) — NFC, ends trimmed, inner whitespace runs collapsed. */
export const clean = (value: string | undefined): string => normalizeDisplayName(value ?? '');

/**
 * The key a job title is looked up and compared by: the display form in lower case, the same rule as the
 * catalogue's stored `normalized_name` (T-12, US-02-07 AC-2), so case and stray spaces do not matter but accents do.
 */
export const jobTitleKey = (text: string): string => normalizeDisplayName(text).toLowerCase();

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

  classify(cells: EmployeeCells): EmployeeRowResult {
    const errors: RowIssue[] = [];
    const code = clean(cells.employee_code);
    const fullName = clean(cells.full_name);
    const emailText = clean(cells.work_email);
    const typeText = clean(cells.employment_type).toUpperCase();
    const hireDate = clean(cells.hire_date);
    const departmentCode = clean(cells.department_code);
    const jobTitleText = clean(cells.job_title);

    if (code === '') errors.push({ column: 'employee_code', code: 'EMPLOYEE_CODE_REQUIRED' });
    else if (this.seenCodes.has(code))
      errors.push({ column: 'employee_code', code: 'EMPLOYEE_CODE_DUPLICATE_IN_FILE' });
    if (code !== '') this.seenCodes.add(code);

    const existing = code === '' ? undefined : this.lookup.existing.get(code);
    if (existing === undefined && fullName === '') errors.push({ column: 'full_name', code: 'FULL_NAME_REQUIRED' });

    let normalizedEmail: string | null = null;
    if (emailText !== '') {
      try {
        normalizedEmail = normalizeEmail(emailText);
      } catch (error) {
        if (!(error instanceof InvalidEmailError)) throw error;
        errors.push({ column: 'work_email', code: 'WORK_EMAIL_INVALID' });
      }
      if (normalizedEmail !== null) {
        if (this.seenEmails.has(normalizedEmail)) {
          errors.push({ column: 'work_email', code: 'WORK_EMAIL_DUPLICATE_IN_FILE' });
        } else if (existing === undefined && this.lookup.emailOwners.has(normalizedEmail)) {
          errors.push({ column: 'work_email', code: 'WORK_EMAIL_TAKEN' });
        }
        this.seenEmails.add(normalizedEmail);
      }
    }

    if (!EMPLOYMENT_TYPES.includes(typeText as EmploymentTypeName)) {
      errors.push({ column: 'employment_type', code: 'EMPLOYMENT_TYPE_INVALID' });
    }
    if (!isBusinessDate(hireDate)) errors.push({ column: 'hire_date', code: 'HIRE_DATE_INVALID' });

    if (existing !== undefined) {
      if (errors.length > 0) return { outcome: 'ERROR', errors };

      return this.compare(existing, { fullName, normalizedEmail, typeText, hireDate, departmentCode, jobTitleText });
    }

    const department = departmentCode === '' ? undefined : this.lookup.departments.get(departmentCode);
    if (departmentCode === '') errors.push({ column: 'department_code', code: 'DEPARTMENT_REQUIRED' });
    else if (!department) errors.push({ column: 'department_code', code: 'DEPARTMENT_NOT_FOUND' });
    else if (!department.active) errors.push({ column: 'department_code', code: 'DEPARTMENT_INACTIVE' });
    else if (!department.costCenterActive) {
      errors.push({ column: 'department_code', code: 'DEPARTMENT_COST_CENTER_INACTIVE' });
    }

    const jobTitle = jobTitleText === '' ? undefined : this.lookup.jobTitles.get(jobTitleKey(jobTitleText));
    if (jobTitleText === '') errors.push({ column: 'job_title', code: 'JOB_TITLE_REQUIRED' });
    else if (!jobTitle) errors.push({ column: 'job_title', code: 'JOB_TITLE_NOT_FOUND' });
    else if (jobTitle.status === 'INACTIVE') errors.push({ column: 'job_title', code: 'JOB_TITLE_INACTIVE' });

    if (errors.length > 0 || !department || !jobTitle) return { outcome: 'ERROR', errors };

    return {
      outcome: 'VALID',
      errors: [],
      parsed: {
        employeeCode: code,
        fullName,
        workEmail: emailText === '' ? null : emailText,
        employmentType: typeText as EmploymentTypeName,
        hireDate,
        departmentCode,
        jobTitleName: jobTitle.name,
        departmentId: department.id,
        jobTitleId: jobTitle.id,
      },
    };
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

/** The codes, job title keys and emails the rows name, each once and without blanks: what to look up for them. */
export function lookupNamesOf(rows: readonly { cells: EmployeeCells }[]): {
  departmentCodes: string[];
  normalizedJobTitleNames: string[];
  employeeCodes: string[];
  normalizedEmails: string[];
} {
  const cells = rows.map((row) => row.cells);
  const unique = (values: string[]) => [...new Set(values.filter((value) => value !== ''))];

  return {
    departmentCodes: unique(cells.map((cell) => clean(cell.department_code))),
    normalizedJobTitleNames: unique(cells.map((cell) => jobTitleKey(clean(cell.job_title)))),
    employeeCodes: unique(cells.map((cell) => clean(cell.employee_code))),
    normalizedEmails: unique(cells.map((cell) => safeNormalize(clean(cell.work_email)) ?? '')),
  };
}

/** The lookup the classifier reads, keyed the way it reads it, from what the organization facade answered. */
export function toEmployeeImportLookup(data: EmployeeImportLookupData): EmployeeImportLookup {
  return {
    departments: new Map(data.departments.map((row) => [row.code, row])),
    jobTitles: new Map(data.jobTitles.map((row) => [row.normalizedName, row])),
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

/** The departments and job titles the rows judged valid rely on: what the confirmation locks before judging again. */
export function idsUsedByValidRows(
  rows: readonly { outcome: EmployeeRowOutcome; cells: EmployeeCells }[],
  lookup: EmployeeImportLookup,
): { departmentIds: string[]; jobTitleIds: string[] } {
  const departmentIds = new Set<string>();
  const jobTitleIds = new Set<string>();
  for (const row of rows) {
    if (row.outcome !== 'VALID') continue;
    const department = lookup.departments.get(clean(row.cells.department_code));
    const title = lookup.jobTitles.get(jobTitleKey(clean(row.cells.job_title)));
    if (department) departmentIds.add(department.id);
    if (title) jobTitleIds.add(title.id);
  }

  return { departmentIds: [...departmentIds], jobTitleIds: [...jobTitleIds] };
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
