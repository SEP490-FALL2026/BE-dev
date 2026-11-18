import { AI_PURGE_USAGE, AiPurgeArgumentError, parseAiPurgeArguments } from './ai-purge.arguments';

const NOW = new Date('2026-12-05T10:30:00.000Z');
const parse = (argv: string[]) => parseAiPurgeArguments(argv, NOW);

describe('ops:ai-purge arguments', () => {
  it('takes --through alone as a dry run: nothing is applied unless --apply is named', () => {
    expect(parse(['--through', '2026-12-01'])).toEqual({
      help: false,
      command: { through: '2026-12-01', apply: false, operator: null },
    });
  });

  it('takes --apply with the operator who runs it, and ignores the -- that pnpm forwards', () => {
    const expected = { help: false, command: { through: '2026-12-01', apply: true, operator: 'ops-lead' } };

    expect(parse(['--through', '2026-12-01', '--apply', '--operator', 'ops-lead'])).toEqual(expected);
    expect(parse(['--', '--through', '2026-12-01', '--apply', '--operator', '  ops-lead  '])).toEqual(expected);
  });

  it('refuses --apply without an operator: a deletion is never recorded for nobody', () => {
    expect(() => parse(['--through', '2026-12-01', '--apply'])).toThrow(AiPurgeArgumentError);
    expect(() => parse(['--through', '2026-12-01', '--apply'])).toThrow('--operator is required with --apply');
    expect(() => parse(['--through', '2026-12-01', '--apply', '--operator', '  '])).toThrow('--operator');
    expect(() => parse(['--through', '2026-12-01', '--apply', '--operator', 'x'.repeat(201)])).toThrow(/1 to 200/);
  });

  it('answers --help without needing the other options, and says the arguments and the exit codes', () => {
    expect(parse(['--help'])).toEqual({ help: true });
    expect(AI_PURGE_USAGE).toContain('--through');
    expect(AI_PURGE_USAGE).toContain('--apply');
    expect(AI_PURGE_USAGE).toContain('--operator');
    expect(AI_PURGE_USAGE).toMatch(/Exit codes: 0 .* 2 .* 1/s);
    expect(AI_PURGE_USAGE).toMatch(/dry run/i);
    expect(AI_PURGE_USAGE).toMatch(/PENDING.*RUNNING.*never purged/s);
  });

  it.each([
    ['missing', []],
    ['empty', ['--through', '']],
    ['a word', ['--through', 'yesterday']],
    ['a date written the other way round', ['--through', '01/12/2026']],
    ['a date with a time', ['--through', '2026-12-01T00:00:00Z']],
    ['a date with a single digit month', ['--through', '2026-2-01']],
    ['a month that is not one', ['--through', '2026-13-01']],
    ['a day that is not one', ['--through', '2026-12-32']],
    ['the 30th of February', ['--through', '2026-02-30']],
    ['the 29th of February of a year that is not a leap year', ['--through', '2026-02-29']],
    ['a day after today', ['--through', '2026-12-06']],
    ['a year from now', ['--through', '2027-12-05']],
  ])('refuses a --through that is %s, with exit 1 in the command', (_name, argv) => {
    expect(() => parse(argv)).toThrow(AiPurgeArgumentError);
  });

  it('takes the real 29th of February of a leap year, and today (UTC) as the last day it may name', () => {
    const leapDay = new Date('2028-02-29T00:00:00.000Z');

    expect(parseAiPurgeArguments(['--through', '2028-02-29'], leapDay)).toMatchObject({
      command: { through: '2028-02-29' },
    });
    expect(() => parseAiPurgeArguments(['--through', '2028-02-29'], new Date('2028-02-28T23:59:59.999Z'))).toThrow(
      /future/,
    );
    expect(parse(['--through', '2026-12-05'])).toMatchObject({ command: { through: '2026-12-05' } });
  });

  it('has no other option, positional or flag: no bulk, no force, no all', () => {
    for (const extra of [['--all'], ['--force'], ['--yes'], ['2026-12-01'], ['--confirm-local']]) {
      expect(() => parse(['--through', '2026-12-01', ...extra])).toThrow(AiPurgeArgumentError);
    }
  });
});
