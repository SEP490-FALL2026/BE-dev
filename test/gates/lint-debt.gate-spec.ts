import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, sep } from 'node:path';
import { runScript, stopCliProcesses } from '../support/cli-process';

/**
 * TG-2 (docs/rules/module-structure.md, R8): the size and complexity rules stay at the thresholds the rule file names, and the debt
 * recorded in `eslint-suppressions.json` can only shrink. What is read here is what ESLint really applies to each file (the flat config
 * after every override is merged, `scripts/arch/eslint-effective-config.mjs`), not the text of `eslint.config.mjs`: a later override
 * that makes a rule a warning or turns it off changes the answer, so it turns this gate red. The size rules are errors at 12 / 60 / 8 (and
 * 500 lines, depth 4); the three type rules are errors in `src`, `test` and `scripts`; nothing turns the two size rules off but the flat
 * `*.http-errors.ts` answer tables; a directive that silences nothing is an error; the `lint` script lowers nothing; and no
 * `eslint-disable` for the three rules is left in `src`. What is still suppressed is counted per rule and per module against the
 * ceilings below, which are the numbers the last remediation reached. A ceiling is lowered in the same change that removes suppressions
 * (`pnpm lint:prune` removes them as they are fixed) and never raised: a violation that is new, in a file that had none, fails
 * `pnpm lint` before it can reach this gate. `max-params` has no debt left: no file may carry a suppression of it, so a constructor or
 * a function with more than 8 parameters is split, never recorded.
 */
const ROOT = join(__dirname, '..', '..');

/** The most suppressions each rule and each part of the codebase may still carry. Lower these when you fix code, never raise them. */
const CEILINGS = {
  complexity: 56,
  'max-lines-per-function': 51,
  /** `complexity` and `max-lines-per-function` together: a function that is too long and too branched is two findings. */
  complexityAndLines: 107,
  /** Every suppression in `src/modules/requests`, the module that carries most of the debt. */
  requests: 36,
} as const;

/** The size rules of R8 as ESLint applies them to a file of `src` that is not a spec: severity 2 (error) and the options. */
const SIZE_RULES = {
  'max-lines': [2, { max: 500, skipBlankLines: true, skipComments: true }],
  'max-lines-per-function': [2, { max: 60, skipBlankLines: true, skipComments: true }],
  complexity: [2, 12],
  'max-params': [2, 8],
  'max-depth': [2, 4],
} as const;

/** The two the flat http-errors tables turn off (one branch per error; their length is the number of errors, not logic). */
const OFF_FOR_ANSWER_TABLES = ['complexity', 'max-lines-per-function'] as const;

/** Errors in every file of `src`, `test` and `scripts`. */
const TYPE_RULES = [
  '@typescript-eslint/no-explicit-any',
  '@typescript-eslint/no-floating-promises',
  '@typescript-eslint/no-unsafe-argument',
] as const;

const A_SRC_FILE = 'src/app/configure-application.ts';
const A_TEST_FILE = 'test/gates/lint-debt.gate-spec.ts';
const AN_ANSWER_TABLE = 'src/modules/requests/access-request/access-request.http-errors.ts';

type Suppressions = Record<string, Record<string, { count: number }>>;

/** What ESLint applies to one file: `[severity, ...options]` of each rule asked for, and `reportUnusedDisableDirectives` (2 = error). */
interface Applied {
  rules: Record<string, readonly unknown[]>;
  unused: unknown;
}

const read = (path: string): string => readFileSync(join(ROOT, path), 'utf8');
const suppressions = (): Suppressions => JSON.parse(read('eslint-suppressions.json')) as Suppressions;

const totalOf = (rule: string, only?: (file: string) => boolean): number =>
  Object.entries(suppressions())
    .filter(([file]) => !only || only(file))
    .reduce((sum, [, rules]) => sum + (rules[rule]?.count ?? 0), 0);

const sourceFiles = (dir: string): string[] =>
  readdirSync(join(ROOT, dir)).flatMap((entry) => {
    const path = `${dir}/${entry}`;

    return statSync(join(ROOT, path)).isDirectory() ? sourceFiles(path) : path.endsWith('.ts') ? [path] : [];
  });

const isAnswerTable = (file: string): boolean => /^src\/modules\/.*\.http-errors\.ts$/.test(file);
const isSpec = (file: string): boolean => file.endsWith('.spec.ts');

// TG-2
describe('lint debt: the size and complexity rules and the suppressions that remain', () => {
  /** What ESLint applies to every `.ts` file of `src`, `test` and `scripts` (`generated` aside), read in a process of its own. */
  let applied: Record<string, Applied | null>;
  const appliedTo = (file: string): Applied => {
    const found = applied[file];
    if (!found) throw new Error(`ESLint has no configuration for ${file}`);

    return found;
  };

  beforeAll(async () => {
    const names = [...Object.keys(SIZE_RULES), ...TYPE_RULES].join(',');
    // a child process is started through the one helper the rules allow (docs/rules/operational-commands.md, rule 8)
    const { code, stdout, stderr } = await runScript(
      'scripts/arch/eslint-effective-config.mjs',
      ['--rules', names, 'src', 'test', 'scripts'],
      { cwd: ROOT, environment: {}, timeoutMs: 110000 },
    );
    if (code !== 0) throw new Error(`eslint-effective-config exited with ${code}: ${stderr}`);
    applied = JSON.parse(stdout) as Record<string, Applied | null>;
  }, 120000);

  afterAll(() => {
    stopCliProcesses();
  });

  it('reads every file of src, test and scripts: none is ignored by the configuration', () => {
    const files = Object.keys(applied);

    expect(files.length).toBeGreaterThan(1500);
    expect(files.filter((file) => applied[file] === null)).toEqual([]);
    expect([A_SRC_FILE, A_TEST_FILE, AN_ANSWER_TABLE].filter((file) => !(file in applied))).toEqual([]);
  });

  it.each(Object.entries(SIZE_RULES))(
    'applies %s as an error, at its threshold, to every file of src that is not a spec',
    (rule, expected) => {
      const files = Object.keys(applied).filter((file) => file.startsWith('src/') && !isSpec(file));
      const wrong = files.filter((file) => {
        const off = isAnswerTable(file) && (OFF_FOR_ANSWER_TABLES as readonly string[]).includes(rule);

        return off
          ? appliedTo(file).rules[rule]?.[0] !== 0
          : JSON.stringify(appliedTo(file).rules[rule]) !== JSON.stringify(expected);
      });

      expect(files.length).toBeGreaterThan(1000);
      expect(wrong).toEqual([]);
    },
  );

  it('keeps complexity at 12, a function at 60 lines without blanks or comments, and 8 parameters, all as errors, in a file of src', () => {
    const { rules } = appliedTo(A_SRC_FILE);

    expect(rules.complexity).toEqual([2, 12]);
    expect(rules['max-lines-per-function']).toEqual([2, { max: 60, skipBlankLines: true, skipComments: true }]);
    expect(rules['max-params']).toEqual([2, 8]);
    expect(rules['max-lines']).toEqual([2, { max: 500, skipBlankLines: true, skipComments: true }]);
    expect(rules['max-depth']).toEqual([2, 4]);
  });

  it('turns the two size rules off only for the flat http-errors tables, and leaves the other rules on for them', () => {
    const files = Object.keys(applied).filter((file) => file.startsWith('src/'));
    const tables = sourceFiles('src').filter(isAnswerTable);
    const { rules } = appliedTo(AN_ANSWER_TABLE);

    for (const rule of OFF_FOR_ANSWER_TABLES) {
      const off = files.filter((file) => (applied[file]?.rules[rule]?.[0] ?? 2) === 0);

      expect(off.sort()).toEqual(tables.sort());
    }
    expect(tables.length).toBeGreaterThan(10);
    expect(OFF_FOR_ANSWER_TABLES.map((rule) => rules[rule]?.[0])).toEqual([0, 0]);
    expect(rules['max-params']).toEqual([2, 8]);
    expect(rules['max-lines']).toEqual([2, { max: 500, skipBlankLines: true, skipComments: true }]);
    expect(rules['max-depth']).toEqual([2, 4]);
  });

  it('applies no-explicit-any, no-floating-promises and no-unsafe-argument as errors to every file of src, test and scripts', () => {
    const files = Object.keys(applied);
    const wrong = files.flatMap((file) =>
      TYPE_RULES.filter((rule) => JSON.stringify(appliedTo(file).rules[rule]) !== JSON.stringify([2])).map(
        (rule) => `${file} ${rule}`,
      ),
    );

    expect(files.some((file) => file.startsWith('test/'))).toBe(true);
    expect(appliedTo(A_TEST_FILE).rules[TYPE_RULES[0]]).toEqual([2]);
    expect(wrong).toEqual([]);
  });

  it('has no rule of R8 at the warning level in any file', () => {
    const warnings = Object.entries(applied).flatMap(([file, found]) =>
      Object.entries(found?.rules ?? {})
        .filter(([, setting]) => setting[0] === 1 || setting[0] === 'warn')
        .map(([rule]) => `${file} ${rule}`),
    );

    expect(warnings).toEqual([]);
  });

  it('reports a directive that silences nothing as an error, in every file', () => {
    const wrong = Object.entries(applied)
      .filter(([, found]) => found?.unused !== 2)
      .map(([file]) => file);

    expect(wrong).toEqual([]);
  });

  it('runs lint as it is: no --max-warnings, and no option that lowers a severity or hides a rule', () => {
    const scripts = (JSON.parse(read('package.json')) as { scripts: Record<string, string> }).scripts;

    expect(scripts.lint).toMatch(/^eslint "\{src,test,scripts\}\/\*\*\/\*\.ts"$/);
    expect(scripts.lint).not.toMatch(
      /--max-warnings|--quiet|--rule\b|--no-inline-config|--config\b|\s-c\s|--no-eslintrc/,
    );
    expect(scripts['lint:prune']).toContain('--prune-suppressions');
    expect(scripts['lint:prune']).not.toContain('--suppress-all');
  });

  it('has no eslint-disable for the three rules left in src', () => {
    const disabled = sourceFiles('src').filter((file) =>
      /eslint-disable[^\n]*\b(complexity|max-lines-per-function|max-params)\b/.test(read(file)),
    );

    expect(disabled).toEqual([]);
  });

  it('suppresses only the two size and complexity rules, in files that exist, with a count that is at least one', () => {
    const entries = Object.entries(suppressions());
    const rules = new Set(entries.flatMap(([, perRule]) => Object.keys(perRule)));
    const missing = entries.map(([file]) => file).filter((file) => !existsSync(join(ROOT, file.split('/').join(sep))));
    const empty = entries.flatMap(([file, perRule]) =>
      Object.entries(perRule)
        .filter(([, { count }]) => !(count >= 1))
        .map(([rule]) => `${file} ${rule}`),
    );

    expect([...rules].sort()).toEqual(['complexity', 'max-lines-per-function']);
    expect(missing).toEqual([]);
    expect(empty).toEqual([]);
  });

  it('has no max-params suppression left in any file: nothing takes more than 8 parameters', () => {
    const files = Object.entries(suppressions())
      .filter(([, perRule]) => 'max-params' in perRule)
      .map(([file]) => file);

    expect(files).toEqual([]);
    expect(totalOf('max-params')).toBe(0);
  });

  it.each(['complexity', 'max-lines-per-function'] as const)(
    'carries no more %s suppressions than the ceiling',
    (rule) => {
      expect(totalOf(rule)).toBeLessThanOrEqual(CEILINGS[rule]);
    },
  );

  it('carries no more complexity and line suppressions together than the ceiling', () => {
    expect(totalOf('complexity') + totalOf('max-lines-per-function')).toBeLessThanOrEqual(CEILINGS.complexityAndLines);
  });

  it('carries no more suppressions in the requests module than the ceiling', () => {
    const inRequests = (file: string): boolean => file.startsWith('src/modules/requests/');
    const total = ['complexity', 'max-lines-per-function'].reduce((sum, rule) => sum + totalOf(rule, inRequests), 0);

    expect(total).toBeLessThanOrEqual(CEILINGS.requests);
  });

  it('has a ceiling that is the number reached, so a fixed violation cannot be given back', () => {
    const inRequests = (file: string): boolean => file.startsWith('src/modules/requests/');

    expect(totalOf('complexity')).toBe(CEILINGS.complexity);
    expect(totalOf('max-lines-per-function')).toBe(CEILINGS['max-lines-per-function']);
    expect(totalOf('complexity', inRequests) + totalOf('max-lines-per-function', inRequests)).toBe(CEILINGS.requests);
  });
});
