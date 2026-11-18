import { EmployeeImportLookup, EmployeeRowClassifier, ExistingEmployee } from './employee-import-row-validation.policy';

const lookup = (overrides: Partial<EmployeeImportLookup> = {}): EmployeeImportLookup => ({
  departments: new Map([['P-DES', { id: 'd-des', active: true }]]),
  existing: new Map<string, ExistingEmployee>(),
  emailOwners: new Map<string, string>(),
  ...overrides,
});

const row = (overrides: Record<string, string> = {}) => ({
  employee_code: 'E-1',
  full_name: 'Nguyễn Văn A',
  work_email: 'a@acme.vn',
  employment_type: 'STAFF',
  hire_date: '2026-01-05',
  department_code: 'P-DES',
  job_title: 'Designer',
  ...overrides,
});

describe('EmployeeRowClassifier', () => {
  describe('the record of the person importing (US-02-02 AC-18)', () => {
    const own = { employeeCode: 'E-1', normalizedEmail: 'sa@acme.vn' };

    it('refuses a row with the importer own code, even when it would only be a person already there', () => {
      const result = new EmployeeRowClassifier(lookup({ own })).classify(row());

      expect(result).toMatchObject({ outcome: 'ERROR', errors: [{ column: 'employee_code', code: 'OWN_RECORD' }] });
    });

    it('refuses a row with the importer own work email, after normalization, and not as a taken email', () => {
      const result = new EmployeeRowClassifier(
        lookup({ own, emailOwners: new Map([['sa@acme.vn', 'E-SA']]) }),
      ).classify(row({ employee_code: 'E-7', work_email: 'Sa+tag@Acme.vn' }));

      expect(result.errors).toEqual([{ column: 'work_email', code: 'OWN_RECORD' }]);
    });

    it('does not touch the rows of everybody else', () => {
      expect(new EmployeeRowClassifier(lookup({ own })).classify(row({ employee_code: 'E-7' })).outcome).toBe('VALID');
    });
  });
});
