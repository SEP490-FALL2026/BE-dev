import { formatSeedResult } from './dev-seed-report';

describe('formatSeedResult', () => {
  it('prints a created account with its role, demo email and one-time password on stdout', () => {
    const output = formatSeedResult({
      outcome: 'CREATED',
      items: [
        { kind: 'DEPARTMENT', key: 'DEMO', state: 'created' },
        {
          kind: 'ACCOUNT',
          key: 'DEMO-IT',
          state: 'created',
          role: 'IT_ADMIN',
          loginEmail: 'it.admin@demo.slm.test',
          password: 'x'.repeat(24),
        },
      ],
    });

    expect(output).toEqual({
      stdout: [
        'dev:seed: CREATED',
        '  department  DEMO        created',
        `  account     DEMO-IT     created  IT_ADMIN  it.admin@demo.slm.test  password: ${'x'.repeat(24)}`,
        'Created. The passwords above are shown this once: they are not stored, logged or shown again.',
        '',
      ].join('\n'),
      stderr: '',
    });
  });

  it('prints no password when everything is already present', () => {
    const output = formatSeedResult({
      outcome: 'ALREADY_PRESENT',
      items: [
        {
          kind: 'ACCOUNT',
          key: 'DEMO-IT',
          state: 'already-present',
          role: 'IT_ADMIN',
          loginEmail: 'it.admin@demo.slm.test',
        },
      ],
    });

    expect(output.stdout).not.toContain('password:');
    expect(output.stdout).toContain('Nothing was written; no password was reset.');
  });

  it('prints a refusal and its conflicts on stderr only', () => {
    expect(
      formatSeedResult({
        outcome: 'REFUSED',
        refusal: 'CONFLICT',
        items: [{ kind: 'EMPLOYEE', key: 'DEMO-FIN', state: 'conflict', reason: 'EMPLOYEE_DIFFERS' }],
      }),
    ).toEqual({
      stdout: '',
      stderr: [
        '  employee    DEMO-FIN    conflict  (EMPLOYEE_DIFFERS)',
        'Refused (CONFLICT): existing data differs from the demo fixture (see the conflicts above); it is not changed. Nothing was written.',
        '',
      ].join('\n'),
    });
    expect(formatSeedResult({ outcome: 'REFUSED', refusal: 'DATABASE_NOT_LOOPBACK', items: [] }).stderr).toBe(
      'Refused (DATABASE_NOT_LOOPBACK): the database host is not localhost, 127.x.x.x or ::1. Nothing was written.\n',
    );
  });
});
