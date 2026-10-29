import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/**
 * Module layout gate: where a file of a business module sits, what it is called and where its errors live
 * (docs/workspace/items/be-architecture-boundaries-restructure/spec.md, "Layout trong một module" and "Từ vựng file").
 * Imports are enforced by dependency-cruiser (`pnpm arch:check`), size and complexity by ESLint; this gate checks
 * only what those tools cannot see. No ledger and no allowlist: a violation is fixed in code.
 *
 * Every rule is a pure function of a list of files (path relative to src/ with `/`, and its text), so the real tree
 * and the synthetic files of the self-tests go through the same code.
 */

interface SourceFile {
  /** Relative to src/, with `/` separators. */
  path: string;
  source: string;
}

const sourceRoot = join(process.cwd(), 'src');

/** Folder levels below a module: module → capability → functional group. */
const MAX_FOLDER_LEVELS = 2;
/** Files directly in one directory, specs included; more means the folder is split by function. */
const MAX_FILES_PER_DIRECTORY = 25;
/** The file vocabulary: every non-spec file of a business module ends with one of these. */
const FILE_SUFFIXES = [
  'module',
  'controller',
  'dto',
  'service',
  'policy',
  'repo',
  'mapper',
  'types',
  'errors',
  'http-errors',
  'api',
  'extension-points',
  'listener',
  'job',
] as const;
const CATCH_ALL_FOLDERS = ['errors', 'common', 'shared', 'utils', 'helpers'] as const;

const SUFFIX_PATTERN = new RegExp(`\\.(?:${FILE_SUFFIXES.join('|')})\\.ts$`);
const ERROR_CLASS = /\bclass\s+(\w+)\s+extends\s+\w*Error\b/g;
const RAW_SQL = /\$(?:query|execute)Raw/;

// ---------------------------------------------------------------------------------------------------------------------
// Reading the tree
// ---------------------------------------------------------------------------------------------------------------------

/** Every `.ts` file below `directory` (specs included), generated code left out. */
function listTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return entry === 'generated' ? [] : listTypeScriptFiles(path);

    return path.endsWith('.ts') ? [path] : [];
  });
}

const toSourcePath = (file: string): string => relative(sourceRoot, file).split(sep).join('/');

const isSpec = (path: string): boolean => path.endsWith('.spec.ts');
const isModuleFile = (path: string): boolean => path.startsWith('modules/');
const fileName = (path: string): string => path.slice(path.lastIndexOf('/') + 1);
const directoryOf = (path: string): string => path.slice(0, path.lastIndexOf('/'));
/** The module a path of src/modules belongs to. */
const moduleOf = (path: string): string => path.split('/')[1];

/** Blanks out comments and string/template literals so a rule matches code, not prose. */
function codeOnly(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*|'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|`(?:\\.|[^`\\])*`/g, ' ');
}

/** True when code (not a comment or a string) builds an HTTP response: `ApiException` or `HttpStatus`. */
function mentionsHttpMapping(source: string): boolean {
  return /\b(?:ApiException|HttpStatus)\b/.test(codeOnly(source));
}

/** True when the source compares an error by its class name string instead of `instanceof`. */
function matchesErrorByName(source: string): boolean {
  return /\.name\s*[!=]==\s*['"`]\w*Error['"`]/.test(source);
}

const errorClassNames = (source: string): string[] => [...source.matchAll(ERROR_CLASS)].map((match) => match[1]);

// ---------------------------------------------------------------------------------------------------------------------
// The rules: each returns its offenders, sorted; an empty list is green
// ---------------------------------------------------------------------------------------------------------------------

/** Files of a module nested deeper than module → capability → functional group. */
function tooDeep(paths: string[]): string[] {
  return paths.filter((path) => isModuleFile(path) && path.split('/').length - 3 > MAX_FOLDER_LEVELS).sort();
}

/** Directories of src/modules holding more than the cap of files, specs included. */
function crowdedDirectories(paths: string[]): string[] {
  const counts = new Map<string, number>();
  for (const directory of paths.filter(isModuleFile).map(directoryOf)) {
    counts.set(directory, (counts.get(directory) ?? 0) + 1);
  }

  return [...counts]
    .filter(([, count]) => count > MAX_FILES_PER_DIRECTORY)
    .map(([directory, count]) => `${directory}: ${count} files`)
    .sort();
}

/** Non-spec files of a module whose name ends with no suffix of the vocabulary. */
function unknownSuffixes(paths: string[]): string[] {
  return paths.filter((path) => isModuleFile(path) && !isSpec(path) && !SUFFIX_PATTERN.test(fileName(path))).sort();
}

/** Catch-all folders at src/ or src/modules/. */
function catchAllFolders(isDirectory: (path: string) => boolean): string[] {
  return ['', 'modules/'].flatMap((root) =>
    CATCH_ALL_FOLDERS.map((name) => `${root}${name}`).filter((path) => isDirectory(path)),
  );
}

/** Error classes of a module declared outside a `*.errors.ts` file. */
function errorClassesOutsideErrorFiles(files: SourceFile[]): string[] {
  return files
    .filter(({ path }) => isModuleFile(path) && !path.endsWith('.errors.ts'))
    .flatMap(({ path, source }) => errorClassNames(source).map((name) => `${path}: ${name}`))
    .sort();
}

/** Error names declared by more than one class inside one module. */
function duplicateErrorNames(files: SourceFile[]): string[] {
  const declarations = new Map<string, string[]>();
  for (const { path, source } of files.filter((file) => isModuleFile(file.path))) {
    for (const name of errorClassNames(source)) {
      const key = `${moduleOf(path)}: ${name}`;
      declarations.set(key, [...(declarations.get(key) ?? []), path]);
    }
  }

  return [...declarations]
    .filter(([, paths]) => paths.length > 1)
    .map(([key, paths]) => `${key} in ${paths.sort().join(', ')}`)
    .sort();
}

/** Business error files that name `ApiException` or `HttpStatus` at all: HTTP mapping goes in `*.http-errors.ts`. */
function httpMappingInErrorFiles(files: SourceFile[]): string[] {
  return files
    .filter(
      ({ path, source }) =>
        isModuleFile(path) && path.endsWith('.errors.ts') && /\b(?:ApiException|HttpStatus)\b/.test(source),
    )
    .map(({ path }) => path)
    .sort();
}

/** Business services whose code (not comments or strings) uses `ApiException` or `HttpStatus`. */
function httpMappingInServices(files: SourceFile[]): string[] {
  return files
    .filter(({ path, source }) => isModuleFile(path) && path.endsWith('.service.ts') && mentionsHttpMapping(source))
    .map(({ path }) => path)
    .sort();
}

/** Files anywhere in src (composition roots and infrastructure too) that match an error by its name string. */
function errorsMatchedByName(files: SourceFile[]): string[] {
  return files
    .filter(({ source }) => matchesErrorByName(source))
    .map(({ path }) => path)
    .sort();
}

/** Files of a module that run raw SQL without being a repository. */
function rawSqlOutsideRepositories(files: SourceFile[]): string[] {
  return files
    .filter(({ path, source }) => isModuleFile(path) && !path.endsWith('.repo.ts') && RAW_SQL.test(source))
    .map(({ path }) => path)
    .sort();
}

/**
 * H8-RV-01 (kept from the old structure gate): a unit spec of a module stays at or under 400 physical lines; a longer one
 * is split by use case, its shared harness in test/support/. Each finding names the spec and its count.
 */
const MAX_MODULE_SPEC_LINES = 400;
function oversizedModuleSpecs(specs: SourceFile[]): string[] {
  return specs
    .filter(({ path }) => isModuleFile(path) && isSpec(path))
    .map(({ path, source }) => ({ path, lines: source.split(/\r?\n/).length - (source.endsWith('\n') ? 1 : 0) }))
    .filter(({ lines }) => lines > MAX_MODULE_SPEC_LINES)
    .map(({ path, lines }) => `${path}: ${lines} lines`)
    .sort();
}

// ---------------------------------------------------------------------------------------------------------------------
// The gate on the real tree
// ---------------------------------------------------------------------------------------------------------------------

describe('module layout (src/modules)', () => {
  const allPaths = listTypeScriptFiles(sourceRoot).map(toSourcePath);
  const sources: SourceFile[] = allPaths
    .filter((path) => !isSpec(path))
    .map((path) => ({ path, source: readFileSync(join(sourceRoot, path), 'utf8') }));

  it('reads the business modules', () => {
    expect(allPaths.filter(isModuleFile).length).toBeGreaterThan(0);
  });

  it(`nests at most ${MAX_FOLDER_LEVELS} folder levels below a module (capability, then functional group)`, () => {
    expect(tooDeep(allPaths)).toEqual([]);
  });

  it(`keeps at most ${MAX_FILES_PER_DIRECTORY} files in a directory, specs included`, () => {
    expect(crowdedDirectories(allPaths)).toEqual([]);
  });

  it('names every non-spec file with a suffix of the file vocabulary', () => {
    expect(unknownSuffixes(allPaths)).toEqual([]);
  });

  it('has no catch-all errors/common/shared/utils/helpers folder at src/ or src/modules/', () => {
    expect(catchAllFolders((path) => existsSync(join(sourceRoot, path)))).toEqual([]);
  });

  it('declares business error classes only in *.errors.ts', () => {
    expect(errorClassesOutsideErrorFiles(sources)).toEqual([]);
  });

  it('keeps one class per error name inside a module', () => {
    expect(duplicateErrorNames(sources)).toEqual([]);
  });

  it('keeps ApiException and HttpStatus out of *.errors.ts', () => {
    expect(httpMappingInErrorFiles(sources)).toEqual([]);
  });

  it('keeps ApiException and HttpStatus out of the code of *.service.ts', () => {
    expect(httpMappingInServices(sources)).toEqual([]);
  });

  it('matches errors with instanceof, never by their name string, in all of src', () => {
    expect(errorsMatchedByName(sources)).toEqual([]);
  });

  it('runs raw SQL ($queryRaw, $executeRaw, …) only in *.repo.ts', () => {
    expect(rawSqlOutsideRepositories(sources)).toEqual([]);
  });

  it(`keeps every unit spec of a module at or under ${MAX_MODULE_SPEC_LINES} lines (H8-RV-01)`, () => {
    const specs = allPaths
      .filter((path) => isModuleFile(path) && isSpec(path))
      .map((path) => ({ path, source: readFileSync(join(sourceRoot, path), 'utf8') }));

    expect(specs.length).toBeGreaterThan(0);
    expect(oversizedModuleSpecs(specs)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// The same rules on synthetic files
// ---------------------------------------------------------------------------------------------------------------------

describe('module layout rules on synthetic files', () => {
  const file = (path: string, source = ''): SourceFile => ({ path, source });

  it('counts folder levels below the module and ignores files outside src/modules', () => {
    expect(
      tooDeep([
        'modules/sample/sample.module.ts',
        'modules/sample/capability/use-case/use-case.service.ts',
        'modules/sample/capability/use-case/deeper/deeper.service.ts',
        'infrastructure/a/b/c/d.ts',
      ]),
    ).toEqual(['modules/sample/capability/use-case/deeper/deeper.service.ts']);
  });

  it('names each directory over the file cap with its count, and lets the cap pass', () => {
    const many = (directory: string, count: number) =>
      Array.from({ length: count }, (_, index) => `${directory}/file-${index}.service.ts`);

    expect(
      crowdedDirectories([
        ...many('modules/sample/full', MAX_FILES_PER_DIRECTORY),
        ...many('modules/sample/over', MAX_FILES_PER_DIRECTORY + 1),
        ...many('infrastructure/big', MAX_FILES_PER_DIRECTORY + 1),
      ]),
    ).toEqual([`modules/sample/over: ${MAX_FILES_PER_DIRECTORY + 1} files`]);
  });

  it('accepts every suffix of the vocabulary and any spec, and names the rest', () => {
    const accepted = FILE_SUFFIXES.map((suffix) => `modules/sample/a.${suffix}.ts`);

    expect(
      unknownSuffixes([
        ...accepted,
        'modules/sample/any-behaviour.spec.ts',
        'modules/sample/sample.arguments.ts',
        'modules/sample/hidden-prompt.ts',
        'modules/sample/sample-errors.ts',
        'infrastructure/config/env-config.ts',
      ]),
    ).toEqual([
      'modules/sample/hidden-prompt.ts',
      'modules/sample/sample-errors.ts',
      'modules/sample/sample.arguments.ts',
    ]);
  });

  it('looks for catch-all folders at src/ and src/modules/ only', () => {
    const existing = new Set(['shared', 'modules/utils', 'modules/sample/errors']);

    expect(catchAllFolders((path) => existing.has(path))).toEqual(['shared', 'modules/utils']);
  });

  it('flags an error class outside *.errors.ts, and not one inside it or outside src/modules', () => {
    const errorClass = 'export class SampleError extends Error {}';

    expect(
      errorClassesOutsideErrorFiles([
        file('modules/sample/sample.service.ts', errorClass),
        file('modules/sample/sample.policy.ts', 'class Bad extends DomainError {}'),
        file('modules/sample/sample.errors.ts', errorClass),
        file('modules/sample/sample.http-errors.ts', 'class Mapped extends HttpError {}'),
        file('infrastructure/database/database.ts', 'class TransientDatabaseError extends Error {}'),
      ]),
    ).toEqual([
      'modules/sample/sample.http-errors.ts: Mapped',
      'modules/sample/sample.policy.ts: Bad',
      'modules/sample/sample.service.ts: SampleError',
    ]);
  });

  it('flags the same error name twice in one module, not in two modules', () => {
    const errorClass = 'export class SampleError extends Error {}';

    expect(
      duplicateErrorNames([
        file('modules/sample/public/sample.errors.ts', errorClass),
        file('modules/sample/alpha/alpha.errors.ts', errorClass),
        file('modules/other/other.errors.ts', errorClass),
      ]),
    ).toEqual(['sample: SampleError in modules/sample/alpha/alpha.errors.ts, modules/sample/public/sample.errors.ts']);
  });

  it('flags HTTP words in a business error file and leaves *.http-errors.ts alone', () => {
    const http = "import { HttpStatus } from '@nestjs/common';";

    expect(
      httpMappingInErrorFiles([
        file('modules/sample/sample.errors.ts', http),
        file('modules/sample/sample.http-errors.ts', http),
        file('modules/sample/clean.errors.ts', 'export class SampleError extends Error {}'),
      ]),
    ).toEqual(['modules/sample/sample.errors.ts']);
  });

  it('flags ApiException or HttpStatus as code of a business service, not in comments, strings or controllers', () => {
    expect(mentionsHttpMapping('throw new ApiException(HttpStatus.NOT_FOUND, { code: "X" });')).toBe(true);
    expect(mentionsHttpMapping("import { HttpStatus } from '@nestjs/common';")).toBe(true);
    expect(mentionsHttpMapping('// The controller maps this to an ApiException.\nconst x = 1;')).toBe(false);
    expect(mentionsHttpMapping('/* HttpStatus is chosen by the controller */ const x = 1;')).toBe(false);
    expect(mentionsHttpMapping("const message = 'HttpStatus and ApiException are HTTP concerns';")).toBe(false);
    expect(mentionsHttpMapping('const message = `ApiException`;')).toBe(false);

    const http = 'throw new ApiException(HttpStatus.CONFLICT);';
    expect(
      httpMappingInServices([
        file('modules/sample/sample.service.ts', http),
        file('modules/sample/alpha/alpha.service.ts', '// mapped to an ApiException by the controller'),
        file('modules/sample/sample.controller.ts', http),
        file('infrastructure/mail/mail.service.ts', http),
      ]),
    ).toEqual(['modules/sample/sample.service.ts']);
  });

  it('flags a comparison of the error name string in any file of src, and not instanceof', () => {
    expect(matchesErrorByName("if (error.name === 'EnvironmentValidationError') return;")).toBe(true);
    expect(matchesErrorByName('if (error instanceof EnvironmentValidationError) return;')).toBe(false);
    expect(
      errorsMatchedByName([
        file('main.ts', "if (error.name !== 'SampleError') throw error;"),
        file('infrastructure/config/sample.ts', 'if (error.name === `ConfigError`) return;'),
        file('modules/sample/sample.service.ts', 'if (error instanceof SampleError) return;'),
      ]),
    ).toEqual(['infrastructure/config/sample.ts', 'main.ts']);
  });

  it('flags raw SQL outside a repository of a module', () => {
    expect(
      rawSqlOutsideRepositories([
        file('modules/sample/sample.repo.ts', 'await tx.$queryRaw`SELECT 1`;'),
        file('modules/sample/sample.service.ts', 'await tx.$executeRawUnsafe(sql);'),
        file('modules/sample/sample.policy.ts', 'const label = "raw";'),
        file('infrastructure/database/health.ts', 'await prisma.$queryRaw`SELECT 1`;'),
      ]),
    ).toEqual(['modules/sample/sample.service.ts']);
  });

  it('names a module spec over 400 lines with its count, lets 400 pass and ignores specs outside src/modules', () => {
    const lines = (count: number): string => 'x\n'.repeat(count);

    expect(
      oversizedModuleSpecs([
        file('modules/sample/edge.spec.ts', lines(400)),
        file('modules/sample/over.spec.ts', lines(401)),
        file('infrastructure/config/env-schema.spec.ts', lines(612)),
      ]),
    ).toEqual(['modules/sample/over.spec.ts: 401 lines']);
  });
});
