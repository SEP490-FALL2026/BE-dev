import { isBusinessDate } from '../../core/business-date';
import { InvalidEmailError, normalizeEmail } from '../../core/email';
import { displayJobTitleName, normalizeJobTitleName } from '../organization/job-title-name';

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

type Cells = Partial<Record<EmployeeColumn, string>>;

const clean = (value: string | undefined): string => displayJobTitleName(value ?? '');

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

  classify(cells: Cells): EmployeeRowResult {
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

    const jobTitle = jobTitleText === '' ? undefined : this.lookup.jobTitles.get(normalizeJobTitleName(jobTitleText));
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
    if (normalizeJobTitleName(existing.jobTitleName ?? '') !== normalizeJobTitleName(incoming.jobTitleText)) {
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
