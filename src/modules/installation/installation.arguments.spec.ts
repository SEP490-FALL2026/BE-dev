import { INSTALLATION_USAGE, InstallationArgumentError, parseInstallationArguments } from './installation.arguments';

const full = [
  '--timezone=Asia/Ho_Chi_Minh',
  '--organization-name=Acme',
  '--department-code=P-ENG',
  '--department-name=Engineering',
  '--admin-code=E1',
  '--admin-name=Bao',
  '--admin-email=bao@acme.vn',
  '--admin-hire-date=2024-01-02',
  '--operator-reference=CHG-1',
  '--environment=LOCAL_TEST',
];

describe('parseInstallationArguments', () => {
  it('maps flags to the input object and applies defaults', () => {
    const parsed = parseInstallationArguments(full);

    expect(parsed).toEqual({
      help: false,
      input: {
        timeZone: 'Asia/Ho_Chi_Minh',
        reportingCurrency: 'VND',
        organizationName: 'Acme',
        departmentCode: 'P-ENG',
        departmentName: 'Engineering',
        superAdmin: {
          employeeCode: 'E1',
          fullName: 'Bao',
          workEmail: 'bao@acme.vn',
          employmentType: 'STAFF',
          hireDate: '2024-01-02',
        },
        operatorReference: 'CHG-1',
        environment: 'LOCAL_TEST',
      },
    });
  });

  it('carries the login email only when one is given', () => {
    expect(parseInstallationArguments([...full, '--login-email=sign.in@acme.vn'])).toMatchObject({
      input: { loginEmail: 'sign.in@acme.vn' },
    });
    expect(parseInstallationArguments(full)).not.toHaveProperty('input.loginEmail');
  });

  it.each(['--password=x', '--password', '--pass=x', '--secret=x'])('refuses %s by name', (flag) => {
    expect(() => parseInstallationArguments([...full, flag])).toThrow(InstallationArgumentError);
    expect(() => parseInstallationArguments([...full, flag])).toThrow(/never accepted/);
  });

  it('rejects an unknown option and positional arguments', () => {
    expect(() => parseInstallationArguments([...full, '--bogus=1'])).toThrow(InstallationArgumentError);
    expect(() => parseInstallationArguments([...full, 'extra'])).toThrow(InstallationArgumentError);
  });

  it.each([
    '--cost-center-code=CC-1',
    '--cost-center-name=Eng',
    '--job-title=Engineer',
    '--it-code=E2',
    '--it-name=An',
    '--it-email=an@acme.vn',
    '--it-hire-date=2024-01-02',
    '--it-type=STAFF',
  ])('refuses %s: the command no longer creates a Cost Center, a job title or an IT employee (QĐ-87f)', (flag) => {
    expect(() => parseInstallationArguments([...full, flag])).toThrow(InstallationArgumentError);
  });

  it('says what the command creates and what it does not, and does not promise that exit code 1 means nothing was written (a lost COMMIT leaves the outcome unknown)', () => {
    expect(INSTALLATION_USAGE).not.toMatch(/nothing written/i);
    expect(INSTALLATION_USAGE).toContain('check the installation state before running again');
    expect(INSTALLATION_USAGE).toMatch(/no Cost Center, head or IT Admin in charge/);
    expect(INSTALLATION_USAGE).not.toMatch(/--cost-center|--job-title|--it-/);
    // The other exit codes stay documented.
    expect(INSTALLATION_USAGE).toMatch(/0 installed/);
    expect(INSTALLATION_USAGE).toMatch(/2 already installed/);
    expect(INSTALLATION_USAGE).toMatch(/130 cancelled/);
  });

  it('recognises --help', () => {
    expect(parseInstallationArguments(['--help'])).toEqual({ help: true });
  });
});
