import { InstallationArgumentError, parseInstallationArguments } from './installation.arguments';

const full = [
  '--timezone=Asia/Ho_Chi_Minh',
  '--organization-name=Acme',
  '--cost-center-code=CC-1',
  '--cost-center-name=Eng',
  '--department-code=P-ENG',
  '--department-name=Engineering',
  '--job-title=Engineer',
  '--admin-code=E1',
  '--admin-name=Bao',
  '--admin-email=bao@acme.vn',
  '--admin-hire-date=2024-01-02',
  '--it-code=E2',
  '--it-name=An',
  '--it-email=an@acme.vn',
  '--it-hire-date=2024-01-02',
  '--operator-reference=CHG-1',
  '--environment=LOCAL_TEST',
];

describe('parseInstallationArguments', () => {
  it('maps flags to the input object and applies defaults', () => {
    const parsed = parseInstallationArguments(full);

    expect(parsed).toMatchObject({
      help: false,
      input: {
        timeZone: 'Asia/Ho_Chi_Minh',
        reportingCurrency: 'VND',
        superAdmin: { employeeCode: 'E1', employmentType: 'STAFF', hireDate: '2024-01-02' },
        itAdmin: { employeeCode: 'E2', workEmail: 'an@acme.vn' },
        environment: 'LOCAL_TEST',
      },
    });
  });

  it.each(['--password=x', '--password', '--pass=x', '--secret=x'])('refuses %s by name', (flag) => {
    expect(() => parseInstallationArguments([...full, flag])).toThrow(InstallationArgumentError);
    expect(() => parseInstallationArguments([...full, flag])).toThrow(/never accepted/);
  });

  it('rejects an unknown option and positional arguments', () => {
    expect(() => parseInstallationArguments([...full, '--bogus=1'])).toThrow(InstallationArgumentError);
    expect(() => parseInstallationArguments([...full, 'extra'])).toThrow(InstallationArgumentError);
  });

  it('recognises --help', () => {
    expect(parseInstallationArguments(['--help'])).toEqual({ help: true });
  });
});
