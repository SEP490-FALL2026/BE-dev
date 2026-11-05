import { INSTALLATION, installationWith } from './fixture/shared-demo-v2/installation';
import { SeedArgumentError, parseSeedArguments } from './seed.arguments';

const valid = [
  'plan',
  '--fixture',
  'shared-demo-v2',
  '--api-url',
  'http://slm-api:3000',
  '--operator-reference',
  'CHG-42',
  '--environment',
  'SHARED',
  '--secrets-stdin',
];

describe('ops:seed arguments', () => {
  it('reads the mode and every option, and keeps the API origin only', () => {
    expect(parseSeedArguments(valid)).toEqual({
      help: false,
      command: {
        mode: 'plan',
        fixture: 'shared-demo-v2',
        apiUrl: 'http://slm-api:3000',
        operator: 'CHG-42',
        environment: 'SHARED',
        json: false,
        allowBootstrap: false,
        secretsStdin: true,
      },
    });
  });

  it('checks without API credentials and keeps explicit bootstrap authorization', () => {
    expect(parseSeedArguments(['check', '--environment', 'LOCAL_TEST'])).toMatchObject({
      command: { mode: 'check', fixture: 'shared-demo-v2', secretsStdin: false },
    });
    expect(parseSeedArguments([...valid, '--allow-bootstrap'])).toMatchObject({ command: { allowBootstrap: true } });
    expect(() => parseSeedArguments([...valid, '--organization', 'Other'])).toThrow('Unknown option');
    expect(() => parseSeedArguments([...valid, '--operator', 'Old'])).toThrow('Unknown option');
  });

  it('takes the Super Admin email of a bootstrap, or none, and refuses an invalid one', () => {
    expect(parseSeedArguments(valid)).not.toHaveProperty('command.superAdminEmail');
    expect(parseSeedArguments([...valid, '--super-admin-email', ' owner@example.com '])).toMatchObject({
      command: { superAdminEmail: 'owner@example.com' },
    });
    expect(parseSeedArguments(['check', '--environment', 'SHARED', '--super-admin-email', 'a@b.vn'])).toMatchObject({
      command: { superAdminEmail: 'a@b.vn' },
    });
    for (const bad of ['not-an-email', 'a@b', `${'x'.repeat(250)}@b.vn`]) {
      expect(() => parseSeedArguments([...valid, '--super-admin-email', bad])).toThrow(
        '--super-admin-email is not a valid email.',
      );
    }
  });

  it('puts the chosen email on both the account and the employee of the installation, nothing else', () => {
    expect(installationWith()).toEqual(INSTALLATION);
    const chosen = installationWith('owner@example.com');
    expect(chosen.loginEmail).toBe('owner@example.com');
    expect(chosen.superAdmin.workEmail).toBe('owner@example.com');
    expect({ ...chosen, loginEmail: INSTALLATION.loginEmail, superAdmin: INSTALLATION.superAdmin }).toEqual(
      INSTALLATION,
    );
  });

  it('answers --help without asking for anything else', () => {
    expect(parseSeedArguments(['--help'])).toEqual({ help: true });
  });

  it('ignores the -- pnpm forwards and reads --json', () => {
    const parsed = parseSeedArguments(['--', ...valid.map((word) => (word === 'plan' ? 'apply' : word)), '--json']);
    expect(parsed).toMatchObject({ command: { mode: 'apply', json: true } });
  });

  it.each([
    ['no mode', valid.slice(1), 'Name exactly one mode'],
    ['two modes', ['apply', ...valid], 'Name exactly one mode'],
    ['an unknown mode', ['seed', ...valid.slice(1)], 'Name exactly one mode'],
    ['no --secrets-stdin', valid.filter((word) => word !== '--secrets-stdin'), '--secrets-stdin is required'],
    ['another environment', valid.map((word) => (word === 'SHARED' ? 'PRODUCTION' : word)), '--environment must be'],
    [
      'a URL with a path',
      valid.map((word) => (word.startsWith('http') ? 'http://api:3000/api/v1' : word)),
      'origin only',
    ],
    [
      'a URL with credentials',
      valid.map((word) => (word.startsWith('http') ? 'http://u:p@api:3000' : word)),
      'credentials',
    ],
    ['a URL of another scheme', valid.map((word) => (word.startsWith('http') ? 'ftp://api' : word)), 'http or https'],
    ['an unknown option', [...valid, '--password', 'x'], 'Unknown option'],
  ])('refuses %s', (_case, argv, message) => {
    expect(() => parseSeedArguments(argv)).toThrow(SeedArgumentError);
    expect(() => parseSeedArguments(argv)).toThrow(message);
  });

  it('never prints a positional back: a password typed as one is not echoed', () => {
    let message = '';
    try {
      parseSeedArguments(['s3cret-typed-by-mistake', ...valid.slice(1)]);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).not.toContain('s3cret');
  });
});
