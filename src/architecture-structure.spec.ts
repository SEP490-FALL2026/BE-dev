import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

/**
 * Structure gates of docs/rules/module-structure.md. Each rule fails on a NEW violation. Violations that existed when
 * the rule was introduced (18/10/2026, HEAD 186ad5f) are listed in LEGACY below, exactly, with the remediation slice of
 * docs/workspace/items/foundation-remediation-handoff-2026-10-18 that removes them. Entries are only ever removed:
 * a stale entry (the violation is gone) also fails, so the ledger cannot drift. Adding an entry needs a recorded
 * reason in that item and Owner review; it is not a way to make a red build green.
 *
 * GATE.1 (19/10/2026, Owner decision E9 = A) closed the blind spots A4-01, A4-04 and A4-05 of
 * docs/reviews/be-full-src-architecture-audit-2026-10-19 and seeded exactly the live cases that report lists, each with
 * the slice of that report (section 9) that removes it.
 */

const sourceRoot = join(process.cwd(), 'src');
const modulesRoot = join(sourceRoot, 'modules');

/** Inspection thresholds agreed in the 18/10/2026 audit. */
const MAX_FILE_LINES = 400;
const HARD_MAX_FILE_LINES = 700;
const MAX_ROOT_CONTROLLERS = 2;
const MAX_ROOT_FILES = 12;
const MAX_DIRECTORY_DEPTH = 2;
/**
 * H8-RV-01 (Prompt 21A): a unit spec of a business module is capped like a source file. A larger one is split by
 * observable use case, its shared harness in test/support/ (test/README.md). No ledger and no exception.
 */
const MAX_MODULE_SPEC_LINES = 400;

/** Module-level folders every capability of the same module may import. */
const SHARED_MODULE_FOLDERS = new Set(['dto', 'errors', 'mappers', 'policies']);

/**
 * GATE.2 (19/10/2026): the exact intra-module contracts. Inside one business module, a file of another part (another
 * capability, or a root file outside the root public surface) is public only when it is listed here, relative to src/,
 * with why it is public. A suffix such as `*.service.ts` or `*.types.ts` opens nothing: repos, the credential hasher,
 * policies, helpers, validators and implementation services stay private unless promoted here and documented as a
 * contract. Every entry must exist and keep a real consumer in another part of its module; an entry that loses its
 * last consumer must be removed (the gate below fails both ways). Listing a file is a design decision reviewed like
 * PUBLIC_CONTRACT_EXPORTS of module-graph.spec.ts, never a way to make a red build green.
 */
const INTRA_MODULE_CONTRACTS: ReadonlyMap<string, string> = new Map([
  // data-import (H8.3): the module facade reads the latest kept people import through the capability service.
  [
    'modules/data-import/employee-import/employee-import.service.ts',
    'latest kept people import read by the facade data-import.service.ts for the onboarding checklist',
  ],
  // identity-access (Wave B: capabilities reach one another through these services, types and the shared ports).
  [
    'modules/identity-access/identity-access.ports.ts',
    'session port ACCOUNT_SESSIONS: consumed by accounts and recovery, implemented by auth',
  ],
  [
    'modules/identity-access/accounts/account-directory.service.ts',
    'account lookup for access, approval-roles, auth, recovery and the facade',
  ],
  [
    'modules/identity-access/accounts/account.errors.ts',
    'account errors mapped by the shared mappers/account.http-errors.ts (accounts and auth routes)',
  ],
  [
    'modules/identity-access/accounts/account.types.ts',
    'APPROVAL_ROLE_HOLDINGS port, owned by its accounts consumer and implemented by approval-roles',
  ],
  [
    'modules/identity-access/accounts/action-link-revocation.service.ts',
    'revokes open action links when auth or recovery changes a credential',
  ],
  [
    'modules/identity-access/accounts/action-link.service.ts',
    'issues and redeems action links for auth password reset, recovery and the facade',
  ],
  [
    'modules/identity-access/accounts/credential.service.ts',
    'credential checks and writes for auth, recovery and the facade',
  ],
  [
    'modules/identity-access/accounts/invitation-redemption.service.ts',
    'invitation redemption served by the auth route',
  ],
  ['modules/identity-access/accounts/role-grant.service.ts', 'role grants for approval-roles, recovery and the facade'],
  [
    'modules/identity-access/accounts/successor-eligibility.service.ts',
    'Super Admin successor rule shared with the recovery enrolment',
  ],
  [
    'modules/identity-access/approval-roles/approval-role-directory.service.ts',
    'approval roles held now, read by the access-token verifier',
  ],
  [
    'modules/identity-access/auth/auth.errors.ts',
    'auth errors mapped by the shared mappers/auth.http-errors.ts (auth and access routes)',
  ],
  [
    'modules/identity-access/auth/password-change.service.ts',
    'password change use case behind the /me route of access',
  ],
  [
    'modules/identity-access/auth/session-directory.service.ts',
    'session state read by the access-token verifier (implements ACCOUNT_SESSIONS)',
  ],
  ['modules/identity-access/auth/token.service.ts', 'access-token verification for the access verifier'],
  [
    'modules/identity-access/recovery/recovery-ticket.service.ts',
    'waiting recovery tickets that block a password reset request (H3c)',
  ],
  // organization (Waves 2 and 3: the facade and the department use cases reach the other capabilities here; GATE2-02:
  // the shared mappers/organization.http-errors.ts maps the errors of all five capabilities for their routes).
  [
    'modules/organization/cost-center/cost-center-catalogue.service.ts',
    'installation and vacancy contract of the facade',
  ],
  [
    'modules/organization/cost-center/cost-center.errors.ts',
    'Cost Center errors mapped by the shared mappers/organization.http-errors.ts',
  ],
  ['modules/organization/cost-center/cost-center.service.ts', 'Cost Center lock taken by the department write'],
  [
    'modules/organization/cost-center/cost-center.types.ts',
    'code format shared with departments; Cost Center views used by department records',
  ],
  ['modules/organization/department/department-directory.service.ts', 'department head periods behind the facade'],
  [
    'modules/organization/department/department.errors.ts',
    'department errors mapped by the shared mappers/organization.http-errors.ts',
  ],
  ['modules/organization/department/department.types.ts', 'department views returned by the facade'],
  ['modules/organization/employee/employee-directory.service.ts', 'employee lookup and manual entry behind the facade'],
  [
    'modules/organization/employee/employee.errors.ts',
    'employee row errors mapped by the shared mappers/organization.http-errors.ts',
  ],
  ['modules/organization/job-title/job-title-catalogue.service.ts', 'job title catalogue behind the facade'],
  [
    'modules/organization/job-title/job-title.errors.ts',
    'job title errors mapped by the shared mappers/organization.http-errors.ts',
  ],
  [
    'modules/organization/job-title/job-title.types.ts',
    'job title views for the facade, its public types and the employee row validator',
  ],
  [
    'modules/organization/project/project.errors.ts',
    'project errors mapped by the shared mappers/organization.http-errors.ts',
  ],
  ['modules/organization/project/project.service.ts', 'projects listed in the department profile'],
  [
    'modules/organization/project/project.types.ts',
    'project record nested in department views and in the shared mappers/project.mapper.ts',
  ],
]);

const LEGACY = {
  /**
   * importer -> target, both relative to src/. Empty since identity-access Wave B (H5.5 to H5.7): capabilities reach
   * one another only through services and types. Stays as a gate.
   */
  crossCapabilityImports: new Set<string>(),
  /** Controller importing another controller. Empty since H4.1 (shared project mapper); stays as a gate. */
  controllerImports: new Set<string>(),
  /** Error classes declared in an orchestration file (service/controller/repo). */
  errorClassesOutsideErrorFiles: new Set([
    // H6: installation errors to installation.errors.ts.
    'modules/installation/installation.service.ts: InstallationInputError',
    'modules/installation/installation.service.ts: AlreadyInstalledError',
  ]),
  /** HTTP mapping (ApiException/HttpStatus) inside a business error file. Empty since H8.1; stays as a gate. */
  httpMappingInErrorFiles: new Set<string>(),
  /** Errors matched by their class name string instead of instanceof. */
  errorMatchedByName: new Set([
    // A4-04 (GATE.1): composition roots were not scanned. ROOT.1 shares one CLI helper that uses instanceof.
    'installation-cli.ts',
    'recovery-cli.ts',
  ]),
  /** HTTP mapping (ApiException/HttpStatus) inside a business service. A4-05 (GATE.1); G3 decides catalog (E1 = A). */
  httpMappingInServices: new Set(['modules/catalog/catalog.service.ts']),
  /** Raw SQL in a business file that is not a repository. H6 (advisory lock of the installation). */
  rawSqlOutsideRepositories: new Set(['modules/installation/installation.service.ts']),
  /** File -> line cap. A listed file must not grow past its cap. */
  oversizedFiles: new Map<string, number>([
    ['infrastructure/config/env-schema.ts', 425], // H6
  ]),
  /** Module -> cap on controllers directly in the module root. H4. */
  rootControllers: new Map<string, number>(),
  /** Module -> cap on non-spec files directly in the module root. H4. */
  rootFiles: new Map<string, number>(),
} as const;

function listTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return entry === 'generated' ? [] : listTypeScriptFiles(path);

    return path.endsWith('.ts') && !path.endsWith('.spec.ts') ? [path] : [];
  });
}

function toSourcePath(file: string): string {
  return relative(sourceRoot, file).split(sep).join('/');
}

function relativeSpecifiers(source: string): string[] {
  return [
    ...source.matchAll(/\b(?:import|export)\b[^;'"]*?\bfrom\s*['"]([^'"]+)['"]/g),
    ...source.matchAll(/\bimport\s*['"]([^'"]+)['"]/g),
    ...source.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g),
  ]
    .map((match) => match[1])
    .filter((specifier) => specifier.startsWith('.'));
}

function resolvedImports(file: string): string[] {
  return relativeSpecifiers(readFileSync(file, 'utf8')).flatMap((specifier) => {
    const base = resolve(dirname(file), specifier);
    const target = [`${base}.ts`, join(base, 'index.ts')].find((candidate) => existsSync(candidate));

    return target === undefined ? [] : [target];
  });
}

function lineCount(file: string): number {
  const text = readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/).length;

  return text.endsWith('\n') ? lines - 1 : lines;
}

/** Every unit spec (`*.spec.ts`) below `directory`, recursively. */
function listSpecFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return entry === 'generated' ? [] : listSpecFiles(path);

    return path.endsWith('.spec.ts') ? [path] : [];
  });
}

/** The specs above the module unit spec cap, with their path relative to src/ and their line count. */
function oversizedModuleSpecs(
  specFiles: string[],
  countLines: (file: string) => number = lineCount,
): { file: string; lines: number }[] {
  return specFiles
    .map((file) => ({ file: toSourcePath(file), lines: countLines(file) }))
    .filter(({ lines }) => lines > MAX_MODULE_SPEC_LINES)
    .sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));
}

/** Path segments below src/modules: [module, ...folders, file]. */
function moduleSegments(file: string): string[] {
  return relative(modulesRoot, file).split(sep);
}

function isErrorFile(file: string): boolean {
  return file.endsWith('.errors.ts') || moduleSegments(file).slice(1, -1).includes('errors');
}

function moduleDirectories(): string[] {
  return readdirSync(modulesRoot).filter((entry) => statSync(join(modulesRoot, entry)).isDirectory());
}

/**
 * Compares what the tree contains now with the legacy set: every finding must be listed, and every listed entry must
 * still be a finding. Returns both differences so a failure names exactly what to fix.
 */
function againstLedger(findings: Iterable<string>, legacy: ReadonlySet<string>) {
  const found = new Set(findings);

  return {
    newViolations: [...found].filter((finding) => !legacy.has(finding)).sort(),
    staleLedgerEntries: [...legacy].filter((entry) => !found.has(entry)).sort(),
  };
}

const CLEAN = { newViolations: [], staleLedgerEntries: [] };

const ROOT_AREA = '<module root>';
const SHARED_AREA = '<shared folder>';

/** The part of a business module a file belongs to: a capability folder, the module root or a shared folder. */
function moduleArea(file: string): { moduleName: string; area: string } {
  const [moduleName, first, ...rest] = moduleSegments(file);
  if (rest.length === 0) return { moduleName, area: ROOT_AREA };

  return { moduleName, area: SHARED_MODULE_FOLDERS.has(first) ? SHARED_AREA : first };
}

/**
 * Module-root files that are public: the Nest modules, the facade service, public types and public errors. Kept in
 * step with `isModulePublicSurface` of architecture-boundaries.spec.ts; the rest of the root is private.
 */
function isModuleRootPublicSurface(file: string): boolean {
  const [moduleName, fileName, ...rest] = moduleSegments(file);
  if (fileName === undefined || rest.length > 0) return false;

  return (
    fileName === `${moduleName}.module.ts` ||
    fileName.endsWith('-http.module.ts') ||
    fileName.endsWith('-facade.module.ts') ||
    fileName === `${moduleName}.service.ts` ||
    fileName.endsWith('.types.ts') ||
    fileName.endsWith('.errors.ts')
  );
}

/**
 * True when `importer` and `target` are two different parts of one business module and the import is subject to the
 * part boundary. Direction matters (GATE2-02): every part may use a shared module folder (`dto/`, `errors/`,
 * `mappers/`, `policies/`), and shared folders use one another, but a shared-folder file that reaches into a capability
 * or the root crosses a boundary like any other part. Only a Nest module file wires every provider of its module.
 */
function crossesModuleParts(importer: string, target: string): boolean {
  if (!importer.startsWith(modulesRoot + sep) || !target.startsWith(modulesRoot + sep)) return false;
  if (importer.endsWith('.module.ts')) return false;

  const from = moduleArea(importer);
  const to = moduleArea(target);

  return from.moduleName === to.moduleName && to.area !== SHARED_AREA && from.area !== to.area;
}

/**
 * True when `importer` reaches a private file of another part of its own business module. The module root is one more
 * part, not a free zone: a root file may not reach into a capability, nor a capability into the private root. Only a
 * Nest module file may wire every provider of its module. Across parts, a target is public only when it is the root
 * public surface or an exact entry of `contracts` (GATE.2) — never because of its file-name suffix.
 */
function isPrivateCrossAreaImport(
  importer: string,
  target: string,
  contracts: ReadonlyMap<string, string> = INTRA_MODULE_CONTRACTS,
): boolean {
  if (!crossesModuleParts(importer, target)) return false;
  if (contracts.has(toSourcePath(target))) return false;

  return !(moduleArea(target).area === ROOT_AREA && isModuleRootPublicSurface(target));
}

/**
 * Registry drift against the real import graph: entries whose file does not exist, and entries that exist but no file
 * of another part of the module imports any more. Both must be removed from the registry.
 */
function contractRegistryDrift(
  contracts: ReadonlyMap<string, string>,
  crossPartTargets: ReadonlySet<string>,
  fileExists: (sourcePath: string) => boolean,
) {
  const entries = [...contracts.keys()];

  return {
    missingFiles: entries.filter((entry) => !fileExists(entry)).sort(),
    unusedEntries: entries.filter((entry) => fileExists(entry) && !crossPartTargets.has(entry)).sort(),
  };
}

/** The files the `error.name` rule reads: every listed source file of src (composition roots and infrastructure too). */
function filesScannedForErrorName(sourceFiles: string[]): string[] {
  return sourceFiles.filter((file) => file.startsWith(sourceRoot + sep));
}

function matchesErrorByName(source: string): boolean {
  return /\.name\s*[!=]==\s*['"`]\w*Error['"`]/.test(source);
}

/** A business service: a `*.service.ts` file of a business module. Controllers and HTTP mappers may map HTTP. */
function isBusinessServiceFile(file: string): boolean {
  return file.startsWith(modulesRoot + sep) && file.endsWith('.service.ts');
}

/** Blanks out comments and string/template literals so a rule matches code, not prose. */
function codeOnly(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*|'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|`(?:\\.|[^`\\])*`/g, ' ');
}

/** True when code (not a comment or a string) builds an HTTP response: `ApiException` or `HttpStatus`. */
function mentionsHttpMapping(source: string): boolean {
  return /\b(?:ApiException|HttpStatus)\b/.test(codeOnly(source));
}

describe('module structure gates (docs/rules/module-structure.md)', () => {
  const sourceFiles = listTypeScriptFiles(sourceRoot);
  const moduleFiles = sourceFiles.filter((file) => file.startsWith(modulesRoot + sep));

  it('keeps each part of a module (capability or module root) out of the private files of another part', () => {
    const findings = moduleFiles.flatMap((file) =>
      resolvedImports(file)
        .filter((target) => isPrivateCrossAreaImport(file, target))
        .map((target) => `${toSourcePath(file)} -> ${toSourcePath(target)}`),
    );

    expect(againstLedger(findings, LEGACY.crossCapabilityImports)).toEqual(CLEAN);
  });

  it('GATE.2: lists exactly the intra-module contracts another part of the module imports, and nothing already public', () => {
    const crossPartTargets = new Set(
      moduleFiles.flatMap((file) =>
        resolvedImports(file)
          .filter((target) => crossesModuleParts(file, target))
          .map(toSourcePath),
      ),
    );
    const alreadyPublic = [...INTRA_MODULE_CONTRACTS.keys()].filter((entry) => {
      const file = join(sourceRoot, entry);

      return isModuleRootPublicSurface(file) || moduleArea(file).area === SHARED_AREA;
    });

    expect({
      ...contractRegistryDrift(INTRA_MODULE_CONTRACTS, crossPartTargets, (entry) =>
        existsSync(join(sourceRoot, entry)),
      ),
      alreadyPublic,
    }).toEqual({ missingFiles: [], unusedEntries: [], alreadyPublic: [] });
  });

  it('never lets a controller import another controller', () => {
    const findings = moduleFiles
      .filter((file) => file.endsWith('.controller.ts'))
      .flatMap((file) =>
        resolvedImports(file)
          .filter((target) => target.endsWith('.controller.ts'))
          .map((target) => `${toSourcePath(file)} -> ${toSourcePath(target)}`),
      );

    expect(againstLedger(findings, LEGACY.controllerImports)).toEqual(CLEAN);
  });

  it('has no global catch-all errors/common/shared folder', () => {
    const catchAll = ['errors', 'common', 'shared', 'utils', 'helpers'].flatMap((name) =>
      [join(sourceRoot, name), join(modulesRoot, name)].filter((path) => existsSync(path)).map(toSourcePath),
    );

    expect(catchAll).toEqual([]);
  });

  it('declares business error classes in error files, not in services, controllers or repositories', () => {
    const findings = moduleFiles
      .filter((file) => /\.(service|controller|repo)\.ts$/.test(file))
      .flatMap((file) =>
        [...readFileSync(file, 'utf8').matchAll(/\bclass\s+(\w+)\s+extends\s+\w*Error\b/g)].map(
          (match) => `${toSourcePath(file)}: ${match[1]}`,
        ),
      );

    expect(againstLedger(findings, LEGACY.errorClassesOutsideErrorFiles)).toEqual(CLEAN);
  });

  it('keeps one class per error name inside a module (no synonym at the root and in errors/)', () => {
    const declarations = new Map<string, string[]>();
    for (const file of moduleFiles) {
      for (const match of readFileSync(file, 'utf8').matchAll(/\bclass\s+(\w+)\s+extends\s+\w*Error\b/g)) {
        const key = `${moduleSegments(file)[0]}:${match[1]}`;
        declarations.set(key, [...(declarations.get(key) ?? []), toSourcePath(file)]);
      }
    }

    expect([...declarations].filter(([, files]) => files.length > 1)).toEqual([]);
  });

  it('keeps HTTP mapping out of business error files', () => {
    const findings = moduleFiles
      .filter(isErrorFile)
      .filter((file) => /\bApiException\b|\bHttpStatus\b/.test(readFileSync(file, 'utf8')))
      .map(toSourcePath);

    expect(againstLedger(findings, LEGACY.httpMappingInErrorFiles)).toEqual(CLEAN);
  });

  it('matches errors with instanceof, never by their name string', () => {
    const findings = filesScannedForErrorName(sourceFiles)
      .filter((file) => matchesErrorByName(readFileSync(file, 'utf8')))
      .map(toSourcePath);

    expect(againstLedger(findings, LEGACY.errorMatchedByName)).toEqual(CLEAN);
  });

  it('keeps HTTP mapping (ApiException, HttpStatus) out of business services', () => {
    const findings = moduleFiles
      .filter(isBusinessServiceFile)
      .filter((file) => mentionsHttpMapping(readFileSync(file, 'utf8')))
      .map(toSourcePath);

    expect(againstLedger(findings, LEGACY.httpMappingInServices)).toEqual(CLEAN);
  });

  it('runs raw SQL only in repository files', () => {
    const findings = moduleFiles
      .filter((file) => !file.endsWith('.repo.ts'))
      .filter((file) => /\$(?:query|execute)Raw/.test(readFileSync(file, 'utf8')))
      .map(toSourcePath);

    expect(againstLedger(findings, LEGACY.rawSqlOutsideRepositories)).toEqual(CLEAN);
  });

  it('keeps source files under the size thresholds, and listed files from growing', () => {
    const tooLarge = sourceFiles
      .map((file) => ({ file: toSourcePath(file), lines: lineCount(file) }))
      .filter(({ lines }) => lines > MAX_FILE_LINES);

    expect(tooLarge.filter(({ lines }) => lines > HARD_MAX_FILE_LINES)).toEqual([]);
    expect(tooLarge.filter(({ file, lines }) => lines > (LEGACY.oversizedFiles.get(file) ?? MAX_FILE_LINES))).toEqual(
      [],
    );
    expect(
      againstLedger(
        tooLarge.map(({ file }) => file),
        new Set(LEGACY.oversizedFiles.keys()),
      ),
    ).toEqual(CLEAN);
  });

  it('groups a module by capability before its root collects too many controllers or files', () => {
    const roots = moduleDirectories().map((moduleName) => {
      const direct = readdirSync(join(modulesRoot, moduleName)).filter(
        (entry) => entry.endsWith('.ts') && !entry.endsWith('.spec.ts'),
      );

      return {
        moduleName,
        controllers: direct.filter((entry) => entry.endsWith('.controller.ts')).length,
        files: direct.length,
      };
    });

    const controllerFindings = roots
      .filter(
        ({ moduleName, controllers }) => controllers > (LEGACY.rootControllers.get(moduleName) ?? MAX_ROOT_CONTROLLERS),
      )
      .map(({ moduleName, controllers }) => ({ moduleName, controllers }));
    const fileFindings = roots
      .filter(({ moduleName, files }) => files > (LEGACY.rootFiles.get(moduleName) ?? MAX_ROOT_FILES))
      .map(({ moduleName, files }) => ({ moduleName, files }));

    expect({ controllerFindings, fileFindings }).toEqual({ controllerFindings: [], fileFindings: [] });
    expect(
      againstLedger(
        roots.filter(({ controllers }) => controllers > MAX_ROOT_CONTROLLERS).map(({ moduleName }) => moduleName),
        new Set(LEGACY.rootControllers.keys()),
      ),
    ).toEqual(CLEAN);
    expect(
      againstLedger(
        roots.filter(({ files }) => files > MAX_ROOT_FILES).map(({ moduleName }) => moduleName),
        new Set(LEGACY.rootFiles.keys()),
      ),
    ).toEqual(CLEAN);
  });

  it('nests at most two directory levels inside a business module', () => {
    const tooDeep = moduleFiles
      .filter((file) => moduleSegments(file).length - 2 > MAX_DIRECTORY_DEPTH)
      .map(toSourcePath);

    expect(tooDeep).toEqual([]);
  });

  it('H8-RV-01: keeps every module unit spec at or under 400 lines (split by use case, harness in test/support/)', () => {
    expect(oversizedModuleSpecs(listSpecFiles(modulesRoot))).toEqual([]);
  });

  it('reports the ledger helper differences in both directions', () => {
    expect(againstLedger(['a', 'b'], new Set(['b', 'c']))).toEqual({
      newViolations: ['a'],
      staleLedgerEntries: ['c'],
    });
  });
});

describe('gate rules on synthetic files (A4-01, A4-04, A4-05)', () => {
  const inModule = (...parts: string[]) => join(modulesRoot, 'sample', ...parts);

  describe('A4-01: the module root is part of the capability boundary', () => {
    it('flags a capability that reaches a private file of another capability', () => {
      expect(isPrivateCrossAreaImport(inModule('alpha', 'alpha.service.ts'), inModule('beta', 'beta.repo.ts'))).toBe(
        true,
      );
    });

    it('flags a module-root file that reaches a private file inside a capability', () => {
      expect(isPrivateCrossAreaImport(inModule('sample.service.ts'), inModule('beta', 'beta.repo.ts'))).toBe(true);
    });

    it('flags a capability that reaches a private file at the module root', () => {
      expect(isPrivateCrossAreaImport(inModule('alpha', 'alpha.service.ts'), inModule('recovery.repo.ts'))).toBe(true);
    });

    it('allows the registered contracts of a capability, the root public surface and the shared folders', () => {
      const importer = inModule('alpha', 'alpha.service.ts');
      const contracts = new Map([
        ['modules/sample/beta/beta.service.ts', 'test contract'],
        ['modules/sample/beta/beta.types.ts', 'test contract'],
      ]);

      expect(
        isPrivateCrossAreaImport(inModule('sample.service.ts'), inModule('beta', 'beta.service.ts'), contracts),
      ).toBe(false);
      expect(isPrivateCrossAreaImport(importer, inModule('beta', 'beta.types.ts'), contracts)).toBe(false);
      expect(isPrivateCrossAreaImport(importer, inModule('sample.errors.ts'))).toBe(false);
      expect(isPrivateCrossAreaImport(importer, inModule('sample.types.ts'))).toBe(false);
      expect(isPrivateCrossAreaImport(importer, inModule('sample.service.ts'))).toBe(false);
      expect(isPrivateCrossAreaImport(importer, inModule('dto', 'shared.dto.ts'))).toBe(false);
    });

    it('keeps the credential hasher private inside the module', () => {
      expect(
        isPrivateCrossAreaImport(inModule('sample.service.ts'), inModule('beta', 'password-hasher.service.ts')),
      ).toBe(true);
    });

    it('lets a Nest module file wire every provider of its own module', () => {
      expect(isPrivateCrossAreaImport(inModule('sample.module.ts'), inModule('beta', 'beta.repo.ts'))).toBe(false);
    });

    it('ignores imports inside one capability, inside the root and across modules', () => {
      expect(isPrivateCrossAreaImport(inModule('alpha', 'alpha.service.ts'), inModule('alpha', 'alpha.repo.ts'))).toBe(
        false,
      );
      expect(isPrivateCrossAreaImport(inModule('recovery.service.ts'), inModule('recovery.repo.ts'))).toBe(false);
      expect(
        isPrivateCrossAreaImport(inModule('alpha', 'alpha.service.ts'), join(modulesRoot, 'other', 'other.repo.ts')),
      ).toBe(false);
    });
  });

  describe('GATE.2: a capability is public inside its module only through an exact contract list', () => {
    const importer = inModule('alpha', 'alpha.service.ts');

    it('rejects an arbitrary helper service of another capability, whatever its suffix', () => {
      expect(isPrivateCrossAreaImport(importer, inModule('beta', 'internal-helper.service.ts'))).toBe(true);
    });

    it('rejects arbitrary private types of another capability, whatever its suffix', () => {
      expect(isPrivateCrossAreaImport(importer, inModule('beta', 'private-state.types.ts'))).toBe(true);
    });

    const real = (path: string) => join(sourceRoot, ...path.split('/'));
    const realContracts: [string, string][] = [
      [
        'modules/identity-access/auth/login.service.ts',
        'modules/identity-access/accounts/account-directory.service.ts',
      ],
      ['modules/identity-access/access/jwt-access-token.verifier.ts', 'modules/identity-access/auth/token.service.ts'],
      [
        'modules/identity-access/auth/password-reset-request.service.ts',
        'modules/identity-access/recovery/recovery-ticket.service.ts',
      ],
      ['modules/organization/organization.service.ts', 'modules/organization/job-title/job-title-catalogue.service.ts'],
      ['modules/organization/department/department.types.ts', 'modules/organization/project/project.types.ts'],
    ];

    it.each(realContracts)('accepts the registered Wave B/organization contract %s -> %s', (importerPath, target) => {
      expect(isPrivateCrossAreaImport(real(importerPath), real(target))).toBe(false);
    });

    it.each(realContracts)('rejects %s -> %s once the contract leaves the registry', (importerPath, target) => {
      const withoutIt = new Map([...INTRA_MODULE_CONTRACTS].filter(([entry]) => entry !== target));

      expect(isPrivateCrossAreaImport(real(importerPath), real(target), withoutIt)).toBe(true);
    });

    it('keeps the real repositories, the credential hasher and policies private', () => {
      const importer = real('modules/identity-access/auth/login.service.ts');

      for (const target of [
        'modules/identity-access/accounts/app-user.repo.ts',
        'modules/identity-access/accounts/password-hasher.service.ts',
        'modules/identity-access/accounts/account-administration.policy.ts',
        'modules/identity-access/recovery/recovery.repo.ts',
      ])
        expect({ target, isPrivate: isPrivateCrossAreaImport(importer, real(target)) }).toEqual({
          target,
          isPrivate: true,
        });
    });

    it('reports a registry entry with no file and one with no consumer in another part', () => {
      const contracts = new Map([
        ['used.service.ts', 'x'],
        ['unused.service.ts', 'x'],
        ['missing.types.ts', 'x'],
      ]);

      expect(
        contractRegistryDrift(contracts, new Set(['used.service.ts']), (entry) => entry !== 'missing.types.ts'),
      ).toEqual({ missingFiles: ['missing.types.ts'], unusedEntries: ['unused.service.ts'] });
    });
  });

  describe('GATE2-02: a shared module folder that imports is held to the same contracts', () => {
    it.each([
      ['mappers', 'x.ts', 'private.repo.ts'],
      ['policies', 'x.ts', 'internal-helper.service.ts'],
      ['dto', 'x.ts', 'private-state.types.ts'],
    ])('rejects %s/%s -> a capability file %s that is not a registered contract', (folder, file, target) => {
      expect(isPrivateCrossAreaImport(inModule(folder, file), inModule('beta', target))).toBe(true);
    });

    it('rejects a shared folder that reaches a private file at the module root', () => {
      expect(isPrivateCrossAreaImport(inModule('mappers', 'x.ts'), inModule('sample.repo.ts'))).toBe(true);
    });

    it('accepts a shared folder that reaches a registered contract or the root public surface', () => {
      const contracts = new Map([['modules/sample/beta/beta.errors.ts', 'test contract']]);

      expect(isPrivateCrossAreaImport(inModule('mappers', 'x.ts'), inModule('beta', 'beta.errors.ts'), contracts)).toBe(
        false,
      );
      expect(isPrivateCrossAreaImport(inModule('mappers', 'x.ts'), inModule('sample.errors.ts'))).toBe(false);
      expect(
        isPrivateCrossAreaImport(
          join(sourceRoot, 'modules', 'identity-access', 'mappers', 'account.http-errors.ts'),
          join(sourceRoot, 'modules', 'identity-access', 'accounts', 'account.errors.ts'),
        ),
      ).toBe(false);
    });

    it('keeps every part free to use a shared folder, and shared folders free to use one another', () => {
      expect(isPrivateCrossAreaImport(inModule('alpha', 'alpha.controller.ts'), inModule('mappers', 'x.ts'))).toBe(
        false,
      );
      expect(isPrivateCrossAreaImport(inModule('sample.service.ts'), inModule('policies', 'x.policy.ts'))).toBe(false);
      expect(isPrivateCrossAreaImport(inModule('mappers', 'x.ts'), inModule('dto', 'y.dto.ts'))).toBe(false);
    });
  });

  describe('H8-RV-01: the module unit spec cap', () => {
    it('reads only the specs below src/modules, not the gate specs at src/ or anything in test/', () => {
      const scanned = listSpecFiles(modulesRoot).map(toSourcePath);

      expect(scanned.length).toBeGreaterThan(0);
      expect(scanned.filter((file) => !file.startsWith('modules/'))).toEqual([]);
      expect(scanned.filter((file) => !file.endsWith('.spec.ts'))).toEqual([]);
      expect(scanned).not.toContain('architecture-structure.spec.ts');
    });

    it('names each spec over 400 lines with its exact count, and lets 400 lines pass', () => {
      const lines: Record<string, number> = {
        [inModule('alpha', 'big.spec.ts')]: 1084,
        [inModule('alpha', 'edge.spec.ts')]: 400,
        [inModule('beta', 'over.spec.ts')]: 401,
      };

      expect(oversizedModuleSpecs(Object.keys(lines), (file) => lines[file])).toEqual([
        { file: 'modules/sample/alpha/big.spec.ts', lines: 1084 },
        { file: 'modules/sample/beta/over.spec.ts', lines: 401 },
      ]);
    });
  });

  describe('A4-04: error.name is read in all of src', () => {
    it('scans composition roots and infrastructure, not only business modules', () => {
      const files = [
        join(sourceRoot, 'recovery-cli.ts'),
        join(sourceRoot, 'infrastructure', 'config', 'sample.ts'),
        inModule('sample.service.ts'),
      ];

      expect(filesScannedForErrorName(files)).toEqual(files);
    });

    it('matches a comparison of the name string and not instanceof', () => {
      expect(matchesErrorByName("if (error.name === 'EnvironmentValidationError') return;")).toBe(true);
      expect(matchesErrorByName('if (error instanceof EnvironmentValidationError) return;')).toBe(false);
    });
  });

  describe('A4-05: HTTP mapping stays out of business services', () => {
    it('selects business services and leaves controllers, HTTP mappers and infrastructure alone', () => {
      expect(isBusinessServiceFile(inModule('sample.service.ts'))).toBe(true);
      expect(isBusinessServiceFile(inModule('alpha', 'alpha.service.ts'))).toBe(true);
      expect(isBusinessServiceFile(inModule('sample.controller.ts'))).toBe(false);
      expect(isBusinessServiceFile(inModule('sample.http-errors.ts'))).toBe(false);
      expect(isBusinessServiceFile(join(sourceRoot, 'infrastructure', 'mail', 'mail.service.ts'))).toBe(false);
    });

    it('flags ApiException or HttpStatus used as code', () => {
      expect(mentionsHttpMapping('throw new ApiException(HttpStatus.NOT_FOUND, { code: "X" });')).toBe(true);
      expect(mentionsHttpMapping("import { HttpStatus } from '@nestjs/common';")).toBe(true);
    });

    it('ignores the words inside comments and string literals', () => {
      expect(mentionsHttpMapping('// The controller maps this to an ApiException.\nconst x = 1;')).toBe(false);
      expect(mentionsHttpMapping('/* HttpStatus is chosen by the controller */ const x = 1;')).toBe(false);
      expect(mentionsHttpMapping("const message = 'HttpStatus and ApiException are HTTP concerns';")).toBe(false);
      expect(mentionsHttpMapping('const message = `ApiException`;')).toBe(false);
    });
  });
});
