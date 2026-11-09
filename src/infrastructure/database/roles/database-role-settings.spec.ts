import { DatabaseRoleSettingsError, readProvisionSettings, readReconcileSettings } from './database-role-settings';

const DEPLOY_PASSWORD = 'd'.repeat(40);
const RUNTIME_PASSWORD = 'r'.repeat(40);
const BOOTSTRAP_PASSWORD = 'bootstrap-secret';
const url = (role: string, password: string, rest = 'postgres:5432/software_license_management'): string =>
  `postgresql://${role}:${encodeURIComponent(password)}@${rest}`;
const valid = (): Record<string, string> => ({
  DATABASE_BOOTSTRAP_URL: url('app', BOOTSTRAP_PASSWORD),
  DATABASE_DEPLOY_URL: url('slm_deploy', DEPLOY_PASSWORD),
  DATABASE_RUNTIME_URL: url('slm_runtime', RUNTIME_PASSWORD),
});

/** The message of the settings error, which must never carry a password or a URL. */
function refusal(read: () => unknown): string {
  try {
    read();
  } catch (error) {
    expect(error).toBeInstanceOf(DatabaseRoleSettingsError);
    const message = (error as Error).message;
    expect(message).not.toMatch(/postgres(?:ql)?:\/\//);
    for (const secret of [DEPLOY_PASSWORD, RUNTIME_PASSWORD, BOOTSTRAP_PASSWORD]) expect(message).not.toContain(secret);
    return message;
  }
  throw new Error('the settings were accepted');
}

describe('readProvisionSettings (ops:db-roles provision)', () => {
  it('reads the three identities of one database', () => {
    const settings = readProvisionSettings(valid());

    expect(settings.database).toBe('software_license_management');
    expect(settings.bootstrap.role).toBe('app');
    expect(settings.deploy).toMatchObject({ role: 'slm_deploy', password: DEPLOY_PASSWORD });
    expect(settings.runtime).toMatchObject({ role: 'slm_runtime', password: RUNTIME_PASSWORD });
  });

  it('decodes a percent-encoded password', () => {
    const password = `${'x'.repeat(36)}@:/%`;
    const settings = readProvisionSettings({ ...valid(), DATABASE_RUNTIME_URL: url('slm_runtime', password) });

    expect(settings.runtime.password).toBe(password);
  });

  it.each(['DATABASE_BOOTSTRAP_URL', 'DATABASE_DEPLOY_URL', 'DATABASE_RUNTIME_URL'])('names a missing %s', (name) => {
    const environment = valid();
    delete environment[name];

    expect(refusal(() => readProvisionSettings(environment))).toContain(name);
  });

  it.each([
    ['not a PostgreSQL URL', 'mysql://slm_runtime:x@postgres:5432/software_license_management'],
    ['a query that redirects the connection', `${url('slm_runtime', RUNTIME_PASSWORD)}?host=elsewhere`],
    ['a fragment', `${url('slm_runtime', RUNTIME_PASSWORD)}#x`],
    [
      'no password (no fallback to PGPASSWORD or a password file)',
      'postgresql://slm_runtime@postgres:5432/software_license_management',
    ],
    ['an uppercase role name', url('SLM_runtime', RUNTIME_PASSWORD)],
    ['a reserved pg_ role name', url('pg_runtime', RUNTIME_PASSWORD)],
    ['a password shorter than 32 characters', url('slm_runtime', 'short')],
    ['a password with a space', url('slm_runtime', `${'r'.repeat(40)} x`)],
    ['a non-ASCII password', url('slm_runtime', `${'r'.repeat(40)}é`)],
    ['a list of hosts', url('slm_runtime', RUNTIME_PASSWORD, 'postgres:5432,other:5432/software_license_management')],
  ])('refuses a runtime URL with %s', (_case, value) => {
    expect(refusal(() => readProvisionSettings({ ...valid(), DATABASE_RUNTIME_URL: value }))).toContain(
      'DATABASE_RUNTIME_URL',
    );
  });

  it.each([
    ['another host', 'other:5432/software_license_management'],
    ['another port', 'postgres:5433/software_license_management'],
    ['another database', 'postgres:5432/other_database'],
  ])('refuses identities that do not point at the same database (%s)', (_case, rest) => {
    expect(
      refusal(() =>
        readProvisionSettings({ ...valid(), DATABASE_DEPLOY_URL: url('slm_deploy', DEPLOY_PASSWORD, rest) }),
      ),
    ).toMatch(/same host, port and database/);
  });

  it.each([
    ['the runtime role is the bootstrap role', { DATABASE_RUNTIME_URL: url('app', RUNTIME_PASSWORD) }],
    ['the deploy role is the bootstrap role', { DATABASE_DEPLOY_URL: url('app', DEPLOY_PASSWORD) }],
    ['the runtime role is the deploy role', { DATABASE_RUNTIME_URL: url('slm_deploy', RUNTIME_PASSWORD) }],
  ])('refuses aliased identities: %s', (_case, override) => {
    expect(refusal(() => readProvisionSettings({ ...valid(), ...override }))).toMatch(/three different roles/);
  });

  it.each([
    ['the runtime and deploy passwords are equal', { DATABASE_RUNTIME_URL: url('slm_runtime', DEPLOY_PASSWORD) }],
    [
      'the deploy password is the bootstrap password',
      {
        DATABASE_BOOTSTRAP_URL: url('app', DEPLOY_PASSWORD),
        DATABASE_DEPLOY_URL: url('slm_deploy', DEPLOY_PASSWORD),
      },
    ],
  ])('refuses shared passwords: %s', (_case, override) => {
    expect(refusal(() => readProvisionSettings({ ...valid(), ...override }))).toMatch(/different passwords/);
  });
});

describe('readReconcileSettings (ops:db-roles reconcile | verify)', () => {
  const deployUrl = url('slm_deploy', DEPLOY_PASSWORD);

  it('reads the deploy connection and the runtime role name', () => {
    const settings = readReconcileSettings({ DATABASE_URL: deployUrl, DATABASE_RUNTIME_ROLE: 'slm_runtime' });

    expect(settings.connection.role).toBe('slm_deploy');
    expect(settings.runtimeRole).toBe('slm_runtime');
  });

  it.each([
    ['no DATABASE_URL', { DATABASE_RUNTIME_ROLE: 'slm_runtime' }, 'DATABASE_URL'],
    ['no DATABASE_RUNTIME_ROLE', { DATABASE_URL: deployUrl }, 'DATABASE_RUNTIME_ROLE'],
    [
      'an invalid runtime role name',
      { DATABASE_URL: deployUrl, DATABASE_RUNTIME_ROLE: 'Slm Runtime' },
      'DATABASE_RUNTIME_ROLE',
    ],
    [
      'the runtime role is the connected role',
      { DATABASE_URL: deployUrl, DATABASE_RUNTIME_ROLE: 'slm_deploy' },
      'different',
    ],
  ])('refuses %s', (_case, environment, expected) => {
    expect(refusal(() => readReconcileSettings(environment))).toContain(expected);
  });
});
