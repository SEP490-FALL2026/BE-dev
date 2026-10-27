import { DirectionArgumentError, parseDirectionArguments } from './cost-center-direction.arguments';

const COST_CENTER = '0f3c7b88-7d58-4b6e-9a2f-5a4d2c1b9e10';

const activate = [
  'activate',
  '--release-evidence',
  'deploy 2026-10-28 run 7, image sha256:abc',
  '--approved-by',
  'release-owner',
  '--operator',
  'ops-1',
  '--environment',
  'SHARED',
];
const link = [
  'link',
  '--cost-center',
  COST_CENTER,
  '--department',
  'ENG',
  '--basis',
  'FIN-2026-017',
  '--approved-by',
  'finance-lead',
  '--operator',
  'ops-1',
  '--environment',
  'SHARED',
];

describe('ops:cost-center-direction arguments (F01, spec L.11)', () => {
  it('parses activate with its four required options', () => {
    expect(parseDirectionArguments(activate)).toEqual({
      help: false,
      mode: 'activate',
      command: {
        releaseEvidence: 'deploy 2026-10-28 run 7, image sha256:abc',
        approvedBy: 'release-owner',
        operator: 'ops-1',
        environment: 'SHARED',
      },
    });
  });

  it('parses link with one Cost Center, one department code and the basis Finance approved', () => {
    expect(parseDirectionArguments(link)).toEqual({
      help: false,
      mode: 'link',
      command: {
        costCenterId: COST_CENTER,
        departmentCode: 'ENG',
        basis: 'FIN-2026-017',
        approvedBy: 'finance-lead',
        operator: 'ops-1',
        environment: 'SHARED',
      },
    });
  });

  it('ignores the leading -- pnpm forwards and answers --help', () => {
    expect(parseDirectionArguments(['--', ...activate])).toMatchObject({ mode: 'activate' });
    expect(parseDirectionArguments(['--help'])).toEqual({ help: true });
    expect(parseDirectionArguments(['link', '--help'])).toEqual({ help: true });
  });

  it.each([
    ['no mode', [], /mode is required/i],
    ['an unknown mode', ['retire'], /Unknown mode/],
    ['a missing --approved-by', activate.filter((_, index) => index !== 3 && index !== 4), /--approved-by is required/],
    ['a missing --operator', activate.filter((_, index) => index !== 5 && index !== 6), /--operator is required/],
    ['a bad environment', activate.map((part) => (part === 'SHARED' ? 'PROD' : part)), /LOCAL_TEST or SHARED/],
    ['a Cost Center that is not a UUID', link.map((part) => (part === COST_CENTER ? 'CC-1' : part)), /must be a UUID/],
    ['no department', link.filter((_, index) => index !== 3 && index !== 4), /--department is required/],
    ['an option of the other mode', [...activate, '--department', 'ENG'], /Unknown option/],
  ])('refuses %s', (_case, argv, message) => {
    expect(() => parseDirectionArguments(argv)).toThrow(DirectionArgumentError);
    expect(() => parseDirectionArguments(argv)).toThrow(message);
  });

  it('refuses a bulk or by-name way to link: there is no such option, nothing is inferred', () => {
    for (const option of ['--all', '--by-name', '--default-department', '--match']) {
      expect(() => parseDirectionArguments([...link, option])).toThrow(DirectionArgumentError);
    }
  });

  it('refuses a secret in an option by its name, before anything is loaded', () => {
    for (const option of ['--password', '--pass', '--pwd', '--secret', '--token', '--code', '--password=x']) {
      expect(() => parseDirectionArguments([...link, option, 'x'])).toThrow(/no password, token or code/);
    }
  });
});
