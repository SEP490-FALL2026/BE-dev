import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { capabilityGraph, capabilityNames, coreUsers, cyclesOf, placeOf } = require('../arch/capability-graph.cjs');
const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const edges = (pairs) =>
  pairs.reduce((graph, [from, to]) => {
    const byTo = graph.get(from) ?? new Map();
    byTo.set(to, [`${from} -> ${to}`]);
    return graph.set(from, byTo);
  }, new Map());

describe('cyclesOf', () => {
  test('finds a cycle of two capabilities', () => {
    assert.deepEqual(
      cyclesOf(
        edges([
          ['a', 'b'],
          ['b', 'a'],
        ]),
      ),
      [['a', 'b']],
    );
  });

  test('finds no cycle in a chain, a diamond or an empty graph', () => {
    assert.deepEqual(
      cyclesOf(
        edges([
          ['a', 'b'],
          ['b', 'c'],
        ]),
      ),
      [],
    );
    assert.deepEqual(
      cyclesOf(
        edges([
          ['a', 'b'],
          ['a', 'c'],
          ['b', 'd'],
          ['c', 'd'],
        ]),
      ),
      [],
    );
    assert.deepEqual(cyclesOf(new Map()), []);
  });

  test('reports a cycle of three once, with the capability that only enters it left out', () => {
    assert.deepEqual(
      cyclesOf(
        edges([
          ['entry', 'c'],
          ['c', 'a'],
          ['a', 'b'],
          ['b', 'c'],
          ['b', 'leaf'],
        ]),
      ),
      [['a', 'b', 'c']],
    );
  });

  test('reports two separate cycles, sorted, and merges cycles that share a capability', () => {
    assert.deepEqual(
      cyclesOf(
        edges([
          ['x', 'y'],
          ['y', 'x'],
          ['a', 'b'],
          ['b', 'a'],
        ]),
      ),
      [
        ['a', 'b'],
        ['x', 'y'],
      ],
    );
    assert.deepEqual(
      cyclesOf(
        edges([
          ['a', 'b'],
          ['b', 'a'],
          ['b', 'c'],
          ['c', 'b'],
        ]),
      ),
      [['a', 'b', 'c']],
    );
  });
});

describe('placeOf', () => {
  test('names the capability of a file, its group folders included, and none for the root or public/', () => {
    assert.deepEqual(placeOf('modules/m/a/a.service.ts'), { module: 'm', capability: 'a' });
    assert.deepEqual(placeOf('modules/m/a/group/a-group.service.ts'), { module: 'm', capability: 'a' });
    assert.deepEqual(placeOf('modules/m/m.module.ts'), { module: 'm', capability: null });
    assert.deepEqual(placeOf('modules/m/public/m.api.ts'), { module: 'm', capability: null });
  });
});

describe('the graph of a source tree', () => {
  const root = mkdtempSync(join(tmpdir(), 'slm-capability-graph-'));
  after(() => rmSync(root, { recursive: true, force: true }));
  const put = (path, text = '') => {
    const file = join(root, 'src', path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
  };

  // module m: a -> b, a -> c (type only), b -> a (dynamic import: a cycle), b -> d (`.js` suffix), c -> d (index.ts).
  put(
    'modules/m/a/a.service.ts',
    `import { B } from '../b/b.repo';\nimport type { C } from '../c/c.types';\nimport { own } from './group/a-group.service';\nimport { money } from '../../../core/money';\nexport const a = [B, own, money];\n`,
  );
  put('modules/m/a/a.repo.ts');
  put('modules/m/a/group/a-group.service.ts', `import { repo } from '../a.repo';\nexport const own = repo;\n`);
  put('modules/m/b/b.repo.ts', `export const load = () => import('../a/a.repo');\n`);
  put('modules/m/b/b-thing.ts', `import { thing } from '../d/d-thing.js';\nexport const t = thing;\n`);
  put('modules/m/c/c.types.ts', `export * from '../d';\n`);
  put('modules/m/d/index.ts');
  put('modules/m/d/d-thing.ts');
  // Left out: wiring (importer and imported), the module root, public/, specs and a generated folder.
  put('modules/m/m.module.ts', `import { a } from './a/a.service';\n`);
  put('modules/m/a/a.module.ts', `import { B } from '../b/b.repo';\n`);
  put('modules/m/e/e.service.ts', `import { AModule } from '../a/a.module';\n`);
  put('modules/m/m-root.ts', `import { a } from './a/a.service';\n`);
  put('modules/m/public/m.api.ts', `import { a } from '../a/a.service';\n`);
  put('modules/m/f/f.service.ts', `import { api } from '../public/m.api';\n`);
  put('modules/m/g/g.service.spec.ts', `import { a } from '../a/a.service';\n`);
  put('modules/m/h/generated/h-gen.ts', `import { a } from '../../a/a.service';\n`);
  // Another module: an import across modules is not a capability edge; the `src/` alias resolves like a relative path.
  put('modules/n/x/x.service.ts', `import { a } from '../../m/a/a.repo';\n`);
  put(
    'modules/n/y/y.service.ts',
    `import { x } from 'src/modules/n/x/x.service';\nimport { Injectable } from '@nestjs/common';\n`,
  );
  put('modules/p/q/q.service.ts');
  // src/core and who uses it.
  put('core/money.ts', `import { inner } from './nested/inner';\nexport const money = inner;\n`);
  put('core/nested/inner.ts');
  put('core/csv.ts');
  put('core/unused.ts');
  put('infrastructure/db.ts', `import { money } from '../core/money';\nexport const db = money;\n`);
  put('main.ts', `import { csv } from './core/csv';\n`);

  const graph = capabilityGraph(join(root, 'src'));
  const targetsOf = (module, from) => Object.fromEntries([...(graph.get(module).get(from) ?? [])].sort());

  test('lists every module of src/modules, those with no edge included', () => {
    assert.deepEqual([...graph.keys()], ['m', 'n', 'p']);
    assert.equal(graph.get('p').size, 0);
  });

  test('records an import between two capabilities of a module, whatever its form', () => {
    assert.deepEqual(targetsOf('m', 'a'), {
      b: ['modules/m/a/a.service.ts -> modules/m/b/b.repo.ts'],
      c: ['modules/m/a/a.service.ts -> modules/m/c/c.types.ts'],
    });
    assert.deepEqual(targetsOf('m', 'b'), {
      a: ['modules/m/b/b.repo.ts -> modules/m/a/a.repo.ts'],
      d: ['modules/m/b/b-thing.ts -> modules/m/d/d-thing.ts'],
    });
    assert.deepEqual(targetsOf('m', 'c'), { d: ['modules/m/c/c.types.ts -> modules/m/d/index.ts'] });
  });

  test('leaves out imports inside a capability, wiring, specs, generated and other modules, and files that no capability imports', () => {
    for (const from of ['e', 'g', 'h']) assert.deepEqual(targetsOf('m', from), {}, from);
    assert.deepEqual([...graph.get('m').keys()].sort(), ['a', 'b', 'c', 'f']);
    assert.deepEqual(targetsOf('n', 'x'), {});
    assert.deepEqual(targetsOf('n', 'y'), { x: ['modules/n/y/y.service.ts -> modules/n/x/x.service.ts'] });
  });

  test('credits a capability that imports the facade or a root file with the capabilities they reach, printed as "via"', () => {
    // f -> public/m.api.ts -> a: the facade of the module is not a capability, and it is not a wall either
    assert.deepEqual(targetsOf('m', 'f'), {
      a: ['modules/m/f/f.service.ts -> modules/m/a/a.service.ts (via modules/m/public/m.api.ts)'],
    });
  });

  test('finds the cycle that the graph holds', () => {
    assert.deepEqual(cyclesOf(graph.get('m')), [['a', 'b']]);
    assert.deepEqual(cyclesOf(graph.get('n')), []);
  });

  test('names the capabilities of each module (folders with a production file), with or without an edge', () => {
    assert.deepEqual(
      capabilityNames(join(root, 'src')),
      new Map([
        ['m', ['a', 'b', 'c', 'd', 'e', 'f']],
        ['n', ['x', 'y']],
        ['p', ['q']],
      ]),
    );
  });

  test('tells which areas outside core import each file of src/core, and lists the files nobody imports', () => {
    assert.deepEqual(
      coreUsers(join(root, 'src')),
      new Map([
        ['core/csv.ts', ['(root)']],
        ['core/money.ts', ['infrastructure', 'm']],
        ['core/nested/inner.ts', []],
        ['core/unused.ts', []],
      ]),
    );
  });
});

describe('a cycle through the facade, a root file or public/', () => {
  const root = mkdtempSync(join(tmpdir(), 'slm-capability-graph-via-'));
  after(() => rmSync(root, { recursive: true, force: true }));
  const put = (path, text = '') => {
    const file = join(root, 'src', path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
  };

  // v: a -> public/v.api.ts -> b -> a, through the module's own facade: a cycle that no direct import shows.
  put('modules/v/a/a.service.ts', `import { VApi } from '../public/v.api';\nexport const a = VApi;\n`);
  put('modules/v/b/b.service.ts', `import { a } from '../a/a.service';\nexport const b = a;\n`);
  put('modules/v/public/v.api.ts', `import { b } from '../b/b.service';\nexport const VApi = b;\n`);
  // r: a -> root file -> another root file -> b -> a.
  put('modules/r/a/a.service.ts', `import { map } from '../r.http-errors';\nexport const a = map;\n`);
  put('modules/r/b/b.service.ts', `import { a } from '../a/a.service';\nexport const b = a;\n`);
  put('modules/r/r.http-errors.ts', `import { shared } from './r-shared.types';\nexport const map = shared;\n`);
  put('modules/r/r-shared.types.ts', `import { b } from './b/b.service';\nexport const shared = b;\n`);
  // w: a facade that only other modules import stays green; wiring is not followed; the importer is not credited with itself.
  put('modules/w/a/a.service.ts', `export const a = 1;\n`);
  put('modules/w/b/b.service.ts', `import { a } from '../a/a.service';\nexport const b = a;\n`);
  put(
    'modules/w/public/w.api.ts',
    `import { a } from '../a/a.service';\nimport { b } from '../b/b.service';\nexport const WApi = [a, b];\n`,
  );
  put('modules/w/public/w-a.api.ts', `import { a } from '../a/a.service';\nexport const WaApi = a;\n`);
  put('modules/w/a/a-self.service.ts', `import { WaApi } from '../public/w-a.api';\nexport const s = WaApi;\n`);
  put('modules/w/w.module.ts', `import { b } from './b/b.service';\nexport const m = b;\n`);
  put('modules/w/c/c.service.ts', `import { m } from '../w.module';\nexport const c = m;\n`);
  put('modules/x/c/c.service.ts', `import { WApi } from '../../w/public/w.api';\nexport const c = WApi;\n`);

  const graph = capabilityGraph(join(root, 'src'));

  test('finds a -> public/v.api.ts -> b -> a as a cycle, and names the facade on the edge', () => {
    assert.deepEqual(cyclesOf(graph.get('v')), [['a', 'b']]);
    assert.deepEqual(graph.get('v').get('a').get('b'), [
      'modules/v/a/a.service.ts -> modules/v/b/b.service.ts (via modules/v/public/v.api.ts)',
    ]);
  });

  test('finds a -> root file -> b -> a as a cycle, through two root files, and names both', () => {
    assert.deepEqual(cyclesOf(graph.get('r')), [['a', 'b']]);
    assert.deepEqual(graph.get('r').get('a').get('b'), [
      'modules/r/a/a.service.ts -> modules/r/b/b.service.ts (via modules/r/r.http-errors.ts -> modules/r/r-shared.types.ts)',
    ]);
  });

  test('keeps green a facade that only other modules import, and does not follow wiring', () => {
    assert.deepEqual(cyclesOf(graph.get('w')), []);
    assert.equal(graph.get('w').get('c'), undefined, 'wiring is not followed');
    assert.equal(graph.get('w').get('a')?.get('a'), undefined, 'a capability is not credited with itself');
    assert.equal(graph.get('x').get('c'), undefined, 'the facade of another module is not an edge of this one');
  });
});

describe('the command', () => {
  const run = (...args) =>
    spawnSync(process.execPath, ['scripts/arch/capabilities.mjs', ...args], { cwd: projectRoot, encoding: 'utf8' });

  test('prints a line for every module of the repository and the modules with a cycle', () => {
    const { status, stdout } = run();

    assert.equal(status, 0);
    for (const module of ['audit', 'catalog', 'requests'])
      assert.match(stdout, new RegExp(`^${module}: \\d+ capabilities, \\d+ capability edges, cycles: `, 'm'));
    assert.match(stdout, /^modules with a capability cycle: \d+\/\d+ \(.*\)$/m);
  });

  test('prints the edges of one module with the imports behind each, and refuses an unknown module', () => {
    const one = run('--module', 'catalog');

    assert.equal(one.status, 0);
    assert.match(one.stdout, /^ {2}\S+ -> \S+ \(\d+ imports\)$/m);
    assert.match(one.stdout, /^ {6}modules\/catalog\/\S+\.ts -> modules\/catalog\/\S+\.ts$/m);
    assert.doesNotMatch(one.stdout, /^requests:/m);
    const unknown = run('--module', 'no-such-module');
    assert.equal(unknown.status, 1);
    assert.match(unknown.stderr, /no module "no-such-module"/);
    assert.equal(run('--module').status, 1);
  });

  test('prints each file of src/core with the areas that use it', () => {
    const { status, stdout } = run('--core');

    assert.equal(status, 0);
    assert.match(stdout, /^core\/money\/money\.ts: .+$/m);
  });

  test('prints the files an edge goes through when it goes through the facade or a root file', () => {
    const { stdout } = run('--module', 'catalog');

    assert.doesNotMatch(stdout, /^ {6}\S+ -> \S+ \(via$/m);
    assert.match(stdout, /^ {6}modules\/catalog\/\S+\.ts -> modules\/catalog\/\S+\.ts( \(via \S+( -> \S+)*\))?$/m);
  });
});
