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
});
