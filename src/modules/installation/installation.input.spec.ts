import { InstallationInput, installationInputSchema } from './installation.input';

const valid = (): InstallationInput => ({
  timeZone: 'Asia/Ho_Chi_Minh',
  reportingCurrency: 'VND',
  organizationName: 'Acme Software',
  departmentCode: 'P-ENG',
  departmentName: 'Engineering',
  superAdmin: {
    employeeCode: 'E001',
    fullName: 'Pham Bao',
    workEmail: 'bao@acme.vn',
    employmentType: 'STAFF',
    hireDate: '2024-03-01',
  },
  operatorReference: 'CHG-1234',
  environment: 'LOCAL_TEST',
});

function issues(input: unknown): string[] {
  const result = installationInputSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
}

describe('installationInputSchema', () => {
  it('accepts real values', () => {
    expect(issues(valid())).toEqual([]);
  });

  it('rejects an unknown time zone, an offset, and a bad currency', () => {
    expect(issues({ ...valid(), timeZone: 'Mars/Olympus' })).toEqual([expect.stringContaining('timeZone')]);
    expect(issues({ ...valid(), timeZone: '+07:00' })).toEqual([expect.stringContaining('timeZone')]);
    expect(issues({ ...valid(), reportingCurrency: 'vnd' })).toEqual([expect.stringContaining('reportingCurrency')]);
  });

  it.each(['Chưa phân loại', 'unclassified', 'TBD', 'N/A', 'placeholder'])(
    'rejects the stand-in %p for the department name',
    (value) => {
      expect(issues({ ...valid(), departmentName: value })).toEqual([expect.stringContaining('departmentName')]);
    },
  );

  it('rejects a hire date in the future and an impossible date', () => {
    const base = valid();
    expect(issues({ ...base, superAdmin: { ...base.superAdmin, hireDate: '2999-01-01' } })).toEqual([
      expect.stringContaining('superAdmin.hireDate'),
    ]);
    expect(issues({ ...base, superAdmin: { ...base.superAdmin, hireDate: '2024-02-30' } })).toEqual([
      expect.stringContaining('superAdmin.hireDate'),
    ]);
  });

  it('rejects unknown keys so a mistyped option is not silently ignored', () => {
    expect(issues({ ...valid(), password: 'hunter2hunter2' })).not.toEqual([]);
  });

  it.each([
    ['costCenterCode', 'CC-ENG'],
    ['costCenterName', 'Engineering'],
    ['jobTitleName', 'Software Engineer'],
    [
      'itAdmin',
      {
        employeeCode: 'E002',
        fullName: 'Tran An',
        workEmail: 'an@acme.vn',
        employmentType: 'STAFF',
        hireDate: '2024-03-01',
      },
    ],
  ])('refuses the key %s of the earlier command: no Cost Center, job title or IT employee (QĐ-87f)', (key, value) => {
    expect(issues({ ...valid(), [key]: value })).toEqual([expect.stringContaining(key)]);
  });
});
