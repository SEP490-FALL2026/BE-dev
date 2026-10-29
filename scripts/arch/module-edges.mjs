// Module-to-module import edges of src/modules (production files; specs excluded). Shared by `pnpm arch:graph` and
// scripts/ci/affected-modules.mjs. All imports in this repository are relative, so a regex and a resolve suffice.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

const IMPORT = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*)['"](\.{1,2}\/[^'"]+)['"]/g;

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return walk(path);
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts') ? [path] : [];
  });
}

/** [["requests>budgets", 16], …] sorted by key: importer module > imported module, with the import count. */
export function moduleEdges(root) {
  const modules = resolve(root, 'src', 'modules');
  const moduleOf = (file) => relative(modules, file).split(sep)[0];
  const edges = new Map();
  for (const file of walk(modules)) {
    const from = moduleOf(file);
    for (const match of readFileSync(file, 'utf8').matchAll(IMPORT)) {
      const target = resolve(dirname(file), match[1]);
      if (!target.startsWith(modules + sep)) continue;
      const to = moduleOf(target);
      if (to === from) continue;
      const key = `${from}>${to}`;
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
  }
  return [...edges].sort(([a], [b]) => a.localeCompare(b));
}

/** Every module that imports `name`, directly or through another module (the ones a change to `name` can break). */
export function dependentsOf(root, names) {
  const importers = new Map();
  for (const [key] of moduleEdges(root)) {
    const [from, to] = key.split('>');
    importers.set(to, [...(importers.get(to) ?? []), from]);
  }
  const seen = new Set(names);
  const queue = [...names];
  while (queue.length) {
    for (const importer of importers.get(queue.shift()) ?? []) {
      if (!seen.has(importer)) {
        seen.add(importer);
        queue.push(importer);
      }
    }
  }
  return [...seen].sort();
}
