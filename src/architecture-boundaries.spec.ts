import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { environmentConfigOptions, installationEnvironmentConfigOptions } from './infrastructure/config/env-config';
import { validateEnvironment, validateInstallationEnvironment } from './infrastructure/config/env-schema';

function listTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory()
      ? listTypeScriptFiles(path)
      : path.endsWith('.ts') && !path.endsWith('.spec.ts')
        ? [path]
        : [];
  });
}

/**
 * Every Prisma model has exactly one owning module. A module may only touch its own
 * delegates; it reads another module's data through that module's public contract.
 */
const PRISMA_MODEL_OWNER: Readonly<Record<string, string>> = {
  CatalogApplication: 'catalog',
  AuditEvent: 'audit',
  Organization: 'organization',
  CostCenter: 'organization',
  Department: 'organization',
  DepartmentHeadPeriod: 'organization',
  Project: 'organization',
  ProjectDepartment: 'organization',
  JobTitle: 'organization',
  Employee: 'organization',
  EmployeePlacement: 'organization',
  AppUser: 'identity-access',
  ApprovalRoleHolder: 'identity-access',
  RecoveryTicket: 'identity-access',
  PasswordCredential: 'identity-access',
  RoleGrant: 'identity-access',
  AuthSession: 'identity-access',
  RefreshToken: 'identity-access',
  LoginThrottle: 'identity-access',
  AccountActionToken: 'identity-access',
  EmailOutbox: 'notifications',
  ParameterValue: 'operating-parameters',
  EmployeeImport: 'data-import',
  EmployeeImportRow: 'data-import',
  NonWorkingDate: 'operating-parameters',
};

interface PrismaModelTable {
  model: string;
  table: string;
}

/** Reads each `model X { ... @@map("x") }` block so both the delegate name and the real table name are known. */
function listPrismaTables(): PrismaModelTable[] {
  const modelsRoot = join(process.cwd(), 'prisma', 'models');

  return readdirSync(modelsRoot).flatMap((entry) =>
    [...readFileSync(join(modelsRoot, entry), 'utf8').matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)].map((match) => ({
      model: match[1],
      table: /@@map\("([^"]+)"\)/.exec(match[2])?.[1] ?? match[1],
    })),
  );
}

function listPrismaModels(): string[] {
  return listPrismaTables().map(({ model }) => model);
}

function prismaDelegateName(model: string): string {
  return model.charAt(0).toLowerCase() + model.slice(1);
}

describe('architecture boundaries', () => {
  const sourceRoot = join(process.cwd(), 'src');

  it('keeps core framework-free', () => {
    // `/modules/` added 18/10/2026 (docs/rules/module-structure.md): core is pure TypeScript and knows no business module.
    const forbidden = ['@nestjs/', '@prisma/', '@aws-sdk/', 'bullmq', '/infrastructure/', '/modules/'];

    for (const file of listTypeScriptFiles(join(sourceRoot, 'core'))) {
      const source = readFileSync(file, 'utf8').replaceAll('\\', '/');
      for (const dependency of forbidden) {
        expect({
          file: relative(sourceRoot, file),
          dependency,
          isImported: source.includes(dependency),
        }).toMatchObject({ isImported: false });
      }
    }
  });

  it('prevents imports of another business module private files', () => {
    const findings = privateModuleImportFindings(sourceRoot, listTypeScriptFiles(join(sourceRoot, 'modules')));
    const ledger = [...LEGACY_PRIVATE_MODULE_IMPORTS].filter((entry) => entry.startsWith('modules/'));

    expect(againstLedger(findings, ledger)).toEqual({ newViolations: [], staleLedgerEntries: [] });
  });

  it('holds the composition roots (API, worker, CLI entry files) to the same public module contract', () => {
    const rootFiles = readdirSync(sourceRoot)
      .map((entry) => join(sourceRoot, entry))
      .filter((path) => statSync(path).isFile() && path.endsWith('.ts') && !path.endsWith('.spec.ts'));
    expect(rootFiles).toContain(join(sourceRoot, 'installation-cli.ts'));

    const findings = privateModuleImportFindings(sourceRoot, rootFiles);
    const ledger = [...LEGACY_PRIVATE_MODULE_IMPORTS].filter((entry) => !entry.startsWith('modules/'));

    expect(againstLedger(findings, ledger)).toEqual({ newViolations: [], staleLedgerEntries: [] });
  });

  it('reports the ledger differences in both directions', () => {
    expect(againstLedger(['a', 'b'], ['b', 'c'])).toEqual({ newViolations: ['a'], staleLedgerEntries: ['c'] });
  });

  it('reports an import of a module subfolder such as identity-access/errors as private', () => {
    const cli = join(sourceRoot, 'installation-cli.ts');
    const identity = join(sourceRoot, 'modules', 'identity-access');

    expect(privateModuleImport(sourceRoot, cli, join(identity, 'errors', 'identity-access.errors.ts'))).toHaveLength(1);
    expect(privateModuleImport(sourceRoot, cli, join(identity, 'auth', 'password-hasher.service.ts'))).toHaveLength(1);
    expect(privateModuleImport(sourceRoot, cli, join(identity, 'identity-access.errors.ts'))).toEqual([]);
    expect(privateModuleImport(sourceRoot, cli, join(identity, 'identity-access.service.ts'))).toEqual([]);
  });

  describe('A4-02: the public surface of a module is an allowlist, not its whole root', () => {
    const identity = join(sourceRoot, 'modules', 'identity-access');
    const otherModule = join(sourceRoot, 'modules', 'organization', 'department', 'department.service.ts');
    const compositionRoot = join(sourceRoot, 'recovery-cli.ts');

    it('blocks an arbitrary file at the root of another module', () => {
      expect(privateModuleImport(sourceRoot, otherModule, join(identity, 'session-helper.ts'))).toHaveLength(1);
      expect(
        privateModuleImport(
          sourceRoot,
          otherModule,
          join(sourceRoot, 'modules', 'data-import', 'employee-import.service.ts'),
        ),
      ).toHaveLength(1);
    });

    it('allows each public pattern: module, HTTP and facade modules, facade service, types and public errors', () => {
      for (const file of [
        'identity-access.module.ts',
        'identity-access-http.module.ts',
        'identity-access-facade.module.ts',
        'identity-access.service.ts',
        'session.types.ts',
        'identity-access.errors.ts',
      ]) {
        expect({ file, violations: privateModuleImport(sourceRoot, otherModule, join(identity, file)) }).toEqual({
          file,
          violations: [],
        });
      }
    });

    it('keeps repositories, the credential hasher and capability files private', () => {
      for (const target of [
        join(identity, 'recovery', 'recovery.repo.ts'),
        join(identity, 'accounts', 'password-hasher.service.ts'),
        join(identity, 'accounts', 'account-invitation.service.ts'),
        join(identity, 'auth', 'session.types.ts'),
      ]) {
        expect(privateModuleImport(sourceRoot, otherModule, target)).toHaveLength(1);
      }
    });

    it('opens the listed CLI entry files to composition roots only', () => {
      const entry = join(identity, 'recovery', 'holder-recovery.service.ts');

      expect(privateModuleImport(sourceRoot, compositionRoot, entry)).toEqual([]);
      expect(privateModuleImport(sourceRoot, otherModule, entry)).toHaveLength(1);
      expect(
        privateModuleImport(sourceRoot, compositionRoot, join(identity, 'recovery', 'recovery.repo.ts')),
      ).toHaveLength(1);
    });

    it('gives the same answer for Windows and POSIX separators', () => {
      const posix = (path: string) => path.split(sep).join('/');

      expect(privateModuleImport(sourceRoot, posix(otherModule), posix(join(identity, 'session-helper.ts')))).toEqual(
        privateModuleImport(sourceRoot, otherModule, join(identity, 'session-helper.ts')),
      );
      expect(
        privateModuleImport(sourceRoot, posix(otherModule), posix(join(identity, 'identity-access.service.ts'))),
      ).toEqual([]);
    });
  });

  it('keeps business modules flat instead of recreating application layers', () => {
    const modulesRoot = join(sourceRoot, 'modules');
    const forbiddenLayerDirectories = new Set(['api', 'application', 'domain', 'infrastructure']);

    for (const moduleName of readdirSync(modulesRoot)) {
      const moduleRoot = join(modulesRoot, moduleName);
      if (!statSync(moduleRoot).isDirectory()) continue;

      const forbiddenDirectories = readdirSync(moduleRoot).filter(
        (entry) => statSync(join(moduleRoot, entry)).isDirectory() && forbiddenLayerDirectories.has(entry),
      );
      expect({ moduleName, forbiddenDirectories }).toMatchObject({ forbiddenDirectories: [] });
    }
  });

  it('assigns every Prisma model to an owning module', () => {
    for (const model of listPrismaModels()) {
      const owner = PRISMA_MODEL_OWNER[model];
      expect({ model, owner, isOwned: typeof owner === 'string' }).toEqual({ model, owner, isOwned: true });
    }
  });

  it('lets only the owning module touch its Prisma tables', () => {
    const modulesRoot = join(sourceRoot, 'modules');
    const delegateOwner = new Map(
      Object.entries(PRISMA_MODEL_OWNER).map(([model, owner]) => [prismaDelegateName(model), owner]),
    );

    for (const file of listTypeScriptFiles(modulesRoot)) {
      const owner = relative(modulesRoot, file).split(sep)[0];
      const source = readFileSync(file, 'utf8');

      for (const match of source.matchAll(/\b(?:prisma|tx|client)\.([A-Za-z][A-Za-z0-9]*)\b/g)) {
        const delegateOwnerModule = delegateOwner.get(match[1]);
        if (delegateOwnerModule === undefined) continue;

        const location = { file: relative(sourceRoot, file), delegate: match[1] };
        expect({ ...location, owner: delegateOwnerModule }).toEqual({ ...location, owner });
      }
    }
  });

  it('confines PrismaService to repository files inside business modules', () => {
    const modulesRoot = join(sourceRoot, 'modules');

    for (const file of listTypeScriptFiles(modulesRoot)) {
      if (file.endsWith('.repo.ts')) continue;

      expect({
        file: relative(sourceRoot, file),
        usesPrismaService: readFileSync(file, 'utf8').includes('PrismaService'),
      }).toEqual({ file: relative(sourceRoot, file), usesPrismaService: false });
    }
  });

  it('keeps raw SQL inside the module that owns the table', () => {
    // The delegate scan above cannot see `$queryRaw`/`$executeRaw`, which is the most
    // realistic way to reach another module's table while evading every other rule here.
    // Only files that actually run raw SQL are scanned for table names, so an ordinary
    // file mentioning a word like "employees" in prose is not a false positive.
    const modulesRoot = join(sourceRoot, 'modules');
    const tableOwner = new Map(
      listPrismaTables()
        .filter(({ model }) => PRISMA_MODEL_OWNER[model] !== undefined)
        .map(({ model, table }) => [table, PRISMA_MODEL_OWNER[model]]),
    );

    for (const file of listTypeScriptFiles(modulesRoot)) {
      const source = readFileSync(file, 'utf8');
      if (!/\$(?:query|execute)Raw(?:Unsafe)?/.test(source)) continue;

      const owner = relative(modulesRoot, file).split(sep)[0];

      for (const [table, owningModule] of tableOwner) {
        // String.raw is required: inside a plain template literal `\b` is the
        // backspace character, not a word boundary, so the pattern would match nothing.
        if (!new RegExp(String.raw`\b${table}\b`).test(source)) continue;

        const location = { file: relative(sourceRoot, file), table };
        expect({ ...location, owner: owningModule }).toEqual({ ...location, owner });
      }
    }
  });
});

/** The relative module specifiers of a source file: `import ... from`, `export ... from`, `import '...'` and `import('...')`. */
function listRelativeSpecifiers(source: string): string[] {
  return [
    ...source.matchAll(/\b(?:import|export)\b[^;'"]*?\bfrom\s*['"]([^'"]+)['"]/g),
    ...source.matchAll(/\bimport\s*['"]([^'"]+)['"]/g),
    ...source.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g),
  ]
    .map((match) => match[1])
    .filter((specifier) => specifier.startsWith('.'));
}

/** Resolves a relative specifier of `file` to the `.ts` file it names (`x.ts` or `x/index.ts`). */
function resolveRelativeImport(file: string, specifier: string): string {
  const base = resolve(dirname(file), specifier);
  const target = [`${base}.ts`, join(base, 'index.ts')].find((candidate) => existsSync(candidate));
  if (target === undefined) {
    throw new Error(`${relative(process.cwd(), file)} imports ${specifier}, which does not resolve to a .ts file`);
  }

  return target;
}

/**
 * Module files a composition root (a file directly in src/) may import besides the public surface: the CLI entry files
 * kept at the module root (docs/rules/module-structure.md, Owner Q6). Not open to other business modules.
 */
const CLI_ENTRY_FILES: ReadonlySet<string> = new Set([
  'modules/identity-access/recovery.module.ts',
  // E7 (H5.7): the recovery implementation lives in recovery/; the command reaches exactly its two entry services,
  // its arguments, errors and result types.
  'modules/identity-access/recovery/holder-recovery.service.ts',
  'modules/identity-access/recovery/recovery.arguments.ts',
  'modules/identity-access/recovery/recovery.errors.ts',
  'modules/identity-access/recovery/recovery.types.ts',
  'modules/identity-access/recovery/role-transfer-recovery.service.ts',
  'modules/installation/hidden-prompt.ts',
  'modules/installation/installation.arguments.ts',
]);

/**
 * Cross-module imports of a non-public file that existed when GATE.1 (19/10/2026, Owner decision E9 = A) replaced "any
 * root file is public" with the allowlist (A4-02 of docs/reviews/be-full-src-architecture-audit-2026-10-19). Each
 * entry names the slice of that report that removes it. Entries are only removed; a stale entry fails like a new
 * violation, and adding one needs Owner/dev review.
 */
const LEGACY_PRIVATE_MODULE_IMPORTS: ReadonlySet<string> = new Set([
  // H8.3: data-import gets a facade for onboarding (A4-10).
  'modules/onboarding/onboarding.service.ts -> modules/data-import/employee-import.service.ts',
  // ROOT.1/DOC.1: the worker loop of ADR-0012 reaches the dispatcher; the rule for root files is decided there.
  'email-dispatch.loop.ts -> modules/notifications/email-dispatcher.service.ts',
]);

/**
 * The public surface of a business module, as path segments below src/modules: only these files directly in the
 * module root — the Nest modules, the facade service, public types and public errors. Anything else in the root, a
 * repo, the credential hasher and every subfolder file is private. Kept in step with `isModuleRootPublicSurface` of
 * architecture-structure.spec.ts.
 */
function isModulePublicSurface(parts: string[]): boolean {
  if (parts.length !== 2) return false;
  const [moduleName, fileName] = parts;

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
 * Resolved from the real import graph, not from folder names: code outside a business module (another
 * module or a composition root in src/) may import only the module's public surface (allowlist above);
 * a composition root may also import the listed CLI entry files. Returns the private target, or nothing.
 */
function privateModuleImport(sourceRoot: string, importer: string, target: string): string[] {
  const modulesRoot = join(sourceRoot, 'modules');
  const parts = relative(modulesRoot, target).split(sep);
  if (parts[0] === '..') return [];
  const importerParts = relative(modulesRoot, importer).split(sep);
  if (importerParts[0] !== '..' && importerParts[0] === parts[0]) return [];

  const targetPath = relative(sourceRoot, target).split(sep).join('/');
  const isCompositionRoot = relative(sourceRoot, importer).split(sep).length === 1;
  const isPublic = isModulePublicSurface(parts) || (isCompositionRoot && CLI_ENTRY_FILES.has(targetPath));

  return isPublic ? [] : [targetPath];
}

/** `importer -> target` for every private cross-module import made by `files`, paths relative to src/. */
function privateModuleImportFindings(sourceRoot: string, files: string[]): string[] {
  return files.flatMap((file) =>
    listResolvedRelativeImports(file).flatMap((target) =>
      privateModuleImport(sourceRoot, file, target).map(
        (privateTarget) => `${relative(sourceRoot, file).split(sep).join('/')} -> ${privateTarget}`,
      ),
    ),
  );
}

/** New findings and stale ledger entries, so a failure names exactly what to fix. */
function againstLedger(findings: string[], ledger: Iterable<string>) {
  const found = new Set(findings);
  const legacy = new Set(ledger);

  return {
    newViolations: [...found].filter((finding) => !legacy.has(finding)).sort(),
    staleLedgerEntries: [...legacy].filter((entry) => !found.has(entry)).sort(),
  };
}

function listResolvedRelativeImports(file: string): string[] {
  return listRelativeSpecifiers(readFileSync(file, 'utf8')).map((specifier) => resolveRelativeImport(file, specifier));
}

/** Follows relative `import ... from`, `export ... from` and `import('...')` specifiers from an entry file. */
function listReachableSourceFiles(entry: string): Map<string, string> {
  const reachable = new Map<string, string>();
  const pending = [entry];

  while (pending.length > 0) {
    const file = pending.pop() as string;
    if (reachable.has(file)) continue;

    const source = readFileSync(file, 'utf8');
    reachable.set(file, source);
    // Generated code has its own import style and no Nest wiring; it is a leaf here.
    if (file.includes(`${sep}generated${sep}`)) continue;

    for (const specifier of listRelativeSpecifiers(source)) pending.push(resolveRelativeImport(file, specifier));
  }

  return reachable;
}

describe('installation command dependency boundary (R-13)', () => {
  const sourceRoot = join(process.cwd(), 'src');
  const toRelative = (files: Iterable<string>) =>
    [...files].map((file) => relative(sourceRoot, file).split(sep).join('/'));

  it('does not reach the API/worker configuration, the identity-access module, notifications or the JWT library', () => {
    // installation.module is loaded by a dynamic import in the command, after --help and argument parsing.
    const reachable = listReachableSourceFiles(join(sourceRoot, 'installation-cli.ts'));
    const files = toRelative(reachable.keys());

    expect(files).toContain('modules/installation/installation.module.ts');
    expect(files).toContain('infrastructure/config/installation-configuration.module.ts');
    expect(files).toContain('modules/identity-access/identity-access-facade.module.ts');
    expect(files).not.toContain('infrastructure/config/configuration.module.ts');
    expect(files).not.toContain('modules/identity-access/identity-access.module.ts');
    expect(files.filter((file) => file.startsWith('modules/notifications/'))).toEqual([]);
    expect(files.filter((file) => /@nestjs\/jwt/.test(reachable.get(join(sourceRoot, file)) ?? ''))).toEqual([]);
  });

  it('wires the full validator to the API options and the database-only validator to the command options', () => {
    expect(environmentConfigOptions.validate).toBe(validateEnvironment);
    expect(installationEnvironmentConfigOptions.validate).toBe(validateInstallationEnvironment);
  });

  it('keeps the command-only configuration module out of everything the API and the worker load', () => {
    for (const entry of ['main.ts', 'worker.ts']) {
      const files = toRelative(listReachableSourceFiles(join(sourceRoot, entry)).keys());

      expect({ entry, files: files.filter((file) => file.includes('installation-configuration.module')) }).toEqual({
        entry,
        files: [],
      });
      expect(files).toContain('infrastructure/config/configuration.module.ts');
    }
  });

  it('keeps the full environment validation on the API and the worker', () => {
    for (const entry of ['app.module.ts', 'worker.module.ts']) {
      const source = readFileSync(join(sourceRoot, entry), 'utf8');

      expect({
        entry,
        importsConfigurationModule: /\bConfigurationModule\b/.test(
          source.replace(/InstallationConfigurationModule/g, ''),
        ),
      }).toEqual({
        entry,
        importsConfigurationModule: true,
      });
      expect({ entry, importsInstallationConfiguration: source.includes('InstallationConfigurationModule') }).toEqual({
        entry,
        importsInstallationConfiguration: false,
      });
    }
  });
});
