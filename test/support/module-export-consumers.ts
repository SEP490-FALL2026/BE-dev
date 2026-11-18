import { PROPERTY_DEPS_METADATA, SELF_DECLARED_DEPS_METADATA } from '@nestjs/common/constants';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { tokenName, tokenOf, type ModuleNode, type Token } from './nest-module-graph';

/**
 * Who uses what a Nest module exports, read from the DI metadata of a graph (`nest-module-graph.ts`), without starting an
 * application. Nothing here asserts: the gate `module-graph` (R10) judges the answer.
 */

/** One class that asks for a token a module it imports exports. */
export interface ExportConsumer {
  /** The module that lists the token in its `exports` (the inner one when a module in between re-exports it). */
  exporter: string;
  token: string;
  /** The provider or controller whose constructor injects the token (a factory provider is named by its token). */
  consumer: string;
  /** The module that declares the consumer and imports the exporter. */
  consumerModule: string;
}

interface Dependency {
  index?: number;
  param?: Token;
  type?: Token;
}

/** The tokens a class asks for: its constructor parameters (`@Inject` wins over the parameter type) and its `@Inject` properties. */
function injectedBy(type: unknown): Token[] {
  if (typeof type !== 'function') return [];
  const types = (Reflect.getMetadata('design:paramtypes', type) as Token[] | undefined) ?? [];
  const declared = (Reflect.getMetadata(SELF_DECLARED_DEPS_METADATA, type) as Dependency[] | undefined) ?? [];
  const properties = (Reflect.getMetadata(PROPERTY_DEPS_METADATA, type) as Dependency[] | undefined) ?? [];
  const parameters = types.map(
    (paramType, index) => declared.find((entry) => entry.index === index)?.param ?? paramType,
  );
  const beyondTypes = declared.filter((entry) => (entry.index ?? 0) >= types.length).map((entry) => entry.param);

  return [...parameters, ...beyondTypes, ...properties.map((entry) => entry.type)].filter(
    (token): token is Token => token !== undefined,
  );
}

/**
 * What a custom provider injects: the class of `useClass`, the tokens a factory lists (`{ token }` or the token itself), or the target of
 * `useExisting` (an alias hands the target to whoever injects the alias, so the module that declares the alias is a consumer of it).
 */
function injectedByProvider(provider: unknown): { name: string; tokens: Token[] } {
  if (typeof provider !== 'object' || provider === null) {
    return { name: tokenName(provider), tokens: injectedBy(provider) };
  }
  if ('useClass' in provider) return { name: tokenName(tokenOf(provider)), tokens: injectedBy(provider.useClass) };
  if ('useExisting' in provider) return { name: tokenName(tokenOf(provider)), tokens: [provider.useExisting] };
  if ('inject' in provider && Array.isArray(provider.inject)) {
    const tokens = (provider.inject as unknown[]).map((entry) =>
      typeof entry === 'object' && entry !== null && 'token' in entry ? entry.token : entry,
    );

    return { name: tokenName(tokenOf(provider)), tokens };
  }

  return { name: tokenName(tokenOf(provider)), tokens: [] };
}

/** The module an `exports` or `imports` entry names, when it is one of the graph (a class, or a dynamic module). */
function moduleOf(entry: unknown, graph: ReadonlyMap<unknown, ModuleNode>): ModuleNode | undefined {
  if (typeof entry === 'function') return graph.get(entry);
  if (typeof entry === 'object' && entry !== null && 'module' in entry) return graph.get(entry.module);

  return undefined;
}

/** The tokens that importing `node` makes visible, each with the module that lists it; a re-exported module brings its own exports. */
function visibleThrough(
  node: ModuleNode,
  graph: ReadonlyMap<unknown, ModuleNode>,
  seen = new Set<unknown>(),
): [Token, string][] {
  if (seen.has(node.module)) return [];
  seen.add(node.module);

  return node.exports.flatMap((entry): [Token, string][] => {
    const reExported = moduleOf(entry, graph);
    if (reExported) return visibleThrough(reExported, graph, seen);

    return [[tokenOf(entry), node.module.name]];
  });
}

/**
 * Every (exporter, token, consumer) of a graph: a provider or a controller of a module whose constructor injects a token that a module
 * it imports exports, directly or by re-exporting a module that does. The import of a module whose classes never inject the token is
 * not a consumer of it.
 */
export function consumersOfExports(graph: ModuleNode[]): ExportConsumer[] {
  const byModule = new Map<unknown, ModuleNode>(graph.map((node) => [node.module, node]));
  const found = new Map<string, ExportConsumer>();

  for (const node of graph) {
    const visible = new Map<Token, Set<string>>();
    for (const entry of node.imports) {
      const imported = moduleOf(entry, byModule);
      if (!imported) continue;
      for (const [token, exporter] of visibleThrough(imported, byModule)) {
        visible.set(token, (visible.get(token) ?? new Set()).add(exporter));
      }
    }
    const classes = [
      ...node.providers.map(injectedByProvider),
      ...node.controllers.map((controller) => ({ name: tokenName(controller), tokens: injectedBy(controller) })),
    ];
    for (const { name, tokens } of classes) {
      for (const token of tokens) {
        for (const exporter of visible.get(token) ?? []) {
          const use = { exporter, token: tokenName(token), consumer: name, consumerModule: node.module.name };
          found.set(JSON.stringify(use), use);
        }
      }
    }
  }

  return [...found.values()];
}

/** The uses whose consumer module is in another folder than the exporting module (`folderOf` names the folder of a module class). */
export function outsideConsumers(
  uses: readonly ExportConsumer[],
  folderOf: (moduleName: string) => string,
): ExportConsumer[] {
  return uses.filter((use) => folderOf(use.consumerModule) !== folderOf(use.exporter));
}

/**
 * The folder of every Nest module class declared in a `*.module.ts` below `sourceRoot`: `modules/<module>` for a business module (all
 * its capabilities are one folder), otherwise the folder of the file. A module no file declares (a library's) has no entry.
 */
export function moduleFolders(sourceRoot: string): ReadonlyMap<string, string> {
  const folders = new Map<string, string>();
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory)) {
      const path = join(directory, entry);
      if (statSync(path).isDirectory()) {
        if (entry !== 'generated') visit(path);
      } else if (entry.endsWith('.module.ts')) {
        const parts = relative(sourceRoot, dirname(path)).split(sep);
        const folder = parts[0] === 'modules' ? parts.slice(0, 2).join('/') : parts.join('/');
        for (const match of readFileSync(path, 'utf8').matchAll(/\bexport\s+class\s+(\w+)/g)) {
          folders.set(match[1], folder);
        }
      }
    }
  };
  visit(sourceRoot);

  return folders;
}
