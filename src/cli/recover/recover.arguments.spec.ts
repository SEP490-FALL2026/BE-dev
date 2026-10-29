import { RecoveryArgumentError, parseRecoveryArguments } from './recover.arguments';

const BASE = [
  '--ticket',
  'R-2026-014',
  '--approved-by',
  'cto@acme.vn',
  '--operator',
  'ops-1',
  '--environment',
  'SHARED',
];

describe('recovery arguments (US-01-09 AC-9 to AC-14)', () => {
  it('reads a credential reset with every part of the ticket', () => {
    const parsed = parseRecoveryArguments([
      'reset-credentials',
      ...BASE,
      '--identity-check',
      'ID-77',
      '--account-email',
      'admin@acme.vn',
      '--new-login-email',
      'new@acme.vn',
    ]);

    expect(parsed).toEqual({
      help: false,
      command: {
        mode: 'reset-credentials',
        context: {
          ticketRef: 'R-2026-014',
          approverRef: 'cto@acme.vn',
          operatorRef: 'ops-1',
          environment: 'SHARED',
          identityCheckRef: 'ID-77',
        },
        accountEmail: 'admin@acme.vn',
        newLoginEmail: 'new@acme.vn',
      },
    });
  });

  it('reads an unlock and a role transfer', () => {
    expect(parseRecoveryArguments(['unlock', ...BASE, '--account-email', 'admin@acme.vn'])).toMatchObject({
      command: { mode: 'unlock', accountEmail: 'admin@acme.vn' },
    });
    expect(
      parseRecoveryArguments(['transfer-role', ...BASE, '--successor-code', 'E-042', '--holder-email', 'old@acme.vn']),
    ).toMatchObject({ command: { mode: 'transfer-role', successorEmployeeCode: 'E-042', holderEmail: 'old@acme.vn' } });
    expect(parseRecoveryArguments(['transfer-role', ...BASE, '--successor-code', 'E-042'])).toMatchObject({
      command: { mode: 'transfer-role', successorEmployeeCode: 'E-042' },
    });
  });

  it('answers --help without anything else', () => {
    expect(parseRecoveryArguments(['--help'])).toEqual({ help: true });
  });

  it.each([
    ['no mode', [...BASE, '--account-email', 'a@acme.vn']],
    ['a mode that does not exist', ['wipe', ...BASE]],
    ['two modes', ['unlock', 'reset-credentials', ...BASE, '--account-email', 'a@acme.vn']],
    [
      'no ticket',
      ['unlock', '--approved-by', 'x', '--operator', 'y', '--environment', 'SHARED', '--account-email', 'a@acme.vn'],
    ],
    [
      'no approver',
      ['unlock', '--ticket', 'R-1', '--operator', 'y', '--environment', 'SHARED', '--account-email', 'a@acme.vn'],
    ],
    [
      'no operator',
      ['unlock', '--ticket', 'R-1', '--approved-by', 'x', '--environment', 'SHARED', '--account-email', 'a@acme.vn'],
    ],
    [
      'no environment',
      ['unlock', '--ticket', 'R-1', '--approved-by', 'x', '--operator', 'y', '--account-email', 'a@acme.vn'],
    ],
    [
      'an environment that is not one',
      ['unlock', ...BASE.slice(0, 6), '--environment', 'PROD', '--account-email', 'a@acme.vn'],
    ],
    ['an unlock without the account', ['unlock', ...BASE]],
    ['a transfer without the successor', ['transfer-role', ...BASE]],
    ['an option of another mode', ['unlock', ...BASE, '--account-email', 'a@acme.vn', '--successor-code', 'E-1']],
    ['a new email on an unlock', ['unlock', ...BASE, '--account-email', 'a@acme.vn', '--new-login-email', 'b@acme.vn']],
    ['an unknown option', ['unlock', ...BASE, '--account-email', 'a@acme.vn', '--force']],
  ])('refuses %s', (_name, argv) => {
    expect(() => parseRecoveryArguments(argv)).toThrow(RecoveryArgumentError);
  });

  it.each(['--password', '--password=x', '--secret', '--token', '--code', '--link=https://x'])(
    'refuses %s by name: the command takes no secret, code or link',
    (option) => {
      expect(() =>
        parseRecoveryArguments(['reset-credentials', ...BASE, '--account-email', 'a@acme.vn', option, 'x']),
      ).toThrow('takes no password, code or link');
    },
  );
});
