import {
  EmployeeImportLookup,
  EmployeeRowClassifier,
  ExistingEmployee,
  mapEmployeeColumns,
} from './employee-import-rows';

const lookup = (overrides: Partial<EmployeeImportLookup> = {}): EmployeeImportLookup => ({
  departments: new Map([
    ['P-DES', { id: 'd-des', active: true, costCenterActive: true }],
    ['P-OLD', { id: 'd-old', active: false, costCenterActive: true }],
    ['P-DEAD', { id: 'd-dead', active: true, costCenterActive: false }],
  ]),
  jobTitles: new Map([
    ['designer', { id: 'j-des', name: 'Designer', status: 'ACTIVE' as const }],
    ['intern', { id: 'j-int', name: 'Intern', status: 'INACTIVE' as const }],
  ]),
  existing: new Map<string, ExistingEmployee>(),
  emailOwners: new Map<string, string>(),
  ...overrides,
});

const row = (overrides: Record<string, string> = {}) => ({
  employee_code: 'E1',
  full_name: 'Nguyễn Văn A',
  work_email: 'a@acme.vn',
  employment_type: 'STAFF',
  hire_date: '2026-01-05',
  department_code: 'P-DES',
  job_title: 'Designer',
  ...overrides,
});

describe('mapEmployeeColumns (US-02-02 AC-2)', () => {
  it('finds every column by its name, in any order, with accents and case ignored', () => {
    const mapped = mapEmployeeColumns([
      'Mã phòng ban',
      'Chức vụ',
      'MÃ NHÂN VIÊN',
      'Họ tên',
      'Email công việc',
      'Loại nhân sự',
      'Ngày vào',
    ]);

    expect(mapped.missing).toEqual([]);
    expect(mapped.ignored).toEqual([]);
    expect(mapped.indexOf).toEqual({
      department_code: 0,
      job_title: 1,
      employee_code: 2,
      full_name: 3,
      work_email: 4,
      employment_type: 5,
      hire_date: 6,
    });
  });

  it('names the columns that are missing: without a department or a job title the whole file is unusable', () => {
    const mapped = mapEmployeeColumns(['employee_code', 'full_name', 'employment_type', 'hire_date', 'work_email']);

    expect(mapped.missing).toEqual(['department_code', 'job_title']);
  });

  it('lets the work email column be absent, and lists the columns it does not know instead of using them', () => {
    const mapped = mapEmployeeColumns([
      'employee_code',
      'full_name',
      'employment_type',
      'hire_date',
      'department_code',
      'job_title',
      'manager',
      'cost_center',
    ]);

    expect(mapped.missing).toEqual([]);
    expect(mapped.ignored).toEqual(['manager', 'cost_center']);
  });

  it('counts a column named twice as missing nothing but ignores the second', () => {
    const mapped = mapEmployeeColumns([
      'employee_code',
      'full_name',
      'employment_type',
      'hire_date',
      'department_code',
      'job_title',
      'full_name',
    ]);

    expect(mapped.ignored).toEqual(['full_name']);
  });
});

describe('EmployeeRowClassifier', () => {
  it('accepts a row for a person who is not there yet (US-02-02 AC-1)', () => {
    const result = new EmployeeRowClassifier(lookup()).classify(row());

    expect(result).toMatchObject({
      outcome: 'VALID',
      errors: [],
      parsed: {
        employeeCode: 'E1',
        fullName: 'Nguyễn Văn A',
        workEmail: 'a@acme.vn',
        employmentType: 'STAFF',
        hireDate: '2026-01-05',
        departmentId: 'd-des',
        jobTitleId: 'j-des',
        departmentCode: 'P-DES',
        jobTitleName: 'Designer',
      },
    });
  });

  it('reads the job title by name without case or stray spaces, and the employment type in any case', () => {
    const result = new EmployeeRowClassifier(lookup()).classify(
      row({ job_title: '  DESIGNER ', employment_type: 'intern' }),
    );

    expect(result).toMatchObject({ outcome: 'VALID', parsed: { jobTitleId: 'j-des', employmentType: 'INTERN' } });
  });

  it.each([
    ['employee_code', '', 'EMPLOYEE_CODE_REQUIRED'],
    ['full_name', '', 'FULL_NAME_REQUIRED'],
    ['employment_type', 'boss', 'EMPLOYMENT_TYPE_INVALID'],
    ['hire_date', '31/12/2026', 'HIRE_DATE_INVALID'],
    ['hire_date', '2026-02-30', 'HIRE_DATE_INVALID'],
    ['hire_date', '', 'HIRE_DATE_INVALID'],
    ['work_email', 'not-an-email', 'WORK_EMAIL_INVALID'],
    ['department_code', '', 'DEPARTMENT_REQUIRED'],
    ['department_code', 'P-XYZ', 'DEPARTMENT_NOT_FOUND'],
    ['department_code', 'P-OLD', 'DEPARTMENT_INACTIVE'],
    ['department_code', 'P-DEAD', 'DEPARTMENT_COST_CENTER_INACTIVE'],
    ['job_title', '', 'JOB_TITLE_REQUIRED'],
    ['job_title', 'Desginer', 'JOB_TITLE_NOT_FOUND'],
    ['job_title', 'Intern', 'JOB_TITLE_INACTIVE'],
  ])('refuses a new person whose %s is %j with %s, naming the column (US-02-03)', (column, value, code) => {
    const result = new EmployeeRowClassifier(lookup()).classify(row({ [column]: value }));

    expect(result.outcome).toBe('ERROR');
    expect(result.errors).toEqual([{ column, code }]);
  });

  it('reports every problem of one row at once', () => {
    const result = new EmployeeRowClassifier(lookup()).classify(
      row({ department_code: '', job_title: 'Desginer', hire_date: 'x' }),
    );

    expect(result.errors).toEqual([
      { column: 'hire_date', code: 'HIRE_DATE_INVALID' },
      { column: 'department_code', code: 'DEPARTMENT_REQUIRED' },
      { column: 'job_title', code: 'JOB_TITLE_NOT_FOUND' },
    ]);
  });

  it('lets a person with no work email in (the record is kept, requests are refused later)', () => {
    const result = new EmployeeRowClassifier(lookup()).classify(row({ work_email: '' }));

    expect(result).toMatchObject({ outcome: 'VALID', parsed: { workEmail: null } });
  });

  it('refuses a second row with the same code, and a second row with the same email after normalization (AC-8)', () => {
    const classifier = new EmployeeRowClassifier(lookup());

    classifier.classify(row());
    const sameCode = classifier.classify(row({ work_email: 'other@acme.vn' }));
    const sameEmail = classifier.classify(row({ employee_code: 'E2', work_email: 'A+figma@ACME.vn' }));

    expect(sameCode.errors).toEqual([{ column: 'employee_code', code: 'EMPLOYEE_CODE_DUPLICATE_IN_FILE' }]);
    expect(sameEmail.errors).toEqual([{ column: 'work_email', code: 'WORK_EMAIL_DUPLICATE_IN_FILE' }]);
  });

  it('refuses an email that another person of the company already has', () => {
    const result = new EmployeeRowClassifier(lookup({ emailOwners: new Map([['a@acme.vn', 'E9']]) })).classify(row());

    expect(result.errors).toEqual([{ column: 'work_email', code: 'WORK_EMAIL_TAKEN' }]);
  });

  describe('a person who is already there (US-02-02 AC-6, AC-10)', () => {
    const existing: ExistingEmployee = {
      id: 'e-1',
      employeeCode: 'E1',
      fullName: 'Nguyễn Văn A',
      workEmail: 'a@acme.vn',
      employmentType: 'STAFF',
      hireDate: '2026-01-05',
      departmentCode: 'P-DES',
      jobTitleName: 'Designer',
    };
    const withExisting = () => lookup({ existing: new Map([['E1', existing]]) });

    it('is skipped as the same when all six columns agree, whatever the case or spaces of the text', () => {
      const result = new EmployeeRowClassifier(withExisting()).classify(
        row({ job_title: 'designer ', work_email: 'A@ACME.VN' }),
      );

      expect(result).toMatchObject({ outcome: 'EXISTS_SAME', errors: [] });
    });

    it('is reported with every column that differs, and never written', () => {
      const result = new EmployeeRowClassifier(withExisting()).classify(
        row({
          full_name: 'Nguyen Van A',
          department_code: 'P-FIN',
          job_title: 'Senior Designer',
          hire_date: '2026-02-01',
        }),
      );

      expect(result.outcome).toBe('EXISTS_DIFFERENT');
      expect(result.differences).toEqual([
        { column: 'full_name', current: 'Nguyễn Văn A', incoming: 'Nguyen Van A' },
        { column: 'hire_date', current: '2026-01-05', incoming: '2026-02-01' },
        { column: 'department_code', current: 'P-DES', incoming: 'P-FIN' },
        { column: 'job_title', current: 'Designer', incoming: 'Senior Designer' },
      ]);
    });

    it('is never an error because its job title was retired, nor because the department is not known (it is only compared)', () => {
      const retired = lookup({
        existing: new Map([['E1', { ...existing, jobTitleName: 'Intern' }]]),
      });

      const result = new EmployeeRowClassifier(retired).classify(
        row({ job_title: 'Intern', department_code: 'P-XYZ' }),
      );

      expect(result.outcome).toBe('EXISTS_DIFFERENT');
      expect(result.errors).toEqual([]);
    });

    it('still refuses a row whose own fields are malformed', () => {
      const result = new EmployeeRowClassifier(withExisting()).classify(row({ employment_type: 'boss' }));

      expect(result.outcome).toBe('ERROR');
      expect(result.errors).toEqual([{ column: 'employment_type', code: 'EMPLOYMENT_TYPE_INVALID' }]);
    });
  });
});
