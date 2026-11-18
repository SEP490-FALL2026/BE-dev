import type { Type } from '@nestjs/common';

/**
 * The Nest module graph as the metadata of the decorators describes it, read without starting an application: the
 * gates `module-graph` and `extension-wiring` both walk it. Nothing here asserts.
 */

export interface ModuleNode {
  /** The module class; for a dynamic module, the class its `module` property names. */
  module: Type<unknown>;
  controllers: unknown[];
  providers: unknown[];
  imports: unknown[];
  /** What the module makes visible to the modules that import it: provider tokens, and modules it re-exports. */
  exports: unknown[];
}

export type Token = unknown;

export function metadata(module: Type<unknown>, key: 'imports' | 'providers' | 'controllers' | 'exports'): unknown[] {
  return (Reflect.getMetadata(key, module) as unknown[] | undefined) ?? [];
}

function isDynamicModule(entry: object): entry is {
  module: Type<unknown>;
  imports?: unknown[];
  providers?: unknown[];
  controllers?: unknown[];
  exports?: unknown[];
} {
  return 'module' in entry;
}

/** Reads the metadata Nest itself would read. Promises (async modules) and forwardRef are not followed. */
export function describeModule(entry: unknown): ModuleNode | null {
  if (typeof entry === 'function') {
    const module = entry as Type<unknown>;

    return {
      module,
      controllers: metadata(module, 'controllers'),
      providers: metadata(module, 'providers'),
      imports: metadata(module, 'imports'),
      exports: metadata(module, 'exports'),
    };
  }
  if (typeof entry !== 'object' || entry === null || 'then' in entry || 'forwardRef' in entry) return null;
  if (!isDynamicModule(entry)) return null;

  return {
    module: entry.module,
    controllers: [...metadata(entry.module, 'controllers'), ...(entry.controllers ?? [])],
    providers: [...metadata(entry.module, 'providers'), ...(entry.providers ?? [])],
    imports: [...metadata(entry.module, 'imports'), ...(entry.imports ?? [])],
    exports: [...metadata(entry.module, 'exports'), ...(entry.exports ?? [])],
  };
}

/** Every module reachable from `root` through `imports`, the root included. A static module appears once. */
export function collectGraph(root: Type<unknown>): ModuleNode[] {
  const nodes: ModuleNode[] = [];
  const seen = new Set<unknown>();
  const pending: unknown[] = [root];

  while (pending.length > 0) {
    const entry = pending.pop();
    if (seen.has(entry)) continue;
    seen.add(entry);

    const node = describeModule(entry);
    if (!node) continue;

    nodes.push(node);
    pending.push(...node.imports);
  }

  return nodes;
}

export function tokenOf(provider: unknown): Token {
  if (typeof provider === 'object' && provider !== null && 'provide' in provider) return provider.provide;

  return provider;
}

export function tokenName(token: Token): string {
  if (typeof token === 'function') return token.name;

  return String(token);
}
