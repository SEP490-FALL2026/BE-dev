import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

/**
 * Structure gates of docs/rules/module-structure.md. Each rule fails on a NEW violation. Violations that existed when
 * the rule was introduced (18/10/2026, HEAD 186ad5f) are listed in LEGACY below, exactly, with the remediation slice of
 * docs/workspace/items/foundation-remediation-handoff-2026-10-18 that removes them. Entries are only ever removed:
 * a stale entry (the violation is gone) also fails, so the ledger cannot drift. Adding an entry needs a recorded
 * reason in that item and Owner review; it is not a way to make a red build green.
 */

const sourceRoot = join(process.cwd(), 'src');
const modulesRoot = join(sourceRoot, 'modules');

/** Inspection thresholds agreed in the 18/10/2026 audit. */
const MAX_FILE_LINES = 400;
const HARD_MAX_FILE_LINES = 700;
const MAX_ROOT_CONTROLLERS = 2;
const MAX_ROOT_FILES = 12;
const MAX_DIRECTORY_DEPTH = 2;

/** Module-level folders every capability of the same module may import. */
const SHARED_MODULE_FOLDERS = new Set(['dto', 'errors', 'mappers', 'policies']);

const LEGACY = {
  /** importer -> target, both relative to src/. Removed by H5 (identity-access capability boundaries). */
  crossCapabilityImports: new Set([
    'modules/identity-access/access/jwt-access-token.verifier.ts -> modules/identity-access/accounts/account-policy.ts',
    'modules/identity-access/access/jwt-access-token.verifier.ts -> modules/identity-access/approval-roles/approval-role.repo.ts',
    'modules/identity-access/access/jwt-access-token.verifier.ts -> modules/identity-access/auth/session.repo.ts',
    'modules/identity-access/access/me.controller.ts -> modules/identity-access/accounts/account.http-errors.ts',
    'modules/identity-access/access/me.service.ts -> modules/identity-access/accounts/account.repo.ts',
    'modules/identity-access/accounts/account-invitation.service.ts -> modules/identity-access/auth/password-hasher.service.ts',
    'modules/identity-access/accounts/account-invitation.service.ts -> modules/identity-access/auth/password.policy.ts',
    'modules/identity-access/accounts/account-status.service.ts -> modules/identity-access/auth/session.repo.ts',
    'modules/identity-access/accounts/successor-eligibility.ts -> modules/identity-access/approval-roles/approval-role.repo.ts',
    'modules/identity-access/approval-roles/approval-role.service.ts -> modules/identity-access/accounts/account-policy.ts',
    'modules/identity-access/approval-roles/approval-role.service.ts -> modules/identity-access/accounts/account.repo.ts',
    'modules/identity-access/auth/auth.controller.ts -> modules/identity-access/accounts/account.http-errors.ts',
    'modules/identity-access/auth/credential-change.service.ts -> modules/identity-access/accounts/account.repo.ts',
    'modules/identity-access/auth/login.service.ts -> modules/identity-access/accounts/account-policy.ts',
    'modules/identity-access/auth/login.service.ts -> modules/identity-access/accounts/account.repo.ts',
    'modules/identity-access/auth/password-change.service.ts -> modules/identity-access/accounts/account-policy.ts',
    'modules/identity-access/auth/password-change.service.ts -> modules/identity-access/accounts/account.repo.ts',
    'modules/identity-access/auth/password-reset.service.ts -> modules/identity-access/accounts/account-policy.ts',
    'modules/identity-access/auth/password-reset.service.ts -> modules/identity-access/accounts/account.repo.ts',
    'modules/identity-access/auth/session.service.ts -> modules/identity-access/accounts/account-policy.ts',
    'modules/identity-access/auth/session.service.ts -> modules/identity-access/accounts/account.repo.ts',
  ]),
  /** Removed by H4 (organization by capability). */
  controllerImports: new Set([
    'modules/organization/projects.controller.ts -> modules/organization/departments.controller.ts',
  ]),
  /** Error classes declared in an orchestration file (service/controller/repo). */
  errorClassesOutsideErrorFiles: new Set([
    // H5: move to accounts/errors.
    'modules/identity-access/accounts/super-admin-transfer.service.ts: SuperAdminTransferRefusedError',
    // H6: installation errors to installation.errors.ts.
    'modules/installation/installation.service.ts: InstallationInputError',
    'modules/installation/installation.service.ts: AlreadyInstalledError',
  ]),
  /** HTTP mapping (ApiException/HttpStatus) inside a business error file. */
  httpMappingInErrorFiles: new Set([
    'modules/identity-access/approval-roles/approval-role.errors.ts', // H5
    'modules/data-import/employee-import.errors.ts', // H8
  ]),
  /** Errors matched by their class name string instead of instanceof. H4. */
  errorMatchedByName: new Set(['modules/organization/department.service.ts']),
  /** Raw SQL in a business file that is not a repository. H6 (advisory lock of the installation). */
  rawSqlOutsideRepositories: new Set(['modules/installation/installation.service.ts']),
  /** File -> line cap. A listed file must not grow past its cap. */
  oversizedFiles: new Map<string, number>([
    ['infrastructure/config/env-schema.ts', 425], // H6
    ['modules/data-import/employee-import.service.ts', 545], // H8
    ['modules/identity-access/accounts/account.repo.ts', 411], // H5
    ['modules/identity-access/recovery.service.ts', 608], // H5
    ['modules/organization/department.repo.ts', 507], // H4
    ['modules/organization/department.service.ts', 519], // H4
  ]),
  /** Module -> cap on controllers directly in the module root. H4. */
  rootControllers: new Map<string, number>([['organization', 5]]),
  /** Module -> cap on non-spec files directly in the module root. H4. */
  rootFiles: new Map<string, number>([['organization', 26]]),
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

describe('module structure gates (docs/rules/module-structure.md)', () => {
  const sourceFiles = listTypeScriptFiles(sourceRoot);
  const moduleFiles = sourceFiles.filter((file) => file.startsWith(modulesRoot + sep));

  it('keeps one capability from reaching into the private files of another capability of the same module', () => {
    const findings = moduleFiles.flatMap((file) => {
      const [moduleName, capability, ...rest] = moduleSegments(file);
      if (rest.length === 0 || SHARED_MODULE_FOLDERS.has(capability)) return [];

      return resolvedImports(file)
        .filter((target) => target.startsWith(modulesRoot + sep))
        .filter((target) => {
          const [targetModule, targetCapability, ...targetRest] = moduleSegments(target);
          if (targetModule !== moduleName || targetRest.length === 0) return false;
          if (SHARED_MODULE_FOLDERS.has(targetCapability) || targetCapability === capability) return false;
          // A capability's public surface inside the module is its services and types; the credential hasher stays
          // private, as it does across modules.
          const isPublicSurface =
            (target.endsWith('.service.ts') || target.endsWith('.types.ts')) &&
            !target.endsWith('password-hasher.service.ts');

          return !isPublicSurface;
        })
        .map((target) => `${toSourcePath(file)} -> ${toSourcePath(target)}`);
    });

    expect(againstLedger(findings, LEGACY.crossCapabilityImports)).toEqual(CLEAN);
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
    const findings = moduleFiles
      .filter((file) => /\.name\s*[!=]==\s*['"`]\w*Error['"`]/.test(readFileSync(file, 'utf8')))
      .map(toSourcePath);

    expect(againstLedger(findings, LEGACY.errorMatchedByName)).toEqual(CLEAN);
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

  it('reports the ledger helper differences in both directions', () => {
    expect(againstLedger(['a', 'b'], new Set(['b', 'c']))).toEqual({
      newViolations: ['a'],
      staleLedgerEntries: ['c'],
    });
  });
});
