import {
  EmployeeRowLookup,
  EmployeeRowReason,
  validateEmployeeRow,
} from '../../../organization/employee/employee-row.policy';
import type { RowIssue } from '../employee-import-row.types';
import { EmployeeImportLookup, EmployeeRowClassifier } from './employee-import-row-validation.policy';

/*
 * Characterization. The import preview (`EmployeeRowClassifier`) and manual entry
 * (`validateEmployeeRow`) each judge a row; this spec runs one fixture through both and records where they agree and
 * where they differ. The work item `beh1-employee-row-validation-ownership` made both paths adapters of one semantic
 * placement policy (`organization/public/employee-placement.policy.ts`) — the agreeing department and job title reasons, codes
 * and order — and deliberately kept four differences (field against column, an existing person, the place of a taken
 * email, import-only reasons). Making those equal would change codes, fields, order and stored previews; a change to
 * either path updates this table on purpose.
 *
 * The test imports a private organization file on purpose (test/README: tests may reach private files to prove a
 * boundary); production code in data-import must not.
 */

interface Fixture {
  department: 'ok' | 'blank' | 'unknown' | 'inactive';
  jobTitle: 'ok' | 'blank' | 'too-long';
  codeTaken?: boolean;
  emailTaken?: boolean;
}

/** A department the lookup found: whether it has a Cost Center in use is not asked (`QĐ-87d(3)`). */
const DEPARTMENT = { id: 'd-ops', active: true };

/** The job title cell the fixture stands for: free text, so it is only given or not, and fits or not (QĐ-87e). */
function jobTitleText(fixture: Fixture): string {
  return fixture.jobTitle === 'blank' ? '' : fixture.jobTitle === 'too-long' ? 'x'.repeat(256) : 'Designer';
}

function manual(fixture: Fixture): EmployeeRowReason[] {
  const lookup: EmployeeRowLookup = {
    department:
      fixture.department === 'unknown' || fixture.department === 'blank'
        ? null
        : { ...DEPARTMENT, active: fixture.department !== 'inactive' },
    employeeCodeTaken: fixture.codeTaken ?? false,
    workEmailTaken: fixture.emailTaken ?? false,
  };

  return validateEmployeeRow(
    {
      departmentCode: fixture.department === 'blank' ? '   ' : 'P-OPS',
      jobTitle: jobTitleText(fixture),
    },
    lookup,
  );
}

function imported(fixture: Fixture): { outcome: string; errors: RowIssue[] } {
  const lookup: EmployeeImportLookup = {
    departments: new Map(
      fixture.department === 'unknown' || fixture.department === 'blank'
        ? []
        : [['P-OPS', { ...DEPARTMENT, active: fixture.department !== 'inactive' }]],
    ),
    existing: new Map(
      fixture.codeTaken
        ? [
            [
              'N-1',
              {
                id: 'e-1',
                employeeCode: 'N-1',
                fullName: 'Someone Else',
                workEmail: null,
                employmentType: 'STAFF',
                hireDate: '2026-01-01',
                departmentCode: 'P-OPS',
                jobTitleName: 'Designer',
              },
            ],
          ]
        : [],
    ),
    emailOwners: new Map(fixture.emailTaken ? [['binh@acme.vn', 'E-OTHER']] : []),
  };
  const { outcome, errors } = new EmployeeRowClassifier(lookup).classify({
    employee_code: 'N-1',
    full_name: 'Binh Tran',
    work_email: 'binh@acme.vn',
    employment_type: 'STAFF',
    hire_date: '2026-10-01',
    department_code: fixture.department === 'blank' ? '   ' : 'P-OPS',
    job_title: jobTitleText(fixture),
  });

  return { outcome, errors };
}

describe('BEH.1 characterization: import classifier and manual-entry validator on the same row (A4-11)', () => {
  describe('where the two agree: the department and job title reasons, codes and order', () => {
    it.each<[string, Fixture, string[]]>([
      ['everything usable', { department: 'ok', jobTitle: 'ok' }, []],
      ['a blank department (whitespace only)', { department: 'blank', jobTitle: 'ok' }, []],
      ['an unknown department', { department: 'unknown', jobTitle: 'ok' }, ['DEPARTMENT_NOT_FOUND']],
      ['a retired department', { department: 'inactive', jobTitle: 'ok' }, ['DEPARTMENT_INACTIVE']],
      ['a blank job title: optional free text, no reason (QĐ-87e)', { department: 'ok', jobTitle: 'blank' }, []],
      ['a job title longer than 255 characters', { department: 'ok', jobTitle: 'too-long' }, ['JOB_TITLE_TOO_LONG']],
      [
        'both wrong: the department reason comes first',
        { department: 'unknown', jobTitle: 'too-long' },
        ['DEPARTMENT_NOT_FOUND', 'JOB_TITLE_TOO_LONG'],
      ],
    ])('%s', (_name, fixture, codes) => {
      expect(manual(fixture).map((reason) => reason.code)).toEqual(codes);
      expect(imported(fixture).errors.map((issue) => issue.code)).toEqual(codes);
      expect(imported(fixture).outcome).toBe(codes.length === 0 ? 'VALID' : 'ERROR');
    });
  });

  describe('where they differ today (kept as is in H8; aligned or accepted in BEH.1)', () => {
    it('D-1: names the place of a reason differently — a form field against a file column, under another key', () => {
      const fixture: Fixture = { department: 'unknown', jobTitle: 'too-long' };

      expect(manual(fixture)).toEqual([
        { field: 'departmentCode', code: 'DEPARTMENT_NOT_FOUND' },
        { field: 'jobTitle', code: 'JOB_TITLE_TOO_LONG' },
      ]);
      expect(imported(fixture).errors).toEqual([
        { column: 'department_code', code: 'DEPARTMENT_NOT_FOUND' },
        { column: 'job_title', code: 'JOB_TITLE_TOO_LONG' },
      ]);
    });

    it('D-2: a code someone already has is a reason for the form, and a person already there for the import', () => {
      // The import does not check the department or job title of a person already there: it only compares them.
      const fixture: Fixture = { department: 'inactive', jobTitle: 'ok', codeTaken: true };

      expect(manual(fixture)).toEqual([
        { field: 'departmentCode', code: 'DEPARTMENT_INACTIVE' },
        { field: 'employeeCode', code: 'EMPLOYEE_CODE_TAKEN' },
      ]);
      expect(imported(fixture)).toEqual({ outcome: 'EXISTS_DIFFERENT', errors: [] });
    });

    it('D-3: a taken work email comes after the department and job title on the form, and before them in the import', () => {
      const fixture: Fixture = { department: 'unknown', jobTitle: 'ok', emailTaken: true };

      expect(manual(fixture).map((reason) => reason.code)).toEqual(['DEPARTMENT_NOT_FOUND', 'WORK_EMAIL_TAKEN']);
      expect(imported(fixture).errors).toEqual([
        { column: 'work_email', code: 'WORK_EMAIL_TAKEN' },
        { column: 'department_code', code: 'DEPARTMENT_NOT_FOUND' },
      ]);
    });

    it('D-4: the import has reasons of its own that the validator does not decide', () => {
      const lookup: EmployeeImportLookup = {
        departments: new Map([['P-OPS', DEPARTMENT]]),
        existing: new Map(),
        emailOwners: new Map(),
      };
      const classifier = new EmployeeRowClassifier(lookup);
      const row = {
        employee_code: 'N-1',
        full_name: 'Binh Tran',
        work_email: 'binh@acme.vn',
        employment_type: 'STAFF',
        hire_date: '2026-10-01',
        department_code: 'P-OPS',
        job_title: 'Designer',
      };
      classifier.classify(row);

      const second = classifier.classify({
        ...row,
        full_name: '',
        work_email: 'BINH@acme.vn',
        employment_type: 'BOSS',
        hire_date: '2026-02-30',
      });
      const blank = classifier.classify({ ...row, employee_code: '', work_email: 'not an email' });

      expect(second.errors.map((issue) => issue.code)).toEqual([
        'EMPLOYEE_CODE_DUPLICATE_IN_FILE',
        'FULL_NAME_REQUIRED',
        'WORK_EMAIL_DUPLICATE_IN_FILE',
        'EMPLOYMENT_TYPE_INVALID',
        'HIRE_DATE_INVALID',
      ]);
      expect(blank.errors.map((issue) => issue.code)).toEqual(['EMPLOYEE_CODE_REQUIRED', 'WORK_EMAIL_INVALID']);
    });
  });
});
