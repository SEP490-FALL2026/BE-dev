import { EmployeeRowLookup, validateEmployeeRow } from './employee-row.validator';

const clean: EmployeeRowLookup = {
  department: { id: 'd1', active: true, costCenterActive: true },
  jobTitle: { status: 'ACTIVE' },
  employeeCodeTaken: false,
  workEmailTaken: false,
};

describe('validateEmployeeRow (T-16)', () => {
  it('has no reason for a row whose department and title exist and whose code and email are free', () => {
    expect(validateEmployeeRow({ departmentCode: 'P-OPS', jobTitleId: 'j1' }, clean)).toEqual([]);
  });

  describe('the department (US-02-03 AC-1, AC-4)', () => {
    it.each([[undefined], [null], [''], ['   ']])('is required when it is %j', (departmentCode) => {
      expect(validateEmployeeRow({ departmentCode, jobTitleId: 'j1' }, { ...clean, department: null })).toEqual([
        { field: 'departmentCode', code: 'DEPARTMENT_REQUIRED' },
      ]);
    });

    it('cannot take people in while its cost center is retired (US-04-09 AC-3)', () => {
      expect(
        validateEmployeeRow(
          { departmentCode: 'P-OPS', jobTitleId: 'j1' },
          { ...clean, department: { id: 'd1', active: true, costCenterActive: false } },
        ),
      ).toEqual([{ field: 'departmentCode', code: 'DEPARTMENT_COST_CENTER_INACTIVE' }]);
    });

    it('must exist: an unknown code is not turned into a new department', () => {
      expect(
        validateEmployeeRow({ departmentCode: 'P-NOPE', jobTitleId: 'j1' }, { ...clean, department: null }),
      ).toEqual([{ field: 'departmentCode', code: 'DEPARTMENT_NOT_FOUND' }]);
    });
  });

  describe('the job title (US-02-07 AC-7)', () => {
    it.each([[undefined], [null], [''], ['  ']])('is required when it is %j', (jobTitleId) => {
      expect(validateEmployeeRow({ departmentCode: 'P-OPS', jobTitleId }, { ...clean, jobTitle: null })).toEqual([
        { field: 'jobTitleId', code: 'JOB_TITLE_REQUIRED' },
      ]);
    });

    it('must exist', () => {
      expect(validateEmployeeRow({ departmentCode: 'P-OPS', jobTitleId: 'j9' }, { ...clean, jobTitle: null })).toEqual([
        { field: 'jobTitleId', code: 'JOB_TITLE_NOT_FOUND' },
      ]);
    });

    it('must be active: a deactivated title cannot be given to someone new', () => {
      expect(
        validateEmployeeRow(
          { departmentCode: 'P-OPS', jobTitleId: 'j1' },
          { ...clean, jobTitle: { status: 'INACTIVE' } },
        ),
      ).toEqual([{ field: 'jobTitleId', code: 'JOB_TITLE_INACTIVE' }]);
    });
  });

  describe('the keys', () => {
    it('refuses an employee code that is taken', () => {
      expect(
        validateEmployeeRow({ departmentCode: 'P-OPS', jobTitleId: 'j1' }, { ...clean, employeeCodeTaken: true }),
      ).toEqual([{ field: 'employeeCode', code: 'EMPLOYEE_CODE_TAKEN' }]);
    });

    it('refuses a work email that is taken', () => {
      expect(
        validateEmployeeRow({ departmentCode: 'P-OPS', jobTitleId: 'j1' }, { ...clean, workEmailTaken: true }),
      ).toEqual([{ field: 'workEmail', code: 'WORK_EMAIL_TAKEN' }]);
    });
  });

  it('reports every reason at once, so one attempt shows everything to fix, in a fixed order', () => {
    expect(
      validateEmployeeRow(
        { departmentCode: '', jobTitleId: 'j9' },
        { department: null, jobTitle: null, employeeCodeTaken: true, workEmailTaken: true },
      ),
    ).toEqual([
      { field: 'departmentCode', code: 'DEPARTMENT_REQUIRED' },
      { field: 'jobTitleId', code: 'JOB_TITLE_NOT_FOUND' },
      { field: 'employeeCode', code: 'EMPLOYEE_CODE_TAKEN' },
      { field: 'workEmail', code: 'WORK_EMAIL_TAKEN' },
    ]);
  });
});
