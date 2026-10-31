import { readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

// R6 (docs/rules/module-structure.md): inside one module, capabilities may import each other, but never in a circle.
// The same CommonJS file serves `pnpm arch:capabilities`, which prints the edges this gate judges. A file of the module root or of
// `public/` is not a capability but it is not a wall either: an import of the facade of the module, or of a root file, counts as an
// import of the capabilities that file reaches (the edge is printed "via <file>").
// eslint-disable-next-line @typescript-eslint/no-require-imports -- one implementation for the command and the gate
const architecture = require('../../scripts/arch/capability-graph.cjs') as {
  capabilityGraph: (srcRoot: string) => Map<string, Map<string, Map<string, string[]>>>;
  cyclesOf: (edges: Map<string, Map<string, string[]>>) => string[][];
  importsOf: (file: string, srcRoot: string) => string[];
  placeOf: (srcPath: string) => { module: string; capability: string | null };
  coreUsers: (srcRoot: string) => Map<string, string[]>;
};

type CapabilityEdges = Map<string, Map<string, string[]>>;

/** Capabilities of `requests` that must not import any other capability: the core every use case reads (spec, Phase 4). */
const REQUESTS_CORE = ['access-request', 'outcome'] as const;

/**
 * Capabilities of `requests` that have a controller and are imported by another capability. Spec rule 2 asks for none; each entry
 * is a use case that another use case runs, with the reason, and the list only shrinks. Owner 31/10/2026: replacement criterion for
 * Task 4.3 (no cycle; the core imports no capability; no folder over 25 files; a capability with a controller is imported only when this
 * list names it with its reason), in place of "at most 50 edges".
 */
const REQUESTS_CONTROLLER_IMPORTED: Record<string, string> = {
  draft:
    "the access-requests hub reads the caller's own draft by id (`request-draft.service`, `request-draft.dto`) and `reassignment` " +
    'handles the drafts of a person who leaves (`request-draft-departure.service`): both are the use case of draft itself',
  'group-request-submission':
    'sending a group draft runs the use case of this capability (`group-request.service`) from `draft/request-draft-submit.service.ts`',
  'service-account-request':
    'sending a service-account draft runs its use case (`service-account-request.service`, dto and http-errors) from ' +
    '`draft/request-draft-submit.service.ts`',
  'line-closure':
    'closing the request of a person who left runs the closing of the group lines (`group-line-closure.service`, `.policy`) from ' +
    '`cancellation/departure-cancellation.service.ts`',
  sla: 'the spend queue shows the age of what waits through `sla-queue-age.service`, which reads the reminder repo and the step SLA policy of sla',
};

/**
 * Every circle of a module (a strongly connected component of more than one capability) with the file edges that stay
 * inside it, so the failure names what to move and not only that something is wrong.
 */
function cyclesWithEdges(edges: CapabilityEdges): { cycle: string[]; edges: string[] }[] {
  return architecture.cyclesOf(edges).map((cycle) => ({
    cycle,
    // an import written twice (`import` and `import type`) is one edge to move
    edges: [...new Set(cycle.flatMap((from) => cycle.flatMap((to) => edges.get(from)?.get(to) ?? [])))].sort((a, b) =>
      a.localeCompare(b),
    ),
  }));
}

/** The capabilities of `candidates` that have outgoing edges, with the capabilities they import. */
function importsOfCapabilities(edges: CapabilityEdges, candidates: readonly string[]): Record<string, string[]> {
  return Object.fromEntries(
    candidates
      .filter((capability) => (edges.get(capability)?.size ?? 0) > 0)
      .map((capability) => [capability, [...(edges.get(capability) ?? new Map()).keys()].sort()]),
  );
}

/** Who imports each capability that has a controller: `{ capability: [importers] }`, only those that are imported. */
function controllerCapabilitiesImported(
  edges: CapabilityEdges,
  withController: ReadonlySet<string>,
): Record<string, string[]> {
  const importers: Record<string, string[]> = {};
  for (const [from, targets] of edges) {
    for (const to of targets.keys()) {
      if (withController.has(to)) importers[to] = [...(importers[to] ?? []), from].sort();
    }
  }

  return Object.fromEntries(Object.entries(importers).sort(([a], [b]) => a.localeCompare(b)));
}

/** The capability folders of a module that hold a `*.controller.ts`, at any depth. */
function capabilitiesWithController(srcRoot: string, module: string): Set<string> {
  const found = new Set<string>();
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'generated') walk(path);
      } else if (entry.name.endsWith('.controller.ts')) {
        const { capability } = architecture.placeOf(relative(srcRoot, path).split(sep).join('/'));
        if (capability) found.add(capability);
      }
    }
  };
  walk(join(srcRoot, 'modules', module));

  return found;
}

/**
 * Spec rule 3: an `*.errors.ts` file of a capability imports no `*.policy.ts` of another capability of its module; the reason
 * types an error carries live in a types file or in the errors file of the lowest capability that needs them.
 * `imports` maps a file of `src` to the files it imports, both as paths relative to `src`.
 */
function errorsImportingForeignPolicy(imports: ReadonlyMap<string, readonly string[]>): string[] {
  const found: string[] = [];
  for (const [file, targets] of imports) {
    if (!file.endsWith('.errors.ts') || file.endsWith('.spec.ts')) continue;
    const from = architecture.placeOf(file);
    for (const target of targets) {
      const to = architecture.placeOf(target);
      if (to.module === from.module && from.capability && to.capability && to.capability !== from.capability) {
        if (target.endsWith('.policy.ts')) found.push(`${file} -> ${target}`);
      }
    }
  }

  return found.sort();
}

function productionFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === 'generated' ? [] : productionFiles(path);

    return path.endsWith('.ts') && !path.endsWith('.spec.ts') ? [path] : [];
  });
}

const edgesOf = (graph: Record<string, Record<string, string[]>>): CapabilityEdges =>
  new Map(Object.entries(graph).map(([from, to]) => [from, new Map(Object.entries(to))]));

// R6
describe('capability graph', () => {
  const srcRoot = join(process.cwd(), 'src');
  const graph = architecture.capabilityGraph(srcRoot);
  const modules = [...graph.keys()];

  it('judges every module of src/modules, so a new module is checked the day it appears', () => {
    // `it.each` refuses an empty table
    expect(modules.length).toBeGreaterThan(0);
  });

  it.each(modules)(
    '%s has no cycle between its capabilities, the facade and root files of the module included',
    (module) => {
      expect(cyclesWithEdges(graph.get(module) ?? (new Map() as CapabilityEdges))).toEqual([]);
    },
  );

  it('names the circle and the file edges that close it, and only those', () => {
    const edges = edgesOf({
      plan: {
        'catalog-entry': ['modules/catalog/plan/plan.service.ts -> modules/catalog/catalog-entry/lookup.service.ts'],
      },
      'catalog-entry': {
        plan: ['modules/catalog/catalog-entry/view.service.ts -> modules/catalog/plan/plan.repo.ts'],
        subscription: ['modules/catalog/catalog-entry/view.service.ts -> modules/catalog/subscription/seat.policy.ts'],
      },
      subscription: {
        plan: ['modules/catalog/subscription/onboarding.service.ts -> modules/catalog/plan/plan.repo.ts'],
      },
      reporting: { plan: ['modules/catalog/reporting/report.service.ts -> modules/catalog/plan/plan.repo.ts'] },
    });

    expect(cyclesWithEdges(edges)).toEqual([
      {
        cycle: ['catalog-entry', 'plan', 'subscription'],
        edges: [
          'modules/catalog/catalog-entry/view.service.ts -> modules/catalog/plan/plan.repo.ts',
          'modules/catalog/catalog-entry/view.service.ts -> modules/catalog/subscription/seat.policy.ts',
          'modules/catalog/plan/plan.service.ts -> modules/catalog/catalog-entry/lookup.service.ts',
          'modules/catalog/subscription/onboarding.service.ts -> modules/catalog/plan/plan.repo.ts',
        ],
      },
    ]);
  });

  it('names the facade on an edge that closes a circle through it', () => {
    const via = 'modules/m/a/a.service.ts -> modules/m/b/b.service.ts (via modules/m/public/m.api.ts)';
    const edges = edgesOf({ a: { b: [via] }, b: { a: ['modules/m/b/b.service.ts -> modules/m/a/a.service.ts'] } });

    expect(cyclesWithEdges(edges)[0].edges).toContain(via);
  });

  it('lets capabilities import each other as long as the imports run one way (a diamond is not a circle)', () => {
    const edges = edgesOf({
      access: { auth: ['a -> b'], accounts: ['a -> c'] },
      auth: { accounts: ['b -> c'] },
      recovery: { accounts: ['d -> c'] },
    });

    expect(cyclesWithEdges(edges)).toEqual([]);
    expect(cyclesWithEdges(new Map())).toEqual([]);
  });

  it('sees a circle of two and a longer one next to it, each with its own edges', () => {
    const edges = edgesOf({
      a: { b: ['a1 -> b1'] },
      b: { a: ['b2 -> a2'] },
      x: { y: ['x1 -> y1'] },
      y: { z: ['y1 -> z1'] },
      z: { x: ['z1 -> x2'] },
    });

    expect(cyclesWithEdges(edges)).toEqual([
      { cycle: ['a', 'b'], edges: ['a1 -> b1', 'b2 -> a2'] },
      { cycle: ['x', 'y', 'z'], edges: ['x1 -> y1', 'y1 -> z1', 'z1 -> x2'] },
    ]);
  });
});

describe('the core of requests (L0) imports no other capability', () => {
  const srcRoot = join(process.cwd(), 'src');
  const edges = architecture.capabilityGraph(srcRoot).get('requests') ?? (new Map() as CapabilityEdges);

  it.each([...REQUESTS_CORE])('%s imports no capability of requests', (capability) => {
    expect(importsOfCapabilities(edges, [capability])).toEqual({});
  });

  it('names the capabilities a core capability imports, so the import can be moved down', () => {
    const wrong = edgesOf({
      'access-request': { spend: ['modules/requests/access-request/x.ts -> modules/requests/spend/y.ts'] },
      outcome: {},
      spend: { 'access-request': ['modules/requests/spend/y.ts -> modules/requests/access-request/x.ts'] },
    });

    expect(importsOfCapabilities(wrong, REQUESTS_CORE)).toEqual({ 'access-request': ['spend'] });
    expect(importsOfCapabilities(edgesOf({ outcome: {}, spend: { outcome: ['a -> b'] } }), REQUESTS_CORE)).toEqual({});
  });
});

describe('a capability of requests with a controller is not imported by another capability unless the list names it with its reason', () => {
  const srcRoot = join(process.cwd(), 'src');
  const edges = architecture.capabilityGraph(srcRoot).get('requests') ?? (new Map() as CapabilityEdges);
  const imported = controllerCapabilitiesImported(edges, capabilitiesWithController(srcRoot, 'requests'));

  it('allows exactly the capabilities of the list, each with its reason', () => {
    expect(Object.keys(imported).filter((capability) => !(capability in REQUESTS_CONTROLLER_IMPORTED))).toEqual([]);
  });

  it('drops an entry of the list as soon as nobody imports the capability, or it has no controller', () => {
    expect(Object.keys(REQUESTS_CONTROLLER_IMPORTED).filter((capability) => !(capability in imported))).toEqual([]);
    for (const reason of Object.values(REQUESTS_CONTROLLER_IMPORTED)) expect(reason.length).toBeGreaterThan(40);
  });

  it('finds a capability with a controller that another capability imports, and one nobody imports', () => {
    const synthetic = edgesOf({
      draft: { 'access-request': ['a -> b'] },
      'request-submission': { draft: ['c -> d'], 'need-decision': ['e -> f'] },
      withdraw: {},
    });

    expect(controllerCapabilitiesImported(synthetic, new Set(['draft', 'request-submission', 'withdraw']))).toEqual({
      draft: ['request-submission'],
    });
    expect(controllerCapabilitiesImported(synthetic, new Set(['access-request', 'need-decision']))).toEqual({
      'access-request': ['draft'],
      'need-decision': ['request-submission'],
    });
    expect(controllerCapabilitiesImported(synthetic, new Set())).toEqual({});
  });
});

describe('an errors file does not import the policy of another capability (spec rule 3)', () => {
  const srcRoot = join(process.cwd(), 'src');

  it('holds for every errors file of every module', () => {
    const imports = new Map<string, string[]>();
    for (const file of productionFiles(join(srcRoot, 'modules'))) {
      const path = relative(srcRoot, file).split(sep).join('/');
      if (!path.endsWith('.errors.ts')) continue;
      imports.set(
        path,
        architecture.importsOf(file, srcRoot).map((target) => relative(srcRoot, target).split(sep).join('/')),
      );
    }

    expect(imports.size).toBeGreaterThan(20);
    expect(errorsImportingForeignPolicy(imports)).toEqual([]);
  });

  it('flags the policy of another capability, and leaves alone a types file, an own policy, another module and a non-errors file', () => {
    const imports = new Map<string, string[]>([
      [
        'modules/m/spend/spend.errors.ts',
        [
          'modules/m/finance-review/finance-review.policy.ts',
          'modules/m/finance-review/finance-review.types.ts',
          'modules/m/spend/spend.policy.ts',
          'modules/n/other/other.policy.ts',
        ],
      ],
      ['modules/m/spend/spend.service.ts', ['modules/m/finance-review/finance-review.policy.ts']],
      ['modules/m/m.errors.ts', ['modules/m/finance-review/finance-review.policy.ts']],
    ]);

    expect(errorsImportingForeignPolicy(imports)).toEqual([
      'modules/m/spend/spend.errors.ts -> modules/m/finance-review/finance-review.policy.ts',
    ]);
  });
});

/**
 * R7: `src/core` holds the primitives several areas share (an area is a module, `infrastructure`, `app`, `worker`, `cli`). A file only
 * one area imports is that area's concept and belongs in its folder. The few that stay in `core` are listed with the reason; the
 * list only shrinks, and an entry that is no longer true fails like a new file.
 */
const CORE_PRIMITIVES_OF_ONE_AREA: Readonly<Record<string, string>> = {
  'core/money/convert.ts':
    'The exact integer conversion of `Money` at a `ScaledRate` into the reporting currency: the last primitive of the money family, ' +
    'whose other files (`money.ts`, `rate.ts`, `money.errors.ts`, `tax-estimate.ts`) catalog, finance and requests share. Only the ' +
    'finance facade records a conversion (G3, ADR-0013), and the rounding rule and the range limits are read beside the types they ' +
    'are made of.',
};

/** The core files that fewer than two areas import and are not listed as primitives, each with who imports it. */
function coreFilesOfFewerThanTwoAreas(
  users: ReadonlyMap<string, readonly string[]>,
  primitives: Readonly<Record<string, string>>,
): string[] {
  return [...users]
    .filter(([file, areas]) => areas.length < 2 && !(file in primitives))
    .map(([file, areas]) => `${file} (${areas.length === 0 ? 'no area outside core' : `${areas[0]} only`})`)
    .sort((a, b) => a.localeCompare(b));
}

describe('src/core holds primitives that several areas share (R7)', () => {
  const srcRoot = join(process.cwd(), 'src');

  it('has no file that fewer than two areas import, except the primitives listed with their reason', () => {
    const users = architecture.coreUsers(srcRoot);

    expect(users.size).toBeGreaterThan(10);
    expect(coreFilesOfFewerThanTwoAreas(users, CORE_PRIMITIVES_OF_ONE_AREA)).toEqual([]);
  });

  it('lists only primitives that still exist, that fewer than two areas still import, and that say why they stay', () => {
    const users = architecture.coreUsers(srcRoot);

    expect(
      Object.entries(CORE_PRIMITIVES_OF_ONE_AREA)
        .filter(([file, reason]) => !users.has(file) || (users.get(file)?.length ?? 0) >= 2 || reason.length < 80)
        .map(([file]) => file),
    ).toEqual([]);
  });

  it('names a core file that one area imports, or none but core itself, unless it is a listed primitive', () => {
    const users = new Map<string, string[]>([
      ['core/shared.ts', ['catalog', 'requests']],
      ['core/only-finance.ts', ['finance']],
      ['core/only-core.ts', []],
      ['core/listed.ts', ['finance']],
    ]);

    expect(coreFilesOfFewerThanTwoAreas(users, { 'core/listed.ts': 'a reason' })).toEqual([
      'core/only-core.ts (no area outside core)',
      'core/only-finance.ts (finance only)',
    ]);
  });
});
