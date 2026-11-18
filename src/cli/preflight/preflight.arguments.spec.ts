import { DATA_READS_LABEL } from '../../modules/installation/public/recovery-target.policy';
import { parsePreflightArguments, PreflightArgumentError, PREFLIGHT_USAGE } from './preflight.arguments';

const FINAL_READS = ['access-request-null-cost-center'];
/** What `docker image inspect --format '{{json .Config.Labels}}'` prints for an image of this source. */
const FINAL_LABELS = JSON.stringify({ [DATA_READS_LABEL]: FINAL_READS.join(' ') });

describe('migration preflight arguments', () => {
  it('takes --json and --help, ignores the -- pnpm forwards, and refuses anything else', () => {
    expect(parsePreflightArguments([])).toEqual({ help: false, json: false });
    expect(parsePreflightArguments(['--', '--json'])).toEqual({ help: false, json: true });
    expect(parsePreflightArguments(['--help'])).toEqual({ help: true });
    expect(() => parsePreflightArguments(['--repair'])).toThrow(/Unknown option/);
    expect(PREFLIGHT_USAGE).toMatch(/Exit codes: 0 .* 2 .* 1/s);
  });
});

describe('ops:preflight --recovery-target arguments (P04-CPE-04)', () => {
  it('takes the labels of the image, with or without --json, and keeps the preflight form unchanged', () => {
    expect(parsePreflightArguments(['--recovery-target', 'null'])).toEqual({
      help: false,
      json: false,
      recoveryTarget: [],
    });
    expect(parsePreflightArguments(['--', '--json', '--recovery-target', FINAL_LABELS])).toEqual({
      help: false,
      json: true,
      recoveryTarget: FINAL_READS,
    });
    expect(parsePreflightArguments(['--json'])).toStrictEqual({ help: false, json: true });
    expect(PREFLIGHT_USAGE).toMatch(/--recovery-target <labels>[\s\S]*Exit 0 it can; 2 it cannot[\s\S]*3 no migration/);
  });

  it('refuses labels it cannot read, and a missing value, as argument errors (exit 1: nothing judged)', () => {
    expect(() => parsePreflightArguments(['--recovery-target', 'not json'])).toThrow(PreflightArgumentError);
    expect(() => parsePreflightArguments(['--recovery-target'])).toThrow(PreflightArgumentError);
  });
});
