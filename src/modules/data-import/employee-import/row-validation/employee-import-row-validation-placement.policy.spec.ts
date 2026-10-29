import type { EmployeeCells } from '../employee-import-row.types';
import { EmployeeImportLookup, EmployeeRowClassifier } from './employee-import-row-validation.policy';

/*
 * BEH.1: the import adapter of the shared placement policy. The decision is organization's; this file owns where a
 * reason is shown (a file column, H8 D-1), that a person already there is compared and not placed (D-2), that the
 * placement reasons come after the file's own (D-3) and the reasons only an import has (D-4). Literal expectations.
 */

const lookup: EmployeeImportLookup = {
  departments: new Map([
    ['P-OPS', { id: 'd-ops', active: true }],
    ['P-OFF', { id: 'd-off', active: false }],
    // No Cost Center in use yet: the lookup does not even say (`QĐ-87d(3)`).
    ['P-CCX', { id: 'd-ccx', active: true }],
  ]),
  existing: new Map([
    [
      'E-OLD',
      {
        id: 'e-old',
        employeeCode: 'E-OLD',
        fullName: 'Old Person',
        workEmail: null,
        employmentType: 'STAFF' as const,
        hireDate: '2026-01-01',
        departmentCode: 'P-OPS',
        jobTitleName: 'Designer',
      },
    ],
  ]),
  emailOwners: new Map([['taken@acme.vn', 'E-OTHER']]),
};

const row: EmployeeCells = {
  employee_code: 'N-1',
  full_name: 'Binh Tran',
  work_email: '',
  employment_type: 'STAFF',
  hire_date: '2026-10-01',
  department_code: 'P-OPS',
  job_title: 'Designer',
};

const judge = (cells: EmployeeCells) => new EmployeeRowClassifier(lookup).classify({ ...row, ...cells });

describe('import adapter of the placement policy (BEH.1)', () => {
  it.each<[string, EmployeeCells, { column: string; code: string }]>([
    ['a blank department', { department_code: ' ' }, { column: 'department_code', code: 'DEPARTMENT_REQUIRED' }],
    [
      'an unknown department',
      { department_code: 'P-NONE' },
      { column: 'department_code', code: 'DEPARTMENT_NOT_FOUND' },
    ],
    ['a retired department', { department_code: 'P-OFF' }, { column: 'department_code', code: 'DEPARTMENT_INACTIVE' }],
    [
      'a job title longer than 255 characters',
      { job_title: 'x'.repeat(256) },
      { column: 'job_title', code: 'JOB_TITLE_TOO_LONG' },
    ],
  ])('D-1: shows %s on its file column', (_name, cells, issue) => {
    expect(judge(cells)).toEqual({ outcome: 'ERROR', errors: [issue] });
  });

  it('takes a person into a department with no Cost Center, and a blank job title is not a reason (QĐ-87d(3), QĐ-87e)', () => {
    expect(judge({ department_code: 'P-CCX', job_title: '' })).toMatchObject({
      outcome: 'VALID',
      errors: [],
      parsed: { departmentId: 'd-ccx', jobTitleName: null },
    });
  });

  it('D-2: compares a person already there and does not place them, even on a retired department', () => {
    expect(judge({ employee_code: 'E-OLD', department_code: 'P-OFF', job_title: 'Retired' })).toEqual({
      outcome: 'EXISTS_DIFFERENT',
      errors: [],
      differences: [
        { column: 'full_name', current: 'Old Person', incoming: 'Binh Tran' },
        { column: 'hire_date', current: '2026-01-01', incoming: '2026-10-01' },
        { column: 'department_code', current: 'P-OPS', incoming: 'P-OFF' },
        { column: 'job_title', current: 'Designer', incoming: 'Retired' },
      ],
    });
  });

  it("D-3: lists the file's own reasons first, then the department, then the job title", () => {
    expect(
      judge({
        full_name: '',
        work_email: 'taken@acme.vn',
        employment_type: 'BOSS',
        hire_date: '2026-02-30',
        department_code: 'P-NONE',
        job_title: 'x'.repeat(256),
      }).errors,
    ).toEqual([
      { column: 'full_name', code: 'FULL_NAME_REQUIRED' },
      { column: 'work_email', code: 'WORK_EMAIL_TAKEN' },
      { column: 'employment_type', code: 'EMPLOYMENT_TYPE_INVALID' },
      { column: 'hire_date', code: 'HIRE_DATE_INVALID' },
      { column: 'department_code', code: 'DEPARTMENT_NOT_FOUND' },
      { column: 'job_title', code: 'JOB_TITLE_TOO_LONG' },
    ]);
  });

  it('D-4: keeps the reasons only a file has — a blank code, a duplicate, a bad email — next to the placement ones', () => {
    const classifier = new EmployeeRowClassifier(lookup);
    classifier.classify({ ...row, work_email: 'binh@acme.vn' });

    expect(
      classifier.classify({ ...row, work_email: 'BINH@acme.vn', department_code: '', job_title: 'x'.repeat(256) })
        .errors,
    ).toEqual([
      { column: 'employee_code', code: 'EMPLOYEE_CODE_DUPLICATE_IN_FILE' },
      { column: 'work_email', code: 'WORK_EMAIL_DUPLICATE_IN_FILE' },
      { column: 'department_code', code: 'DEPARTMENT_REQUIRED' },
      { column: 'job_title', code: 'JOB_TITLE_TOO_LONG' },
    ]);
    expect(judge({ employee_code: '', work_email: 'not an email', department_code: 'P-OFF' }).errors).toEqual([
      { column: 'employee_code', code: 'EMPLOYEE_CODE_REQUIRED' },
      { column: 'work_email', code: 'WORK_EMAIL_INVALID' },
      { column: 'department_code', code: 'DEPARTMENT_INACTIVE' },
    ]);
  });

  it('places a usable row in the department the lookup found, with the title as typed', () => {
    expect(judge({ job_title: ' senior  designer ' })).toMatchObject({
      outcome: 'VALID',
      errors: [],
      parsed: { departmentId: 'd-ops', jobTitleName: 'senior designer' },
    });
  });
});
