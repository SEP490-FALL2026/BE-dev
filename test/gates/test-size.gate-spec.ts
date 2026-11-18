import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/**
 * The size of a spec that runs against a database or a server: `test/integration`, `test/http` and `test/e2e` hold at most 800 physical
 * lines per file. A longer file mixes use cases that each want their own `beforeAll` and their own failure, and its harness grows into
 * the spec; it is split by use case, the shared set-up going to `test/support/`. There is no list of exceptions: the unit specs of a
 * module have their own cap (`module-layout`, 400) and `test/support` has its own (`test-support-structure`, 400).
 */
const ROOT = process.cwd();
const MAX_SPEC_LINES = 800;
const SPEC_FOLDERS = ['test/integration', 'test/http', 'test/e2e'] as const;

const linesIn = (text: string): number => text.split('\n').length - (text.endsWith('\n') ? 1 : 0);

function tsFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);

    return statSync(path).isDirectory() ? tsFiles(path) : path.endsWith('.ts') ? [path] : [];
  });
}

/** `path (lines)` of every file whose line count is over the cap, longest first. */
function filesOverCap(files: Readonly<Record<string, string>>, cap: number): string[] {
  return Object.entries(files)
    .map(([path, text]) => [path, linesIn(text)] as const)
    .filter(([, lines]) => lines > cap)
    .sort(([, a], [, b]) => b - a)
    .map(([path, lines]) => `${path} (${lines})`);
}

describe('the size of a spec that runs against a database or a server', () => {
  it(`keeps every file of ${SPEC_FOLDERS.join(', ')} at or under ${MAX_SPEC_LINES} lines`, () => {
    const files = Object.fromEntries(
      SPEC_FOLDERS.flatMap((folder) =>
        tsFiles(join(ROOT, folder)).map((path) => [
          relative(ROOT, path).split(sep).join('/'),
          readFileSync(path, 'utf8'),
        ]),
      ),
    );

    expect(Object.keys(files).length).toBeGreaterThan(300);
    expect(filesOverCap(files, MAX_SPEC_LINES)).toEqual([]);
  });

  it('counts physical lines, so a long file is named with its count and a file at the cap passes', () => {
    const text = (lines: number): string => `${'x\n'.repeat(lines)}`;

    expect(
      filesOverCap(
        { 'a.ts': text(MAX_SPEC_LINES), 'b.ts': text(MAX_SPEC_LINES + 1), 'c.ts': text(MAX_SPEC_LINES + 40) },
        MAX_SPEC_LINES,
      ),
    ).toEqual([`c.ts (${MAX_SPEC_LINES + 40})`, `b.ts (${MAX_SPEC_LINES + 1})`]);
    expect(filesOverCap({ 'no-final-newline.ts': 'x\n'.repeat(MAX_SPEC_LINES - 1) + 'x' }, MAX_SPEC_LINES)).toEqual([]);
  });
});
