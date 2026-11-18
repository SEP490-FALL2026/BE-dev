import { builtinModules } from 'node:module';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import * as ts from 'typescript';

/**
 * The external packages that code imports at runtime, read with the TypeScript parser (not by substring): what the production image
 * must carry in `dependencies` (gate `deployment-roles`). An import that TypeScript erases (`import type`, an import whose every
 * specifier is `type`, `export type … from`) is not a runtime import, and neither is a relative path or a Node builtin. Nothing here
 * asserts.
 */

const BUILTINS: ReadonlySet<string> = new Set(builtinModules.map((name) => name.replace(/^node:/, '')));

/** The package a specifier names: `@scope/name` or `name`, whatever path follows. Null for a relative path or a Node builtin. */
function packageOf(specifier: string): string | null {
  if (specifier.startsWith('.') || specifier.startsWith('/') || specifier.startsWith('node:')) return null;
  const parts = specifier.split('/');
  const name = specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];

  return BUILTINS.has(name) ? null : name;
}

/** True when TypeScript erases the whole import: `import type …`, or named imports that are all `type` with no default. */
function isErasedImport(node: ts.ImportDeclaration): boolean {
  const clause = node.importClause;
  if (!clause) return false;
  if (clause.isTypeOnly) return true;
  const named = clause.namedBindings;

  return (
    clause.name === undefined &&
    named !== undefined &&
    ts.isNamedImports(named) &&
    named.elements.length > 0 &&
    named.elements.every((element) => element.isTypeOnly)
  );
}

function stringLiteralOf(node: ts.Expression | undefined): string | null {
  return node && ts.isStringLiteralLike(node) ? node.text : null;
}

/** The external packages `source` imports at runtime (static import, `export … from`, dynamic `import()` and `require()`). */
export function runtimePackagesOf(source: string): string[] {
  const file = ts.createSourceFile('source.ts', source, ts.ScriptTarget.Latest, true);
  const found = new Set<string>();
  const add = (specifier: string | null): void => {
    const name = specifier === null ? null : packageOf(specifier);
    if (name) found.add(name);
  };

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && !isErasedImport(node)) add(stringLiteralOf(node.moduleSpecifier));
    else if (ts.isExportDeclaration(node) && !node.isTypeOnly) add(stringLiteralOf(node.moduleSpecifier));
    else if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const dynamicImport = callee.kind === ts.SyntaxKind.ImportKeyword;
      const requireCall = ts.isIdentifier(callee) && callee.text === 'require';
      if (dynamicImport || requireCall) add(stringLiteralOf(node.arguments[0]));
    }
    ts.forEachChild(node, visit);
  };
  visit(file);

  return [...found];
}

/** Every `.ts` file below `directory` that is not a spec. */
function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);

    return path.endsWith('.ts') && !path.endsWith('.spec.ts') ? [path] : [];
  });
}

/** Package → the files (relative to `directory`'s parent, `/` separated, sorted) of the tree that import it at runtime. */
export function runtimePackagesOfTree(directory: string): Map<string, string[]> {
  const packages = new Map<string, string[]>();
  const base = join(directory, '..');
  for (const path of sourceFiles(directory)) {
    const shown = relative(base, path).split(sep).join('/');
    for (const name of runtimePackagesOf(readFileSync(path, 'utf8')))
      packages.set(name, [...(packages.get(name) ?? []), shown]);
  }
  for (const files of packages.values()) files.sort();

  return new Map([...packages].sort(([a], [b]) => a.localeCompare(b)));
}
