// Capability graph of each business module (docs/rules/module-structure.md, R6): which capability folder of a module
// imports which other capability folder of the same module. `*.module.ts` wiring (as importer or as imported), specs and
// `src/generated` are left out. A file at the module root or under `public/` is not a capability but it is transparent: when
// capability A imports such a file, A is credited with an edge to every capability the file reaches, through further root and
// `public/` files, and the edge is printed `<A file> -> <B file> (via <root or public files>)`. Without this a cycle that runs
// through the module's own facade (`public/<m>.api.ts`) or a root file stays invisible.
// Imports are read with the TypeScript parser, so `import type`, `export … from`, `import('…')` and `require('…')` all
// count (like `tsPreCompilationDeps` of .dependency-cruiser.cjs, which `pnpm arch:check` uses).
const { existsSync, readFileSync, readdirSync } = require('node:fs');
const { dirname, join, relative, resolve, sep } = require('node:path');
const ts = require('typescript');

/** Every production `.ts` file under `directory` (specs and any `generated` folder left out), as absolute paths. */
function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === 'generated' ? [] : sourceFiles(path);
    return path.endsWith('.ts') && !path.endsWith('.spec.ts') ? [path] : [];
  });
}

/** `/abs/src/modules/a/b.ts` → `modules/a/b.ts`: the path as the rules write it, with `/` on every platform. */
const toSrc = (srcRoot, file) => relative(srcRoot, file).split(sep).join('/');

/**
 * `modules/<m>/<capability>/…` → `{ module, capability }`. The capability is null for a file at the module root and for
 * `public/`; a group folder inside a capability belongs to that capability.
 */
function placeOf(srcPath) {
  const parts = srcPath.split('/');
  const capability = parts.length > 3 && parts[2] !== 'public' ? parts[2] : null;
  return { module: parts[1], capability };
}

/**
 * The files of `src` that `file` imports (absolute paths). Resolves `./x` to `x.ts` or `x/index.ts`, `./x.js` to `x.ts`
 * and the `src/*` path alias of tsconfig.json; a package or an import that names no file of `src` is dropped.
 */
function importsOf(file, srcRoot) {
  const { importedFiles } = ts.preProcessFile(readFileSync(file, 'utf8'), true, true);
  return importedFiles
    .map(({ fileName }) => fileName)
    .map((specifier) => {
      if (specifier.startsWith('.')) return resolve(dirname(file), specifier);
      return specifier.startsWith('src/') ? resolve(srcRoot, specifier.slice('src/'.length)) : null;
    })
    .filter(Boolean)
    .map((base) => base.replace(/\.js$/, ''))
    .map((base) => [`${base}.ts`, join(base, 'index.ts')].find((candidate) => existsSync(candidate)))
    .filter(Boolean);
}

/** The modules of `src/modules`, sorted: a module with no capability edge still appears, with an empty graph. */
function moduleNames(srcRoot) {
  return readdirSync(join(srcRoot, 'modules'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

/**
 * The capability files a root or `public/` file of the same module reaches, through further root and `public/` files:
 * Map<capability file (absolute), root/public files walked from `start` to it>. Wiring (`*.module.ts`) is not followed.
 */
function reachThroughRoot(start, module, srcRoot) {
  const found = new Map();
  const visited = new Set([start]);
  const walk = (file, chain) => {
    for (const target of importsOf(file, srcRoot)) {
      if (target.endsWith('.module.ts')) continue;
      const to = placeOf(toSrc(srcRoot, target));
      if (to.module !== module) continue;
      if (to.capability) {
        if (!found.has(target)) found.set(target, chain);
      } else if (!visited.has(target)) {
        visited.add(target);
        walk(target, [...chain, target]);
      }
    }
  };
  walk(start, [start]);
  return found;
}

/**
 * Map<module, Map<fromCapability, Map<toCapability, string[]>>>, the strings being `file -> file` edges, or
 * `file -> file (via root-or-public file -> …)` when the import goes through a file of the module root or `public/`.
 */
function capabilityGraph(srcRoot) {
  const graph = new Map(moduleNames(srcRoot).map((name) => [name, new Map()]));
  const reachCache = new Map();
  const reachOf = (file, module) => {
    if (!reachCache.has(file)) reachCache.set(file, reachThroughRoot(file, module, srcRoot));
    return reachCache.get(file);
  };
  const add = (module, from, to, edge) => {
    const byFrom = graph.get(module);
    const byTo = byFrom.get(from) ?? new Map();
    byTo.set(to, [...(byTo.get(to) ?? []), edge]);
    byFrom.set(from, byTo);
  };
  for (const file of sourceFiles(join(srcRoot, 'modules'))) {
    if (file.endsWith('.module.ts')) continue;
    const from = placeOf(toSrc(srcRoot, file));
    if (!from.capability) continue;
    for (const target of importsOf(file, srcRoot)) {
      if (target.endsWith('.module.ts')) continue;
      const to = placeOf(toSrc(srcRoot, target));
      if (to.module !== from.module) continue;
      if (to.capability) {
        if (to.capability !== from.capability) {
          add(from.module, from.capability, to.capability, `${toSrc(srcRoot, file)} -> ${toSrc(srcRoot, target)}`);
        }
        continue;
      }
      for (const [reached, chain] of reachOf(target, from.module)) {
        const place = placeOf(toSrc(srcRoot, reached));
        if (place.capability === from.capability) continue;
        const via = chain.map((viaFile) => toSrc(srcRoot, viaFile)).join(' -> ');
        add(
          from.module,
          from.capability,
          place.capability,
          `${toSrc(srcRoot, file)} -> ${toSrc(srcRoot, reached)} (via ${via})`,
        );
      }
    }
  }
  return graph;
}

/** Map<module, sorted capability folder names>: the folders with a production file, whether or not an edge touches them. */
function capabilityNames(srcRoot) {
  const names = new Map(moduleNames(srcRoot).map((name) => [name, new Set()]));
  for (const file of sourceFiles(join(srcRoot, 'modules'))) {
    const { module, capability } = placeOf(toSrc(srcRoot, file));
    if (capability) names.get(module).add(capability);
  }
  return new Map([...names].map(([module, set]) => [module, [...set].sort()]));
}

/**
 * Map<core file, sorted areas importing it from outside core>, for every file of `src/core` (an empty list = only core or
 * nobody uses it). An area is a module name, `infrastructure`, `app`, `worker`, `cli` or `(root)` for `src/main.ts` & co.
 */
function coreUsers(srcRoot) {
  const files = sourceFiles(srcRoot).map((file) => ({ file, path: toSrc(srcRoot, file) }));
  const users = new Map(
    files
      .filter(({ path }) => path.startsWith('core/'))
      .map(({ path }) => [path, new Set()])
      .sort(([a], [b]) => a.localeCompare(b)),
  );
  for (const { file, path } of files) {
    if (path.startsWith('core/')) continue;
    const parts = path.split('/');
    const area = parts.length === 1 ? '(root)' : parts[0] === 'modules' ? parts[1] : parts[0];
    for (const target of importsOf(file, srcRoot)) users.get(toSrc(srcRoot, target))?.add(area);
  }
  return new Map([...users].map(([core, areas]) => [core, [...areas].sort()]));
}

/** Strongly connected components of more than one capability (Tarjan), each sorted, the list sorted. */
function cyclesOf(edges) {
  let index = 0;
  const order = new Map();
  const low = new Map();
  const stack = [];
  const onStack = new Set();
  const cycles = [];
  const nodes = new Set([...edges.keys(), ...[...edges.values()].flatMap((to) => [...to.keys()])]);
  const visit = (node) => {
    order.set(node, index);
    low.set(node, index);
    index += 1;
    stack.push(node);
    onStack.add(node);
    for (const next of edges.get(node)?.keys() ?? []) {
      if (!order.has(next)) {
        visit(next);
        low.set(node, Math.min(low.get(node), low.get(next)));
      } else if (onStack.has(next)) {
        low.set(node, Math.min(low.get(node), order.get(next)));
      }
    }
    if (low.get(node) !== order.get(node)) return;
    const component = [];
    let member;
    do {
      member = stack.pop();
      onStack.delete(member);
      component.push(member);
    } while (member !== node);
    if (component.length > 1) cycles.push(component.sort());
  };
  for (const node of [...nodes].sort()) if (!order.has(node)) visit(node);
  return cycles.sort((a, b) => a[0].localeCompare(b[0]));
}

module.exports = {
  capabilityGraph,
  capabilityNames,
  coreUsers,
  cyclesOf,
  importsOf,
  placeOf,
};
