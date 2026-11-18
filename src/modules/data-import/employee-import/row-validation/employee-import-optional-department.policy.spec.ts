import {
  EmployeeRowClassifier,
  type EmployeeImportLookup,
  type ExistingEmployee,
} from './employee-import-row-validation.policy';

const employee: ExistingEmployee = {
  id: 'e1',
  employeeCode: 'NV-001',
  fullName: 'Example',
  workEmail: null,
  employmentType: 'STAFF',
  hireDate: '2026-01-01',
  departmentCode: 'P-ENG',
  jobTitleName: null,
};
const lookup: EmployeeImportLookup = {
  departments: new Map(),
  existing: new Map([[employee.employeeCode, employee]]),
  emailOwners: new Map(),
};
const cells = { employee_code: 'NV-001', full_name: 'Example', employment_type: 'STAFF', hire_date: '2026-01-01' };
describe('an existing employee and an omitted department column', () => {
  it('does not compare a column absent from the file, while an empty cell is compared', () => {
    expect(new EmployeeRowClassifier(lookup).classify(cells)).toMatchObject({ outcome: 'EXISTS_SAME' });
    expect(new EmployeeRowClassifier(lookup).classify({ ...cells, department_code: '' })).toMatchObject({
      outcome: 'EXISTS_DIFFERENT',
      differences: [{ column: 'department_code', current: 'P-ENG', incoming: '' }],
    });
  });
});
