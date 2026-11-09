// `pnpm arch:capabilities [--module <m>] [--core]`: capability edges and cycles of each module (R6), with `--module` also the layer
// L0–L3 of each capability, or who uses each file of src/core (R7). Prints only and exits 0; the gate that fails on a cycle is test/gates/capability-graph.gate-spec.ts
// (Task 3.1 of be-architecture-readability-hardening). Run from the repository root.
import { createRequire } from 'node:module';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const {
  capabilityGraph,
  capabilityNames,
  controllerCapabilities,
  coreUsers,
  cyclesOf,
  layersOf,
} = require('./capability-graph.cjs');

const srcRoot = join(process.cwd(), 'src');
const args = process.argv.slice(2);
const moduleIndex = args.indexOf('--module');
const only = moduleIndex === -1 ? null : args[moduleIndex + 1];

if (moduleIndex !== -1 && (!only || only.startsWith('--'))) {
  console.error('usage: pnpm arch:capabilities [--module <module>] [--core]');
  process.exit(1);
}

if (args.includes('--core')) {
  for (const [file, areas] of coreUsers(srcRoot))
    console.log(`${file}: ${areas.join(', ') || '(no area outside core)'}`);
} else {
  const graph = capabilityGraph(srcRoot);
  const names = capabilityNames(srcRoot);
  const controllers = controllerCapabilities(srcRoot);
  if (only && !graph.has(only)) {
    console.error(`no module "${only}" in src/modules: ${[...graph.keys()].join(', ')}`);
    process.exit(1);
  }
  const withCycle = [];
  for (const [module, edges] of graph) {
    const count = [...edges.values()].reduce((sum, to) => sum + to.size, 0);
    const cycles = cyclesOf(edges);
    if (cycles.length > 0) withCycle.push(module);
    if (only && module !== only) continue;
    const shown = cycles.map((cycle) => `[${cycle.length}: ${cycle.join(', ')}]`).join(' ') || 'none';
    console.log(`${module}: ${names.get(module).length} capabilities, ${count} capability edges, cycles: ${shown}`);
    if (!only) continue;
    console.log('  layers (L3 has a controller; else L0 imports no capability, L1 only L0, L2 also L1 or L2):');
    const layers = layersOf(edges, names.get(module), controllers.get(module));
    const width = Math.max(...names.get(module).map((name) => name.length));
    for (const [name, info] of layers) {
      const importers = info.layer === 'L3' && info.importedBy.length > 0 ? `: ${info.importedBy.join(', ')}` : '';
      // no edge in either direction and no controller: nothing imports it and it imports nothing
      const isolated = info.layer === 'L0' && info.importedBy.length === 0;
      const layer = isolated ? 'L0 (cô lập)' : info.layer;
      console.log(
        `  ${layer.padEnd(11)}  ${name.padEnd(width)}  imports ${info.imports.length}, imported by ${info.importedBy.length}${importers}`,
      );
    }
    console.log('  edges:');
    for (const [from, to] of [...edges].sort(([a], [b]) => a.localeCompare(b))) {
      for (const [target, files] of [...to].sort(([a], [b]) => a.localeCompare(b))) {
        console.log(`  ${from} -> ${target} (${files.length} imports)`);
        for (const edge of files.sort()) console.log(`      ${edge}`);
      }
    }
  }
  if (!only)
    console.log(
      `modules with a capability cycle: ${withCycle.length}/${graph.size} (${withCycle.join(', ') || 'none'})`,
    );
}
