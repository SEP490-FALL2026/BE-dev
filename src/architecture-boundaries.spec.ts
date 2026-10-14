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
  JobTitle: 'organization',
  Employee: 'organization',
  EmployeePlacement: 'organization',
  AppUser: 'identity-access',
  PasswordCredential: 'identity-access',
  RoleGrant: 'identity-access',
  AuthSession: 'identity-access',
  RefreshToken: 'identity-access',
  LoginThrottle: 'identity-access',
  AccountActionToken: 'identity-access',
  EmailOutbox: 'notifications',
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
    const forbidden = ['@nestjs/', '@prisma/', '@aws-sdk/', 'bullmq', '/infrastructure/'];

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

  it('prevents imports of another business module private layers', () => {
    const modulesRoot = join(sourceRoot, 'modules');
    const privateFolders = 'adapters|dto|errors|helpers|mappers|policies|schemas|services';

    for (const file of listTypeScriptFiles(modulesRoot)) {
      const relativePath = relative(modulesRoot, file);
      const owner = relativePath.split(sep)[0];
      const source = readFileSync(file, 'utf8').replaceAll('\\', '/');
      const privateImports = [
        ...source.matchAll(new RegExp(`modules/([^/'"]+)/(${privateFolders})/`, 'g')),
        ...source.matchAll(new RegExp(`from\\s+['"](?:\\.\\./)+([^/'"]+)/(${privateFolders})/`, 'g')),
        ...source.matchAll(/modules\/([^/'"]+)\/[^/'"]+\.repo(?:\.ts)?['"]/g),
        ...source.matchAll(/from\s+['"](?:\.\.\/)+([^/'"]+)\/[^/'"]+\.repo(?:\.ts)?['"]/g),
        // Flat files the layer folders above do not cover. The identity-access facade module also exports
        // PasswordHasher, so a module that imports it could inject it; credentials stay behind IdentityAccessService.
        ...source.matchAll(/modules\/([^/'"]+)\/password-hasher\.service(?:\.ts)?['"]/g),
        ...source.matchAll(/from\s+['"](?:\.\.\/)+([^/'"]+)\/password-hasher\.service(?:\.ts)?['"]/g),
      ];

      for (const match of privateImports) {
        expect(match[1]).toBe(owner);
      }
    }
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

    const specifiers = [
      ...source.matchAll(/\b(?:import|export)\b[^;'"]*?\bfrom\s*['"]([^'"]+)['"]/g),
      ...source.matchAll(/\bimport\s*['"]([^'"]+)['"]/g),
      ...source.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g),
    ].map((match) => match[1]);

    for (const specifier of specifiers) {
      if (!specifier.startsWith('.')) continue;
      const base = resolve(dirname(file), specifier);
      const target = [`${base}.ts`, join(base, 'index.ts')].find((candidate) => existsSync(candidate));
      if (target === undefined) {
        throw new Error(`${relative(process.cwd(), file)} imports ${specifier}, which does not resolve to a .ts file`);
      }
      pending.push(target);
    }
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
