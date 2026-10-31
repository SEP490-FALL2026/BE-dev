import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, posix, relative, sep } from 'node:path';
import * as ts from 'typescript';

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
/** R3: folders that name a technical layer, not a function: forbidden at every level below a module. */
const TECHNICAL_LAYER_FOLDERS: ReadonlySet<string> = new Set([
  'mappers',
  'dto',
  'dtos',
  'policies',
  'services',
  'repos',
  'types',
  'errors',
  'controllers',
  'common',
  'shared',
  'utils',
  'helpers',
]);

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

// R2: one query at a time on a transaction client. `Promise.all` on the client of a transaction starts several statements on one
// connection: pg 8.23 queues them and prints a deprecation warning ("Calling client.query() when the client is already executing a
// query is deprecated and will be removed in pg@9.0"), so nothing is gained, the order the statements run in is only the array order,
// and a failing statement leaves the others queued in a transaction that is already aborted. Reads on the pool (`this.prisma`) use
// separate connections and are fine.
const CONCURRENT_CALLS = new Set(['all', 'allSettled', 'race', 'any']);
const TRANSACTION_RUNNERS = new Set(['run', '$transaction']);

/** The part of `expression` that decides which client it names: the left of `??`/`||`, the condition of `?:`, the inside of `( )`. */
function leadingOperand(expression: ts.Expression): ts.Expression {
  let current = expression;
  for (;;) {
    if (ts.isParenthesizedExpression(current) || ts.isAsExpression(current) || ts.isNonNullExpression(current)) {
      current = current.expression;
    } else if (
      ts.isBinaryExpression(current) &&
      [ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.BarBarToken].includes(current.operatorToken.kind)
    ) {
      current = current.left;
    } else if (ts.isConditionalExpression(current)) {
      current = current.condition;
    } else {
      return current;
    }
  }
}

/** Identifier references (not property names, not declarations) in `nodes`, with the names declared inside them. */
function referencesIn(nodes: readonly ts.Node[]): { used: ts.Identifier[]; declared: Set<string> } {
  const used: ts.Identifier[] = [];
  const declared = new Set<string>();
  const visit = (inner: ts.Node): void => {
    if ((ts.isParameter(inner) || ts.isVariableDeclaration(inner)) && ts.isIdentifier(inner.name)) {
      declared.add(inner.name.text);
    }
    if (ts.isIdentifier(inner)) {
      const parent = inner.parent;
      const isName =
        (ts.isPropertyAccessExpression(parent) && parent.name === inner) ||
        (ts.isPropertyAssignment(parent) && parent.name === inner) ||
        ((ts.isParameter(parent) || ts.isVariableDeclaration(parent)) && parent.name === inner);
      if (!isName) used.push(inner);
    }
    ts.forEachChild(inner, visit);
  };
  nodes.forEach(visit);

  return { used, declared };
}

/**
 * The names that hold the client of a transaction where `call` runs: `tx`, a parameter typed `DbTx`, the parameter of a
 * `run(...)`/`$transaction(...)` callback, and a variable built from one (`const db = tx ?? this.prisma`, or `const rows =
 * tx.x.findMany()` left unawaited), taken from every function around the call.
 */
function transactionClientsAt(call: ts.Node): Set<string> {
  const names = new Set(['tx']);
  const scopes: ts.Node[] = [];
  for (let scope = call.parent; scope; scope = scope.parent) {
    if (!ts.isFunctionLike(scope)) continue;
    scopes.push(scope);
    const callback = scope.parent;
    const runs =
      ts.isCallExpression(callback) && TRANSACTION_RUNNERS.has(callback.expression.getText().split('.').pop() ?? '');
    for (const parameter of scope.parameters) {
      if (ts.isIdentifier(parameter.name) && ((parameter.type && /\bDbTx\b/.test(parameter.type.getText())) || runs)) {
        names.add(parameter.name.text);
      }
    }
  }
  for (let changed = true; changed;) {
    changed = false;
    for (const scope of scopes) {
      const visit = (inner: ts.Node): void => {
        if (
          ts.isVariableDeclaration(inner) &&
          ts.isIdentifier(inner.name) &&
          inner.initializer &&
          !names.has(inner.name.text)
        ) {
          const lead = leadingOperand(inner.initializer);
          const pending = !ts.isAwaitExpression(inner.initializer);
          const fromClient =
            (ts.isIdentifier(lead) && names.has(lead.text)) ||
            (pending && referencesIn([inner.initializer]).used.some((id) => names.has(id.text)));
          if (fromClient) {
            names.add(inner.name.text);
            changed = true;
          }
        }
        ts.forEachChild(inner, visit);
      };
      visit(scope);
    }
  }

  return names;
}

/**
 * R2: files of `src/` (a module, `infrastructure`, `cli`, `worker`: any code but the generated client) that run several statements
 * at once on a transaction client: a `Promise.all(...)` (or `allSettled`,
 * `race`, `any`) whose arguments name the client of the transaction around it, directly (`tx.model.x()`), as an argument
 * (`repo.x(tx)`) or through a variable built from it (`const db = tx ?? this.prisma`). A client opened inside the arguments
 * (`run((tx) => …)` for each item) is another transaction and is left alone.
 */
function concurrentQueriesOnTransaction(files: SourceFile[]): string[] {
  return files
    .filter(({ path, source }) => !isSpec(path) && /\bPromise\s*\.\s*(?:all|allSettled|race|any)\b/.test(source))
    .filter(({ path, source }) => {
      const parsed = ts.createSourceFile(path, source, ts.ScriptTarget.ES2022, true);
      let found = false;
      const visit = (node: ts.Node): void => {
        if (
          ts.isCallExpression(node) &&
          ts.isPropertyAccessExpression(node.expression) &&
          node.expression.expression.getText() === 'Promise' &&
          CONCURRENT_CALLS.has(node.expression.name.text)
        ) {
          const clients = transactionClientsAt(node);
          const { used, declared } = referencesIn(node.arguments);
          found ||= used.some((id) => clients.has(id.text) && !declared.has(id.text));
        }
        ts.forEachChild(node, visit);
      };
      visit(parsed);

      return found;
    })
    .map(({ path }) => path)
    .sort();
}

/**
 * R3: folders below a module (at any level) that name a technical layer. A file is where its function is: a mapper next to the
 * capability that uses it, a file shared by several capabilities at the module root.
 */
function technicalLayerFolders(paths: string[]): string[] {
  const found = new Set<string>();
  for (const path of paths.filter(isModuleFile)) {
    const parts = path.split('/');
    // modules / <module> / folder … / file: every folder from the third segment on, the file itself left out
    for (let index = 2; index < parts.length - 1; index += 1) {
      if (TECHNICAL_LAYER_FOLDERS.has(parts[index])) found.add(parts.slice(0, index + 1).join('/'));
    }
  }

  return [...found].sort();
}

const PUBLIC_ONLY_SUFFIX = /\.(?:api|extension-points)\.ts$/;
const isInPublicFolder = (path: string): boolean => path.split('/')[2] === 'public';
/** `foo-bar.api.ts` → `FooBarApi`: the one class a facade file exports. */
const facadeClassOf = (path: string): string =>
  `${fileName(path)
    .replace(/\.api\.ts$/, '')
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('')}Api`;
const exportedClasses = (source: string): string[] =>
  [...codeOnly(source).matchAll(/\bexport\s+(?:abstract\s+)?class\s+(\w+)/g)].map((match) => match[1]);

/**
 * R4: `*.api.ts` and `*.extension-points.ts` are the door other modules use, so they live in `public/` and nowhere else; each
 * `public/<x>.api.ts` exports exactly one class, `<X>Api` (a module may open several facades).
 */
function publicOnlySuffixes(files: SourceFile[]): string[] {
  return files
    .filter(({ path }) => isModuleFile(path) && !isSpec(path))
    .flatMap(({ path, source }) => {
      if (PUBLIC_ONLY_SUFFIX.test(path) && !isInPublicFolder(path)) return [`${path}: belongs in public/`];
      if (!path.endsWith('.api.ts')) return [];
      const classes = exportedClasses(source);
      const expected = facadeClassOf(path);

      return classes.length === 1 && classes[0] === expected
        ? []
        : [`${path}: exports ${classes.join(', ') || 'no class'}, expected only ${expected}`];
    })
    .sort();
}

/**
 * R5 (OD-R2): in a module that has capability folders, a file directly in the module folder is a Nest module (`*.module.ts`), or
 * a file shared by the whole module whose name begins with the module's name. A module with no capability folder (only
 * `public/`, or nothing) stays flat: the file cap of `crowdedDirectories` is its only limit.
 */
function moduleRootFiles(paths: string[]): string[] {
  const modulePaths = paths.filter(isModuleFile);
  const withCapabilities = new Set(
    modulePaths
      .map((path) => path.split('/'))
      .filter((parts) => parts.length > 3 && parts[2] !== 'public')
      .map((parts) => parts[1]),
  );

  return modulePaths
    .filter((path) => path.split('/').length === 3 && withCapabilities.has(moduleOf(path)))
    .filter((path) => {
      const name = fileName(path);
      const module = moduleOf(path);

      return !name.endsWith('.module.ts') && !name.startsWith(`${module}.`) && !name.startsWith(`${module}-`);
    })
    .sort();
}

/**
 * A facade is the door for the OTHER modules. A capability that goes through the facade of its own module reaches every capability the
 * facade composes, so the graph of `pnpm arch:capabilities` follows the facade and the cycles it hides show up (R6): a capability
 * injects the service the facade delegates to instead.
 */
const RELATIVE_SPECIFIER = /(?:\bfrom\s+|\bimport\s+|\bimport\s*\(\s*|\brequire\s*\(\s*)['"](\.{1,2}\/[^'"]+)['"]/g;

/** Files of a capability (not `*.module.ts`, not a spec) that import a `public/*.api` file of their own module. */
function capabilitiesImportingOwnFacade(files: SourceFile[]): string[] {
  return files
    .filter(({ path }) => {
      const parts = path.split('/');

      return (
        isModuleFile(path) && !isSpec(path) && !path.endsWith('.module.ts') && parts.length > 3 && parts[2] !== 'public'
      );
    })
    .filter(({ path, source }) =>
      [...source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, ' ').matchAll(RELATIVE_SPECIFIER)].some((match) => {
        const target = posix.normalize(posix.join(directoryOf(path), match[1]));

        return target.startsWith(`modules/${moduleOf(path)}/public/`) && /\.api(?:\.(?:ts|js))?$/.test(target);
      }),
    )
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

  // R3
  it('has no technical-layer folder (mappers, dto, policies, …) at any level below a module', () => {
    expect(technicalLayerFolders(allPaths)).toEqual([]);
  });

  // R4
  it('keeps *.api.ts and *.extension-points.ts in public/, one <X>Api class in each facade', () => {
    expect(publicOnlySuffixes(sources)).toEqual([]);
  });

  // R5
  it('keeps at the root of a module with capability folders only *.module.ts and files named after the module', () => {
    expect(moduleRootFiles(allPaths)).toEqual([]);
  });

  // R6
  it('keeps a capability from importing the facade of its own module', () => {
    expect(capabilitiesImportingOwnFacade(sources)).toEqual([]);
  });

  // R2
  it('runs one query at a time on the client of a transaction in all of src/, not only in the modules: no Promise.all over `tx`', () => {
    expect(concurrentQueriesOnTransaction(sources)).toEqual([]);
  });

  // H8-RV-01
  it(`keeps every unit spec of a module at or under ${MAX_MODULE_SPEC_LINES} lines`, () => {
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

  /** A source file whose code is the body of one class, as a service or a repository is written. */
  const method = (path: string, body: string): SourceFile =>
    file(
      path,
      `class Sample {
${body}
}`,
    );

  // R3
  it('names a technical-layer folder at any level below a module, once, and ignores other folders and non-module paths', () => {
    expect(
      technicalLayerFolders([
        'modules/sample/mappers/sample-audit.mapper.ts',
        'modules/sample/mappers/sample.http-errors.ts',
        'modules/sample/capability/dto/capability.dto.ts',
        'modules/sample/capability/group/types/group.types.ts',
        'modules/sample/capability/capability.service.ts',
        'modules/sample/public/sample.api.ts',
        'modules/sample/capability/mapper-notes/capability.mapper.ts',
        'infrastructure/common/shared.ts',
        'core/utils/clock.ts',
      ]),
    ).toEqual(['modules/sample/capability/dto', 'modules/sample/capability/group/types', 'modules/sample/mappers']);
  });

  // R4
  it('keeps an api or extension-points file in public/ and a facade to one <X>Api class', () => {
    const facade = (name: string, extra = ''): string => `export class ${name} {}\n${extra}`;

    expect(
      publicOnlySuffixes([
        file('modules/sample/public/sample.api.ts', facade('SampleApi')),
        file('modules/sample/public/cost-center-direction.api.ts', facade('CostCenterDirectionApi')),
        file('modules/sample/public/sample.extension-points.ts', 'export class SampleHook {}'),
        file('modules/sample/sample.extension-points.ts', 'export class Stray {}'),
        file('modules/sample/capability/stray.api.ts', facade('StrayApi')),
        file('modules/sample/public/other.api.ts', facade('SampleApi')),
        file('modules/sample/public/second.api.ts', `${facade('SecondApi')}export class Helper {}`),
        file('modules/sample/public/none.api.ts', 'export interface NoClass {}'),
        file('modules/sample/public/commented.api.ts', '// export class Nothing {}\n' + facade('CommentedApi')),
        file('modules/sample/public/sample.api.spec.ts', 'export class NotAFacade {}'),
        file('infrastructure/http/elsewhere.api.ts', 'export class Elsewhere {}'),
      ]),
    ).toEqual([
      'modules/sample/capability/stray.api.ts: belongs in public/',
      'modules/sample/public/none.api.ts: exports no class, expected only NoneApi',
      'modules/sample/public/other.api.ts: exports SampleApi, expected only OtherApi',
      'modules/sample/public/second.api.ts: exports SecondApi, Helper, expected only SecondApi',
      'modules/sample/sample.extension-points.ts: belongs in public/',
    ]);
  });

  // R5
  it('allows at the root of a module with capabilities only Nest modules and files named after the module; a flat module is free', () => {
    expect(
      moduleRootFiles([
        // sample has a capability folder: its root is held to the rule
        'modules/sample/sample.module.ts',
        'modules/sample/sample-http.module.ts',
        'modules/sample/extra.module.ts',
        'modules/sample/sample.repo.ts',
        'modules/sample/sample-audit-event.mapper.ts',
        'modules/sample/sample.http-errors.spec.ts',
        'modules/sample/email-dispatcher.service.ts',
        'modules/sample/sampler.repo.ts',
        'modules/sample/capability/capability.service.ts',
        // multi-word module: the whole name must begin the file
        'modules/identity-access/identity-access.module.ts',
        'modules/identity-access/recovery.module.ts',
        'modules/identity-access/account-sessions.types.ts',
        'modules/identity-access/auth/auth.service.ts',
        // flat modules: only public/ or nothing below the root
        'modules/flat/anything.service.ts',
        'modules/flat/other.controller.ts',
        'modules/flat/public/flat.api.ts',
        // not a module
        'infrastructure/config/root.ts',
      ]),
    ).toEqual([
      'modules/identity-access/account-sessions.types.ts',
      'modules/sample/email-dispatcher.service.ts',
      'modules/sample/sampler.repo.ts',
    ]);
  });

  // R6
  it('flags a capability file that imports the facade of its own module, in every form of import, and only that', () => {
    const f = (path: string, source: string): SourceFile => ({ path, source });

    expect(
      capabilitiesImportingOwnFacade([
        f('modules/m/a/a.service.ts', `import { MApi } from '../public/m.api';`),
        f('modules/m/a/group/a-group.service.ts', `import type { MApi } from '../../public/m.api';`),
        f('modules/m/b/b.service.ts', `const api = await import('../public/m-history.api');`),
        f('modules/m/c/c.service.ts', `import { x } from '../public/m.api.js';`),
        f('modules/m/h/h.service.ts', `import '../public/m.api';`),
        // not offenders: a public types file, another module's facade, a spec, wiring, the module root, public/ itself
        f('modules/m/d/d.service.ts', `import type { T } from '../public/m.types';`),
        f('modules/m/e/e.service.ts', `import { NApi } from '../../n/public/n.api';`),
        f('modules/m/a/a.service.spec.ts', `import { MApi } from '../public/m.api';`),
        f('modules/m/a/a.module.ts', `import { MApi } from '../public/m.api';`),
        f('modules/m/m.http-errors.ts', `import { MApi } from './public/m.api';`),
        f('modules/m/public/m-history.api.ts', `import { MApi } from './m.api';`),
        f('modules/m/g/g.service.ts', `// import { MApi } from '../public/m.api';`),
      ]),
    ).toEqual([
      'modules/m/a/a.service.ts',
      'modules/m/a/group/a-group.service.ts',
      'modules/m/b/b.service.ts',
      'modules/m/c/c.service.ts',
      'modules/m/h/h.service.ts',
    ]);
  });

  // R2
  it('flags a Promise.all on a transaction client outside src/modules too: infrastructure, cli and worker', () => {
    const racing = 'async read(tx: DbTx) {\n  return Promise.all([tx.a.findMany(), tx.b.count()]);\n}';

    expect(
      concurrentQueriesOnTransaction([
        method('infrastructure/database/reader.ts', racing),
        method('cli/some/some-cli.service.ts', racing),
        method('worker/some.job.ts', racing),
        method('main.ts', racing),
        method('infrastructure/database/pool.ts', 'async read() { return Promise.all([this.prisma.a.findMany()]); }'),
      ]),
    ).toEqual(['cli/some/some-cli.service.ts', 'infrastructure/database/reader.ts', 'main.ts', 'worker/some.job.ts']);
  });

  // R2
  it('flags a Promise.all that runs several statements on a transaction client, in each form it can take', () => {
    const body = (arguments_: string, before = ''): string =>
      `async read(tx: DbTx) {\n${before}  return Promise.all([${arguments_}]);\n}`;

    expect(
      concurrentQueriesOnTransaction([
        method('modules/sample/delegate.repo.ts', body('tx.account.findMany(), tx.account.count()')),
        method('modules/sample/argument.service.ts', body('this.accounts.list(tx), this.accounts.count(tx)')),
        method(
          'modules/sample/alias.repo.ts',
          body('db.account.findMany(), db.account.count()', '  const db = tx ?? this.prisma;\n'),
        ),
        method(
          'modules/sample/typed.repo.ts',
          'async read(client: DbTx | undefined) {\n  const db = client ?? this.prisma;\n  return Promise.all([db.a.findMany(), db.b.count()]);\n}',
        ),
        method(
          'modules/sample/unawaited.service.ts',
          'async read(tx: DbTx) {\n  const rows = tx.account.findMany();\n  const total = this.count(tx);\n  return Promise.all([rows, total]);\n}',
        ),
        method(
          'modules/sample/callback.service.ts',
          'async read() {\n  return this.runner.run(async (client) => Promise.all([client.a.findMany(), client.b.count()]));\n}',
        ),
        method(
          'modules/sample/settled.service.ts',
          'async read(tx: DbTx) {\n  return Promise.allSettled([tx.a.findMany()]);\n}',
        ),
      ]),
    ).toEqual([
      'modules/sample/alias.repo.ts',
      'modules/sample/argument.service.ts',
      'modules/sample/callback.service.ts',
      'modules/sample/delegate.repo.ts',
      'modules/sample/settled.service.ts',
      'modules/sample/typed.repo.ts',
      'modules/sample/unawaited.service.ts',
    ]);
  });

  // R2
  it('leaves Promise.all alone when it runs on the pool, on awaited values, on its own transactions, or is not code', () => {
    expect(
      concurrentQueriesOnTransaction([
        method(
          'modules/sample/pool.repo.ts',
          'async read() { return Promise.all([this.prisma.a.findMany(), this.prisma.b.count()]); }',
        ),
        method(
          'modules/sample/sequential.repo.ts',
          'async read(tx: DbTx) {\n  const rows = await tx.a.findMany();\n  const total = await tx.a.count();\n  return [rows, total];\n}',
        ),
        method(
          'modules/sample/awaited.service.ts',
          'async read(tx: DbTx) {\n  const ids = await tx.a.findMany();\n  return Promise.all(ids.map((id) => this.mail.send(id)));\n}',
        ),
        method(
          'modules/sample/own.service.ts',
          'async read(ids: string[]) {\n  return Promise.all(ids.map((id) => this.runner.run((tx) => tx.a.findUnique({ where: { id } }))));\n}',
        ),
        method(
          'modules/sample/prose.service.ts',
          "// Promise.all([tx.a.findMany()]) would queue\nconst note = 'Promise.all([tx.a.count()])';",
        ),
        method('modules/sample/other.spec.ts', 'it("x", () => Promise.all([tx.a.findMany()]));'),
        method('infrastructure/database/pool.ts', 'Promise.all([tx.a.findMany()]);'),
      ]),
    ).toEqual([]);
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
