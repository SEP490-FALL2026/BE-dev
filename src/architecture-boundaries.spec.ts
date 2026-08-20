import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

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
  AccessRequest: 'access-requests',
  ApprovalStep: 'access-requests',
  AuditEvent: 'audit',
  CatalogApplication: 'catalog',
  DiscoveryCase: 'discovery',
  StoredObject: 'files',
  ImportJob: 'imports',
  FinancialTransaction: 'finance',
  Principal: 'identity-access',
  IdentityLink: 'identity-access',
  LicensePool: 'licenses',
  LicenseAssignment: 'licenses',
  Department: 'organization',
  Employee: 'organization',
  UsageRecord: 'usage-optimization',
};

function listPrismaModels(): string[] {
  const modelsRoot = join(process.cwd(), 'prisma', 'models');

  return readdirSync(modelsRoot).flatMap((entry) =>
    [...readFileSync(join(modelsRoot, entry), 'utf8').matchAll(/^model\s+(\w+)\s*\{/gm)].map((match) => match[1]),
  );
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
});
