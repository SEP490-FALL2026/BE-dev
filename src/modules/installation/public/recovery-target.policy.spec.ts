import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DATA_READS_LABEL,
  DATA_REPRESENTATIONS,
  formatRecoveryTarget,
  judgeRecoveryTarget,
  readsOfLabels,
  RECOVERY_TARGET_EXIT,
  RecoveryTargetFacts,
  recoveryTargetJson,
} from './recovery-target.policy';

const FINAL_READS = ['access-request-null-cost-center'];
/** What `docker image inspect --format '{{json .Config.Labels}}'` prints for an image of this source. */
const FINAL_LABELS = JSON.stringify({ [DATA_READS_LABEL]: FINAL_READS.join(' ') });
const facts = (rows: number, migrated = true): RecoveryTargetFacts => ({
  migrated,
  rows: { 'access-request-null-cost-center': rows },
});

describe('recovery target labels (P04-CPE-04)', () => {
  it('reads nothing from an image without labels or without the data-reads label: the compatibility image fba4dfe', () => {
    expect(readsOfLabels('null')).toEqual([]);
    expect(readsOfLabels('{}')).toEqual([]);
    expect(readsOfLabels('{"org.opencontainers.image.version":"24"}')).toEqual([]);
  });

  it('reads the declared representations, space-separated, duplicates removed, unknown ones kept', () => {
    expect(readsOfLabels(FINAL_LABELS)).toEqual(FINAL_READS);
    expect(
      readsOfLabels(
        JSON.stringify({
          [DATA_READS_LABEL]: ' access-request-null-cost-center  later-shape access-request-null-cost-center ',
        }),
      ),
    ).toEqual(['access-request-null-cost-center', 'later-shape']);
  });

  it('refuses anything that is not the labels of an image: the way back is then unknown, never assumed', () => {
    for (const json of ['', 'not json', '[]', '"text"', '42', '{"a":1}', '{"a":null}']) {
      expect(() => readsOfLabels(json)).toThrow(/labels of the image/);
    }
    for (const value of ['Access-Request', 'a_b', 'x;rm', `${'a'.repeat(65)}`, '-lead']) {
      expect(() => readsOfLabels(JSON.stringify({ [DATA_READS_LABEL]: value }))).toThrow(/not a representation/);
    }
  });
});

describe('recovery target judgement (P04-CPE-04)', () => {
  it('lets an image that declares nothing serve a database with no row of any representation (fba4dfe before any write)', () => {
    const report = judgeRecoveryTarget(facts(0), []);

    expect(report).toEqual({ status: 'COMPATIBLE', reads: [], held: [] });
    expect(RECOVERY_TARGET_EXIT[report.status]).toBe(0);
  });

  it('refuses that image once one sent request has no Cost Center — whenever the row was written, before or after deploy', () => {
    const report = judgeRecoveryTarget(facts(1), []);

    expect(report).toEqual({
      status: 'INCOMPATIBLE',
      reads: [],
      held: [{ representation: 'access-request-null-cost-center', rows: 1, readable: false }],
    });
    expect(RECOVERY_TARGET_EXIT[report.status]).toBe(2);
  });

  it('lets an image that declares the representation serve it (a later rollback to the final release)', () => {
    expect(judgeRecoveryTarget(facts(7), FINAL_READS)).toEqual({
      status: 'COMPATIBLE',
      reads: FINAL_READS,
      held: [{ representation: 'access-request-null-cost-center', rows: 7, readable: true }],
    });
    // A representation the image does not know of yet changes nothing.
    expect(judgeRecoveryTarget(facts(7), ['later-shape', ...FINAL_READS]).status).toBe('COMPATIBLE');
  });

  it('gives a database no release ran on no way back at all, whatever the image declares (fresh install over an old release state)', () => {
    for (const reads of [[], FINAL_READS]) {
      const report = judgeRecoveryTarget(facts(0, false), reads);
      expect(report.status).toBe('NO_HISTORY');
      expect(RECOVERY_TARGET_EXIT[report.status]).toBe(3);
    }
  });

  it('reports names and counts only, and says what the operator must not do', () => {
    const text = formatRecoveryTarget(judgeRecoveryTarget(facts(3), []));

    expect(text).toMatch(/^Recovery target: INCOMPATIBLE/);
    expect(text).toMatch(/Do not bring it back: fix forward/);
    expect(text).toContain('The image declares: none.');
    expect(text).toContain('access-request-null-cost-center: 3 row(s), NOT read by the image');
    expect(formatRecoveryTarget(judgeRecoveryTarget(facts(0, false), []))).toMatch(/^Recovery target: NO_HISTORY/);
    expect(formatRecoveryTarget(judgeRecoveryTarget(facts(3), FINAL_READS))).toMatch(
      /^Recovery target: COMPATIBLE[\s\S]*The image declares: access-request-null-cost-center\.[\s\S]*3 row\(s\), read by the image/,
    );
    const report = judgeRecoveryTarget(facts(3), []);
    expect(JSON.parse(recoveryTargetJson(report))).toEqual(report);
  });
});

describe('the image declares what this source reads (P04-CPE-04)', () => {
  // A Windows checkout (core.autocrlf) has CRLF line endings; the patterns below read lines.
  const dockerfile = readFileSync(join(process.cwd(), 'Dockerfile'), 'utf8').replace(/\r\n/g, '\n');
  const runtimeStage = dockerfile.slice(dockerfile.search(/^FROM \S+ AS runtime$/m));

  it('labels the runtime stage — the only stage whose labels reach the image — with exactly the representations of this source', () => {
    // `runtime` is the last stage: nothing after it replaces its labels.
    expect(runtimeStage.match(/^FROM /gm)).toHaveLength(1);
    const labels = [...runtimeStage.matchAll(/^LABEL ([a-z0-9.-]+)="([^"]*)"$/gm)].map((match) => [match[1], match[2]]);

    expect(labels).toEqual([[DATA_READS_LABEL, Object.keys(DATA_REPRESENTATIONS).join(' ')]]);
    // The stage before it does not carry the label: only the runtime image is deployed (deploy.yml, target runtime).
    expect(dockerfile.slice(0, dockerfile.search(/^FROM \S+ AS runtime$/m))).not.toContain(DATA_READS_LABEL);
  });

  it('names the label as Docker asks: lower-case alphanumerics, dots and hyphens, reverse-DNS prefix', () => {
    expect(DATA_READS_LABEL).toMatch(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/);
    expect(DATA_READS_LABEL.split('.').length).toBeGreaterThan(2);
  });
});
