import { EmployeeRowLookup, validateEmployeeRow } from './employee-row.validator';

const clean: EmployeeRowLookup = {
  department: { id: 'd1', active: true, costCenterActive: true },
  employeeCodeTaken: false,
  workEmailTaken: false,
};

describe('validateEmployeeRow (T-16)', () => {
  it('has no reason for a row whose department exists, whose title is given and whose code and email are free', () => {
    expect(validateEmployeeRow({ departmentCode: 'P-OPS', jobTitle: 'Engineer' }, clean)).toEqual([]);
  });

  describe('the department (US-02-03 AC-1, AC-4)', () => {
    it.each([[undefined], [null], [''], ['   ']])('is required when it is %j', (departmentCode) => {
      expect(validateEmployeeRow({ departmentCode, jobTitle: 'Engineer' }, { ...clean, department: null })).toEqual([
        { field: 'departmentCode', code: 'DEPARTMENT_REQUIRED' },
      ]);
    });

    it('cannot take people in while its cost center is retired (US-04-09 AC-3)', () => {
      expect(
        validateEmployeeRow(
          { departmentCode: 'P-OPS', jobTitle: 'Engineer' },
          { ...clean, department: { id: 'd1', active: true, costCenterActive: false } },
        ),
      ).toEqual([{ field: 'departmentCode', code: 'DEPARTMENT_COST_CENTER_INACTIVE' }]);
    });

    it('must exist: an unknown code is not turned into a new department', () => {
      expect(
        validateEmployeeRow({ departmentCode: 'P-NOPE', jobTitle: 'Engineer' }, { ...clean, department: null }),
      ).toEqual([{ field: 'departmentCode', code: 'DEPARTMENT_NOT_FOUND' }]);
    });
  });

  describe('the job title: free text, still asked for in this release (QĐ-87e)', () => {
    it.each([[undefined], [null], [''], ['  ']])('is required when it is %j', (jobTitle) => {
      expect(validateEmployeeRow({ departmentCode: 'P-OPS', jobTitle }, clean)).toEqual([
        { field: 'jobTitle', code: 'JOB_TITLE_REQUIRED' },
      ]);
    });

    it('is taken as typed: any title that fits needs no catalogue entry', () => {
      expect(validateEmployeeRow({ departmentCode: 'P-OPS', jobTitle: 'Chief Happiness Officer' }, clean)).toEqual([]);
    });

    it('may not be longer than 255 characters once its whitespace is collapsed', () => {
      expect(validateEmployeeRow({ departmentCode: 'P-OPS', jobTitle: `  ${'x'.repeat(255)}   ` }, clean)).toEqual([]);
      expect(validateEmployeeRow({ departmentCode: 'P-OPS', jobTitle: 'x'.repeat(256) }, clean)).toEqual([
        { field: 'jobTitle', code: 'JOB_TITLE_TOO_LONG' },
      ]);
    });
  });

  describe('the keys', () => {
    it('refuses an employee code that is taken', () => {
      expect(
        validateEmployeeRow({ departmentCode: 'P-OPS', jobTitle: 'Engineer' }, { ...clean, employeeCodeTaken: true }),
      ).toEqual([{ field: 'employeeCode', code: 'EMPLOYEE_CODE_TAKEN' }]);
    });

    it('refuses a work email that is taken', () => {
      expect(
        validateEmployeeRow({ departmentCode: 'P-OPS', jobTitle: 'Engineer' }, { ...clean, workEmailTaken: true }),
      ).toEqual([{ field: 'workEmail', code: 'WORK_EMAIL_TAKEN' }]);
    });
  });

  describe('the record of the person entering (US-02-02 AC-18)', () => {
    const row = { departmentCode: 'P-OPS', jobTitle: 'Engineer' };

    it('refuses their own code and their own email as their own record, instead of as taken', () => {
      expect(
        validateEmployeeRow(row, {
          ...clean,
          employeeCodeTaken: true,
          workEmailTaken: true,
          ownCode: true,
          ownEmail: true,
        }),
      ).toEqual([
        { field: 'employeeCode', code: 'OWN_RECORD' },
        { field: 'workEmail', code: 'OWN_RECORD' },
      ]);
    });

    it('says nothing when the code and the email are of somebody else and free', () => {
      expect(validateEmployeeRow(row, { ...clean, ownCode: false, ownEmail: false })).toEqual([]);
    });
  });

  describe('the form adapter of the placement policy (BEH.1)', () => {
    it.each<[string, Partial<EmployeeRowLookup>, { departmentCode: string; jobTitle: string }, object]>([
      [
        'a blank department',
        { department: null },
        { departmentCode: ' ', jobTitle: 'Engineer' },
        { field: 'departmentCode', code: 'DEPARTMENT_REQUIRED' },
      ],
      [
        'an unknown department',
        { department: null },
        { departmentCode: 'P-X', jobTitle: 'Engineer' },
        { field: 'departmentCode', code: 'DEPARTMENT_NOT_FOUND' },
      ],
      [
        'a retired department',
        { department: { id: 'd1', active: false, costCenterActive: true } },
        { departmentCode: 'P-OPS', jobTitle: 'Engineer' },
        { field: 'departmentCode', code: 'DEPARTMENT_INACTIVE' },
      ],
      [
        'a department on a retired cost center',
        { department: { id: 'd1', active: true, costCenterActive: false } },
        { departmentCode: 'P-OPS', jobTitle: 'Engineer' },
        { field: 'departmentCode', code: 'DEPARTMENT_COST_CENTER_INACTIVE' },
      ],
      [
        'a blank job title',
        {},
        { departmentCode: 'P-OPS', jobTitle: '' },
        { field: 'jobTitle', code: 'JOB_TITLE_REQUIRED' },
      ],
      [
        'a job title that is too long',
        {},
        { departmentCode: 'P-OPS', jobTitle: 'x'.repeat(300) },
        { field: 'jobTitle', code: 'JOB_TITLE_TOO_LONG' },
      ],
    ])('D-1: shows %s on its form field', (_name, found, row, reason) => {
      expect(validateEmployeeRow(row, { ...clean, ...found })).toEqual([reason]);
    });

    it('D-2, D-3: a taken code is a reason of its own, after the department and job title, and before a taken email', () => {
      expect(
        validateEmployeeRow(
          { departmentCode: 'P-OPS', jobTitle: '' },
          {
            department: { id: 'd1', active: false, costCenterActive: false },
            employeeCodeTaken: true,
            workEmailTaken: true,
          },
        ),
      ).toEqual([
        { field: 'departmentCode', code: 'DEPARTMENT_INACTIVE' },
        { field: 'jobTitle', code: 'JOB_TITLE_REQUIRED' },
        { field: 'employeeCode', code: 'EMPLOYEE_CODE_TAKEN' },
        { field: 'workEmail', code: 'WORK_EMAIL_TAKEN' },
      ]);
    });
  });

  it('reports every reason at once, so one attempt shows everything to fix, in a fixed order', () => {
    expect(
      validateEmployeeRow(
        { departmentCode: '', jobTitle: null },
        { department: null, employeeCodeTaken: true, workEmailTaken: true },
      ),
    ).toEqual([
      { field: 'departmentCode', code: 'DEPARTMENT_REQUIRED' },
      { field: 'jobTitle', code: 'JOB_TITLE_REQUIRED' },
      { field: 'employeeCode', code: 'EMPLOYEE_CODE_TAKEN' },
      { field: 'workEmail', code: 'WORK_EMAIL_TAKEN' },
    ]);
  });
});
