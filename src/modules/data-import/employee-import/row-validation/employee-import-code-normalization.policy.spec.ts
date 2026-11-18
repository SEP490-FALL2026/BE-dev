import { EmployeeRowClassifier, lookupNamesOf } from './employee-import-row-validation.policy';

describe('employee import code normalization', () => {
  it('looks up and creates rows with trimmed uppercase codes', () => {
    const cells = {
      employee_code: ' nv-001 ',
      full_name: 'Example',
      work_email: '',
      employment_type: 'STAFF',
      hire_date: '2026-01-05',
      department_code: ' p-des ',
      job_title: '',
    };
    expect(lookupNamesOf([{ cells }])).toMatchObject({ employeeCodes: ['NV-001'], departmentCodes: ['P-DES'] });
    const classifier = new EmployeeRowClassifier({
      departments: new Map([['P-DES', { id: 'd-des', active: true }]]),
      existing: new Map(),
      emailOwners: new Map(),
    });
    expect(classifier.classify(cells)).toMatchObject({
      outcome: 'VALID',
      parsed: { employeeCode: 'NV-001', departmentCode: 'P-DES' },
    });
  });
  it('rejects malformed codes in import rows', () => {
    const classifier = new EmployeeRowClassifier({
      departments: new Map(),
      existing: new Map(),
      emailOwners: new Map(),
    });
    expect(
      classifier.classify({
        employee_code: 'a_',
        full_name: 'Example',
        employment_type: 'STAFF',
        hire_date: '2026-01-05',
        department_code: 'bad_',
      }).errors,
    ).toEqual(
      expect.arrayContaining([
        { column: 'employee_code', code: 'EMPLOYEE_CODE_INVALID' },
        { column: 'department_code', code: 'DEPARTMENT_CODE_INVALID' },
      ]),
    );
  });
});
