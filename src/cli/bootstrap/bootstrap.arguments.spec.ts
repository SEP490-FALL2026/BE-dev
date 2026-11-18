import { INSTALLATION_USAGE, InstallationArgumentError, parseInstallationArguments } from './bootstrap.arguments';

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
      passwordStdin: false,
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

  describe('--password-stdin (opt-in transport of the Super Admin password, never its value)', () => {
    it('is off unless named, and maps the rest of the input exactly as before when named', () => {
      const without = parseInstallationArguments(full);
      const withMode = parseInstallationArguments([...full, '--password-stdin']);

      expect(without).toMatchObject({ help: false, passwordStdin: false });
      expect(withMode).toMatchObject({ help: false, passwordStdin: true });
      expect(withMode).toEqual({ ...without, passwordStdin: true });
    });

    it('takes no value: a value given to the mode, attached or as the next word, is an argument error that never echoes it', () => {
      for (const extra of [['--password-stdin=hunter2-canary'], ['--password-stdin', 'hunter2-canary']]) {
        const attempt = () => parseInstallationArguments([...full, ...extra]);

        expect(attempt).toThrow(InstallationArgumentError);
        expect(attempt).not.toThrow(/hunter2-canary/);
      }
    });

    it('never echoes a stray positional argument, which may be a password someone typed after the wrong option', () => {
      const attempt = () => parseInstallationArguments([...full, 'hunter2-canary']);

      expect(attempt).toThrow(InstallationArgumentError);
      expect(attempt).toThrow(/positional|values? (are|is) given as --name=value/i);
      expect(attempt).not.toThrow(/hunter2-canary/);
    });

    it.each(['--password=hunter2-canary', '--password', '-password=x', '--pass=x', '--pwd=x', '--secret=x'])(
      'still refuses the literal option %s when the mode is named, with a message that carries no value',
      (flag) => {
        const attempt = () => parseInstallationArguments([...full, '--password-stdin', flag]);

        expect(attempt).toThrow(InstallationArgumentError);
        expect(attempt).toThrow(/never accepted/);
        expect(attempt).not.toThrow(/hunter2-canary/);
      },
    );

    it.each(['--pass-stdin', '--secret-stdin', '--password-file', '--password-env'])(
      'does not invent a sibling transport: %s is an unknown option',
      (flag) => {
        expect(() => parseInstallationArguments([...full, flag])).toThrow(InstallationArgumentError);
      },
    );

    it('is documented in the usage together with its record format, and the prompt stays the default', () => {
      expect(INSTALLATION_USAGE).toContain('--password-stdin');
      expect(INSTALLATION_USAGE).toMatch(/one line/i);
      expect(INSTALLATION_USAGE).toMatch(/hidden prompt/i);
      // No literal `--password` option is documented: only `--password-stdin` exists.
      expect(INSTALLATION_USAGE).not.toMatch(/--password(?![-\w])/);
    });
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
