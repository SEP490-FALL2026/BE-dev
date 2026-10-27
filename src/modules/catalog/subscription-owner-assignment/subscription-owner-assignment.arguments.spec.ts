import {
  ASSIGNMENT_USAGE,
  AssignmentArgumentError,
  parseAssignmentArguments,
} from './subscription-owner-assignment.arguments';

const SUBSCRIPTION = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11';
const VALID = [
  '--subscription',
  SUBSCRIPTION,
  '--department',
  'ENG',
  '--basis',
  'PO-2026-0042',
  '--operator',
  'ops-lead',
  '--environment',
  'SHARED',
];
const without = (option: string): string[] => {
  const at = VALID.indexOf(option);

  return [...VALID.slice(0, at), ...VALID.slice(at + 2)];
};

describe('ops:assign-subscription-owner arguments (spec L.3)', () => {
  it('takes the five options, all required, and ignores the -- that pnpm forwards', () => {
    const expected = {
      help: false,
      command: {
        subscriptionId: SUBSCRIPTION,
        departmentCode: 'ENG',
        basis: 'PO-2026-0042',
        operator: 'ops-lead',
        environment: 'SHARED',
      },
    };

    expect(parseAssignmentArguments(VALID)).toEqual(expected);
    expect(parseAssignmentArguments(['--', ...VALID])).toEqual(expected);
  });

  it.each(['--subscription', '--department', '--basis', '--operator', '--environment'])(
    'refuses a run without %s: the basis of an assignment is never filled in for the operator',
    (option) => {
      expect(() => parseAssignmentArguments(without(option))).toThrow(AssignmentArgumentError);
      expect(() => parseAssignmentArguments(without(option))).toThrow(option);
    },
  );

  it('answers --help without needing the other options', () => {
    expect(parseAssignmentArguments(['--help'])).toEqual({ help: true });
    expect(ASSIGNMENT_USAGE).toMatch(/Exit codes: 0 .* 2 .* 1/s);
    expect(ASSIGNMENT_USAGE).toContain('--basis');
  });

  it('refuses a subscription that is not a UUID, a basis outside 2 to 200 characters, and an environment it does not know', () => {
    const replace = (option: string, value: string): string[] => {
      const copy = [...VALID];
      copy[copy.indexOf(option) + 1] = value;

      return copy;
    };

    expect(() => parseAssignmentArguments(replace('--subscription', 'not-a-uuid'))).toThrow(/UUID/);
    expect(() => parseAssignmentArguments(replace('--basis', 'x'))).toThrow(/2 to 200/);
    expect(() => parseAssignmentArguments(replace('--basis', ' '.repeat(5)))).toThrow(/required/);
    expect(() => parseAssignmentArguments(replace('--basis', 'y'.repeat(201)))).toThrow(/2 to 200/);
    expect(() => parseAssignmentArguments(replace('--environment', 'PRODUCTION'))).toThrow(/LOCAL_TEST/);
    expect(parseAssignmentArguments(replace('--environment', 'LOCAL_TEST'))).toMatchObject({
      command: { environment: 'LOCAL_TEST' },
    });
  });

  it('has no way to assign in bulk, by rule or by default: every other option, positional or flag, is refused', () => {
    for (const extra of [['--all'], ['--force'], ['--department-from', 'plan'], ['ENG'], ['--yes']]) {
      expect(() => parseAssignmentArguments([...VALID, ...extra])).toThrow(AssignmentArgumentError);
    }
  });

  it('trims the text it keeps, so a basis of spaces around a reference is stored as the reference', () => {
    const copy = [...VALID];
    copy[copy.indexOf('--basis') + 1] = '  PO-2026-0042  ';

    expect(parseAssignmentArguments(copy)).toMatchObject({ command: { basis: 'PO-2026-0042' } });
  });
});
