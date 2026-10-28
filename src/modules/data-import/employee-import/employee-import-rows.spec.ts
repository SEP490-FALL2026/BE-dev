import { DISPLAY_NAME_CASES } from '../../../../test/support/display-name-cases';
import {
  EmployeeImportLookup,
  EmployeeRowClassifier,
  ExistingEmployee,
  clean,
  idsUsedByValidRows,
  jobTitleKey,
  lookupNamesOf,
  mapEmployeeColumns,
  sameJudgement,
  toEmployeeImportLookup,
} from './employee-import-rows';

describe('cell text (T-12)', () => {
  it('reads a missing cell as empty', () => {
    expect(clean(undefined)).toBe('');
  });

  describe.each(DISPLAY_NAME_CASES)('$label', ({ input, display, comparison }) => {
    it('reads a cell in its display form', () => {
      expect(clean(input)).toBe(display);
    });

    it('compares job titles by the display form in lower case', () => {
      expect(jobTitleKey(input)).toBe(comparison);
    });
  });
});

const lookup = (overrides: Partial<EmployeeImportLookup> = {}): EmployeeImportLookup => ({
  departments: new Map([
    ['P-DES', { id: 'd-des', active: true }],
    ['P-OLD', { id: 'd-old', active: false }],
    // A department with no Cost Center in use is a department like any other for a people file (`QĐ-87d(3)`, F44).
    ['P-NOCC', { id: 'd-nocc', active: true }],
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

  it('names the columns that are missing: without a department the whole file is unusable, and the job title is optional (QĐ-87e)', () => {
    const mapped = mapEmployeeColumns(['employee_code', 'full_name', 'employment_type', 'hire_date', 'work_email']);

    expect(mapped.missing).toEqual(['department_code']);
  });

  it('lets the work email and the job title columns be absent, and lists the columns it does not know instead of using them', () => {
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
    expect(
      mapEmployeeColumns(['employee_code', 'full_name', 'employment_type', 'hire_date', 'department_code']).missing,
    ).toEqual([]);
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
        departmentCode: 'P-DES',
        jobTitleName: 'Designer',
      },
    });
  });

  it('takes the job title as typed, with its stray spaces collapsed, and the employment type in any case', () => {
    const result = new EmployeeRowClassifier(lookup()).classify(
      row({ job_title: '  Chief   Happiness  Officer ', employment_type: 'intern' }),
    );

    expect(result).toMatchObject({
      outcome: 'VALID',
      parsed: { jobTitleName: 'Chief Happiness Officer', employmentType: 'INTERN' },
    });
  });

  it('reads the job title through Unicode spaces and decomposed accents into its display form, keeping the accents (T-12)', () => {
    expect(
      new EmployeeRowClassifier(lookup()).classify(row({ job_title: '\u3000K\u1ebf\u00a0\u00a0TOA\u0301N\ufeff' })),
    ).toMatchObject({ outcome: 'VALID', parsed: { jobTitleName: 'K\u1ebf TO\u00c1N' } });
  });

  it('refuses a job title longer than 255 characters, counted after the display form is made', () => {
    const fits = new EmployeeRowClassifier(lookup()).classify(row({ job_title: ` ${'x'.repeat(255)} ` }));
    const tooLong = new EmployeeRowClassifier(lookup()).classify(row({ job_title: 'x'.repeat(256) }));

    expect(fits.outcome).toBe('VALID');
    expect(tooLong).toMatchObject({ outcome: 'ERROR', errors: [{ column: 'job_title', code: 'JOB_TITLE_TOO_LONG' }] });
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
    ['job_title', 'x'.repeat(256), 'JOB_TITLE_TOO_LONG'],
  ])('refuses a new person whose %s is %j with %s, naming the column (US-02-03)', (column, value, code) => {
    const result = new EmployeeRowClassifier(lookup()).classify(row({ [column]: value }));

    expect(result.outcome).toBe('ERROR');
    expect(result.errors).toEqual([{ column, code }]);
  });

  it('reports every problem of one row at once', () => {
    const result = new EmployeeRowClassifier(lookup()).classify(
      row({ department_code: '', job_title: 'x'.repeat(256), hire_date: 'x' }),
    );

    expect(result.errors).toEqual([
      { column: 'hire_date', code: 'HIRE_DATE_INVALID' },
      { column: 'department_code', code: 'DEPARTMENT_REQUIRED' },
      { column: 'job_title', code: 'JOB_TITLE_TOO_LONG' },
    ]);
  });

  it('lets a person with no job title in: the title is optional free text and a blank cell is not an error (QĐ-87e)', () => {
    const result = new EmployeeRowClassifier(lookup()).classify(row({ job_title: '' }));

    expect(result).toMatchObject({ outcome: 'VALID', errors: [], parsed: { jobTitleName: null } });
  });

  it('lets a person in a department with no Cost Center in (QĐ-87d(3), F44: no DEPARTMENT_COST_CENTER_INACTIVE)', () => {
    const result = new EmployeeRowClassifier(lookup()).classify(row({ department_code: 'P-NOCC' }));

    expect(result).toMatchObject({ outcome: 'VALID', parsed: { departmentId: 'd-nocc' } });
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

describe('judging the rows of a preview again (US-02-01 AC-9)', () => {
  it('asks the organization for each code, job title key and work email of the rows once, without blanks', () => {
    expect(
      lookupNamesOf([
        {
          cells: {
            employee_code: ' N-1 ',
            department_code: 'P-OPS',
            job_title: '  Senior   Designer',
            work_email: 'A@Acme.vn',
          },
        },
        {
          cells: {
            employee_code: 'N-1',
            department_code: '',
            job_title: 'senior designer',
            work_email: 'not an email',
          },
        },
        { cells: {} },
      ]),
    ).toEqual({
      departmentCodes: ['P-OPS'],
      employeeCodes: ['N-1'],
      normalizedEmails: ['a@acme.vn'],
    });
  });

  it('keys what the organization answered the way the classifier reads it', () => {
    const lookup = toEmployeeImportLookup({
      departments: [{ id: 'd1', code: 'P-OPS', active: true }],
      employees: [],
      emailOwners: [{ normalizedEmail: 'a@acme.vn', employeeCode: 'E1' }],
    });

    expect(lookup.departments.get('P-OPS')?.id).toBe('d1');
    expect(lookup.emailOwners.get('a@acme.vn')).toBe('E1');
  });

  it('locks only what the valid rows use, each once', () => {
    const lookup = toEmployeeImportLookup({
      departments: [
        { id: 'd1', code: 'P-OPS', active: true },
        { id: 'd2', code: 'P-DES', active: true },
      ],
      employees: [],
      emailOwners: [],
    });

    expect(
      idsUsedByValidRows(
        [
          { outcome: 'VALID', cells: { department_code: 'P-OPS', job_title: 'Designer' } },
          { outcome: 'VALID', cells: { department_code: 'P-OPS', job_title: ' designer' } },
          { outcome: 'ERROR', cells: { department_code: 'P-DES', job_title: 'Designer' } },
        ],
        lookup,
      ),
    ).toEqual({ departmentIds: ['d1'] });
  });

  it('compares a judgement whatever order its keys came back in, but keeps the order of its reasons', () => {
    const stored = {
      outcome: 'ERROR' as const,
      errors: [
        { code: 'HIRE_DATE_INVALID', column: 'hire_date' },
        { code: 'JOB_TITLE_TOO_LONG', column: 'job_title' },
      ],
      differences: null,
    };
    const fresh = {
      outcome: 'ERROR' as const,
      errors: [
        { column: 'hire_date', code: 'HIRE_DATE_INVALID' },
        { column: 'job_title', code: 'JOB_TITLE_TOO_LONG' },
      ],
    };

    expect(sameJudgement(fresh, stored)).toBe(true);
    expect(sameJudgement({ ...fresh, errors: [...fresh.errors].reverse() }, stored)).toBe(false);
    expect(sameJudgement({ ...fresh, outcome: 'VALID' }, stored)).toBe(false);
    expect(
      sameJudgement(
        {
          outcome: 'EXISTS_DIFFERENT',
          errors: [],
          differences: [{ column: 'full_name', current: 'A', incoming: 'B' }],
        },
        {
          outcome: 'EXISTS_DIFFERENT',
          errors: [],
          differences: [{ incoming: 'B', current: 'A', column: 'full_name' }],
        },
      ),
    ).toBe(true);
    expect(
      sameJudgement({ outcome: 'EXISTS_SAME', errors: [] }, { outcome: 'EXISTS_SAME', errors: [], differences: null }),
    ).toBe(true);
  });
});
