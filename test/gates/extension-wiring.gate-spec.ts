import 'reflect-metadata';
import { INJECTABLE_WATERMARK } from '@nestjs/common/constants';
import { Injectable, Module, type Type } from '@nestjs/common';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import * as ts from 'typescript';
import { Contributions } from '../../src/core/extension/contributions';
import { Hook } from '../../src/core/extension/hook';
import { Listeners } from '../../src/core/extension/listeners';
import { collectGraph, tokenOf, type Token } from '../support/nest-module-graph';
import { PROCESS_GRAPHS } from '../support/process-graphs';

// The real configuration modules load and validate an env file the moment they are imported. The
// graph only needs their shape, so they are replaced by an empty module.
jest.mock('@nestjs/config', () => ({
  ...jest.requireActual<object>('@nestjs/config'),
  ConfigModule: { forRoot: () => ({ module: class ConfigStubModule {} }) },
}));

/**
 * R1 (docs/rules/module-structure.md, "Extension point"): a Hook that no module bound fails only when it is first called,
 * and a Listeners or Contributions point with no registered module simply does nothing — in the process that forgot it.
 * Every process boots its own Nest graph, so a registration that the API has can be missing from a command (the Super
 * Admin procedure once lacked the listeners of the organization changes it emits). This gate reads the graph the way the
 * module-graph gate does, without a database: for every graph and every extension point that something in the graph
 * uses, the binders (the classes of `*.listener.ts` that declare `binds`) present in the graph are all the binders of `src`.
 * What a graph may legitimately lack is listed, with the reason, in GRAPH_WIRING_EXCEPTIONS.
 */

interface WiringException {
  /** The graphs (root module names) that lack the binders. */
  graphs: readonly string[];
  /** The extension point class. */
  point: string;
  /** The binder classes absent from those graphs (`Class`, or `Class @ src-relative-file` when two classes share a name). */
  binders: readonly string[];
  /**
   * The classes that use the point in every one of those graphs (they inject it without binding it, or a factory provider
   * injects it): the code that emits or reads the point, which the reason argues about. A new user, or one that goes, makes the
   * entry stale: the reason was written for these classes only.
   */
  users: readonly string[];
  /** Why the event of the point never fires in those processes: the code that emits it and every way to reach that code. */
  reason: string;
}

/** The graphs a command or the worker boots with no HTTP server: no controller of the API runs in any of them. */
const NO_HTTP_GRAPHS = [
  'WorkerModule',
  'InstallationModule',
  'RecoveryCliModule',
  'InspectionCliModule',
  'AssignSubscriptionOwnerCliModule',
  'DevSeedCliModule',
  'SeedCliModule',
] as const;

const DEACTIVATION_ONLY =
  'is called from nowhere but `DepartmentsController.deactivate` / `CostCentersController.deactivate` (every call chain in src, ' +
  'found with the TypeScript call graph), HTTP routes of the API; none of these graphs serves HTTP or has a command that deactivates';

/**
 * Missing registrations that are proved harmless: the process never reaches the code that emits or reads the point. An entry
 * needs the Owner's agreement (spec of be-architecture-readability-hardening, R1) and must stay true: a stale entry fails.
 * Each reason names the emitting method and every root that can reach it in `src`; the roots are controllers (the API graph
 * only), the sweeper `OrganizationChangeSweeper` (the API graph only) and the commands named below.
 */
const GRAPH_WIRING_EXCEPTIONS: readonly WiringException[] = [
  {
    graphs: NO_HTTP_GRAPHS,
    point: 'DepartmentUseContributions',
    binders: [
      'SubscriptionDepartmentUseReader',
      'DepartmentOpenWorkReader @ modules/licensing/provisioning/department-use/department-open-work.listener.ts',
      'DepartmentOpenWorkReader @ modules/personnel/event-notice/department-open-work.listener.ts',
      'DepartmentOpenRequestsReader',
    ],
    users: ['DepartmentUseService'],
    reason: `The readers are asked by DepartmentUseService.readDepartment, which ${DEACTIVATION_ONLY}. (An unanswered group fails loudly: UseReaderMissingError.)`,
  },
  {
    graphs: NO_HTTP_GRAPHS,
    point: 'CostCenterUseContributions',
    binders: ['BudgetCostCenterUseReader', 'CostCenterOpenRequestsReader'],
    users: ['DepartmentUseService'],
    reason: `The readers are asked by DepartmentUseService.readCostCenter, which ${DEACTIVATION_ONLY}. (An unanswered group fails loudly: UseReaderMissingError.)`,
  },
  {
    graphs: ['WorkerModule'],
    point: 'OrganizationChangeListeners',
    binders: [
      'BudgetHeadChangeListener',
      'HeldNoticeHandoverListener',
      'TransferEffectiveListener',
      'TransferReviewListener',
      'SpendingApproverWaitListener',
      'RenewalSpendingApproverWaitListener',
    ],
    users: ['OrganizationChangeService'],
    reason:
      'OrganizationChangeService.emit is reached, in all of src, only from controllers of the API, OrganizationChangeSweeper (declared ' +
      'in the API graph) and the command `record-super-admin-event`; the worker declares none of them and its loops reach no write of the organization.',
  },
  {
    graphs: [
      'InstallationModule',
      'RecoveryCliModule',
      'InspectionCliModule',
      'AssignSubscriptionOwnerCliModule',
      'DevSeedCliModule',
      'SeedCliModule',
    ],
    point: 'OrganizationChangeListeners',
    binders: [
      'BudgetHeadChangeListener',
      'HeldNoticeHandoverListener',
      'TransferEffectiveListener',
      'TransferReviewListener',
      'RequestsOrganizationChangeListener',
      'SpendingApproverWaitListener',
      'RenewalSpendingApproverWaitListener',
    ],
    users: ['OrganizationChangeService'],
    reason:
      'OrganizationChangeService.emit is reached, in all of src, only from controllers of the API, OrganizationChangeSweeper (declared ' +
      'in the API graph) and the command `record-super-admin-event`; none of these graphs runs any of them (no command of these graphs writes the organization).',
  },
  {
    graphs: ['InspectionCliModule'],
    point: 'ApprovalRoleChangeListeners',
    binders: ['RequestsApprovalRoleListener', 'SpendingApproverWaitListener', 'RenewalSpendingApproverWaitListener'],
    users: ['RoleGrantService'],
    reason:
      'The point is emitted by RoleGrantService.grantRole / revokeRole and ApprovalRoleService.set, reached in all of src only from controllers ' +
      'of the API and the commands bootstrap, dev-seed, seed and recover; `ops:inspect` reads and never changes a role.',
  },
  {
    graphs: ['InstallationModule', 'RecoveryCliModule'],
    point: 'ApprovalRoleChangeListeners',
    binders: ['RequestsApprovalRoleListener', 'SpendingApproverWaitListener', 'RenewalSpendingApproverWaitListener'],
    users: ['RoleGrantService'],
    reason:
      'RoleGrantService.grantRole / revokeRole emit only for the role FINANCE (the branch `input.role === "FINANCE"`). The only calls these ' +
      'commands reach pass the literal SUPER_ADMIN: createBootstrapSuperAdmin (bootstrap) and RoleHandover.move (recover), so the branch is dead in them. ' +
      'This reads the value of an argument, not only reachability: it stays true while those two callers grant nothing but SUPER_ADMIN.',
  },
  {
    graphs: ['RecordSuperAdminEventCliModule'],
    point: 'OrganizationChangeListeners',
    binders: ['HeldNoticeHandoverListener'],
    users: ['OrganizationChangeService'],
    reason:
      'Owner 30/10/2026 (FR-8.7). The only way HEAD_PERIOD_START, the one change this listener acts on, is emitted from this command is ' +
      'TransferService.handOverHead -> OrganizationHistoryApi.scheduleHeadHandover, which ends the head period of the outgoing person first and ' +
      'emits nothing when they head no department. The subject of every mode of this command must hold SUPER_ADMIN (`requireOperatorSubject`) and a ' +
      'Super Admin never heads a department (FR-8.7, enforced by the department and successor use cases), so no head period of the subject ends or ' +
      'starts here and HEAD_PERIOD_START is not emitted: there is no held notice to hand over.',
  },
  {
    graphs: ['DevSeedCliModule', 'SeedCliModule'],
    point: 'ApprovalRoleChangeListeners',
    binders: ['RequestsApprovalRoleListener', 'SpendingApproverWaitListener', 'RenewalSpendingApproverWaitListener'],
    users: ['RoleGrantService'],
    reason:
      'Owner 30/10/2026. These commands only create demo accounts, and granting FINANCE (RoleGrantService.grantRole via ' +
      'LocalDemoAccountApi.createDemoAccount) emits the approval-role change that this listener answers by re-trying the steps that wait for Finance. ' +
      'On the databases they target no request step waits for Finance, and a step that is already waiting is NOT re-tried by these commands (the ' +
      'API path would re-try it). The limitation is documented in docs/guides/seed.md and docs/rules/operational-commands.md. ' +
      'The two listeners of qd93-remove-fallback-substitute-approvers (SpendingApproverWaitListener, RenewalSpendingApproverWaitListener) answer ' +
      'only the role SPENDING_APPROVER taken back with nobody after it, and tell the Super Admin of a budget version or a renewal that waits; ' +
      'these commands create accounts and never take that role back, and no version or renewal waits on the databases they target.',
  },
  {
    graphs: ['WorkerModule'],
    point: 'ApprovalRoleChangeListeners',
    binders: ['SpendingApproverWaitListener', 'RenewalSpendingApproverWaitListener'],
    users: ['RoleGrantService'],
    reason:
      'The point is emitted by RoleGrantService.grantRole / revokeRole, reached in all of src only from controllers of the API and the commands ' +
      'bootstrap, dev-seed, seed and recover; the worker declares none of them and its loops grant and revoke no role. The listeners ' +
      '(qd93-remove-fallback-substitute-approvers) only tell the Super Admin that a budget version or a renewal waits for a spending approver ' +
      'when the role is taken back; the sending of the version and the proposal of the renewal tell it themselves in the API.',
  },
];

type PointClass = abstract new (...args: never[]) => object;
type PointBase = typeof Hook | typeof Listeners | typeof Contributions;
const BASES: readonly PointBase[] = [Hook, Listeners, Contributions];

const isPoint = (token: Token): token is PointClass =>
  typeof token === 'function' && BASES.some((base) => token.prototype instanceof base);
const bindsOf = (token: Token): readonly PointClass[] =>
  typeof token === 'function' ? ((token as { binds?: readonly PointClass[] }).binds ?? []) : [];
const injected = (token: Token): Token[] =>
  typeof token === 'function' ? ((Reflect.getMetadata('design:paramtypes', token) as Token[] | undefined) ?? []) : [];

/** A provider declaration's class (`useClass` of a custom provider, or the class itself) and the tokens a factory injects. */
function declaredClassOf(provider: unknown): Token {
  if (typeof provider === 'object' && provider !== null && 'useClass' in provider) return provider.useClass;
  return tokenOf(provider);
}
function factoryInjects(provider: unknown): Token[] {
  return typeof provider === 'object' && provider !== null && 'inject' in provider && Array.isArray(provider.inject)
    ? (provider.inject as Token[])
    : [];
}

/** The `.ts` files below `directory` whose name ends with `suffix`, generated code left out. */
function files(directory: string, suffix: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return entry === 'generated' ? [] : files(path, suffix);
    return path.endsWith(suffix) ? [path] : [];
  });
}

/** Nest marks every `@Injectable()` class with this metadata key. */
const isInjectable = (value: unknown): value is Type<unknown> =>
  typeof value === 'function' && Reflect.getMetadata(INJECTABLE_WATERMARK, value) === true;

const sourceRoot = join(process.cwd(), 'src');
const srcPath = (file: string): string => relative(sourceRoot, file).split(sep).join('/');

interface Binder {
  type: Type<unknown>;
  /** Class name, plus ` @ <src-relative file>` when another listener class has the same name. */
  label: string;
  file: string;
}

/** Every `@Injectable` class exported by a `*.listener.ts` of `src/`: the reference set of binders. */
function listenerClasses(): Binder[] {
  const found = files(sourceRoot, '.listener.ts').flatMap((file) =>
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- the gate loads every listener file it finds
    Object.values(require(file) as Record<string, unknown>)
      .filter(isInjectable)
      .map((type) => ({ type, file: srcPath(file) })),
  );
  const count = (name: string): number => found.filter(({ type }) => type.name === name).length;

  return found.map(({ type, file }) => ({
    type,
    file,
    label: count(type.name) > 1 ? `${type.name} @ ${file}` : type.name,
  }));
}

/**
 * The classes of one graph that use each extension point: a provider or controller that injects the point without binding it (a
 * binder that also injects a point it does not bind, to read it, is a user of that point like any other class), and the token
 * of a factory provider that injects it. Names, sorted.
 */
function usersOf(root: Type<unknown>): Map<PointClass, string[]> {
  const users = new Map<PointClass, Set<string>>();
  const add = (point: PointClass, name: string): void => {
    users.set(point, (users.get(point) ?? new Set<string>()).add(name));
  };
  const nodes = collectGraph(root);
  const providers = nodes.flatMap((node) => node.providers);
  const classes = [...providers.map(declaredClassOf), ...nodes.flatMap((node) => node.controllers)];
  for (const token of classes) {
    for (const dependency of injected(token)) {
      if (isPoint(dependency) && !bindsOf(token).includes(dependency)) add(dependency, tokenName(token));
    }
  }
  for (const provider of providers) {
    for (const dependency of factoryInjects(provider))
      if (isPoint(dependency)) add(dependency, tokenName(tokenOf(provider)));
  }

  return new Map([...users].map(([point, names]) => [point, [...names].sort()]));
}

const tokenName = (token: Token): string => (typeof token === 'function' ? token.name : String(token));

/** The classes of one graph that use an extension point, and the binders it carries for each. */
function wiringOf(root: Type<unknown>, binders: readonly Binder[]): Map<PointClass, Set<Type<unknown>>> {
  const wiring = new Map<PointClass, Set<Type<unknown>>>();
  for (const point of usersOf(root).keys()) wiring.set(point, new Set());
  const nodes = collectGraph(root);
  const present = new Set<Token>([
    ...nodes.flatMap((node) => node.providers).map(declaredClassOf),
    ...nodes.flatMap((node) => node.controllers),
  ]);
  for (const binder of binders) {
    if (!present.has(binder.type)) continue;
    for (const point of bindsOf(binder.type)) wiring.get(point)?.add(binder.type);
  }

  return wiring;
}

/** The `Point: Binder` lines that a graph lacks, an exception for it left out. */
function missingIn(
  graph: string,
  root: Type<unknown>,
  binders: readonly Binder[],
  exceptions: readonly WiringException[],
): string[] {
  return [...wiringOf(root, binders)].flatMap(([point, present]) =>
    binders
      .filter((binder) => bindsOf(binder.type).includes(point) && !present.has(binder.type))
      .filter(
        (binder) =>
          !exceptions.some(
            (e) => e.graphs.includes(graph) && e.point === point.name && e.binders.includes(binder.label),
          ),
      )
      .map((binder) => `${point.name}: ${binder.label}`),
  );
}

/** The listed exceptions that no longer hold: an unknown graph or binder, no reason, or a binder the graph now carries. */
function staleEntries(
  exceptions: readonly WiringException[],
  graphs: readonly (readonly [string, Type<unknown>])[],
  binders: readonly Binder[],
): string[] {
  return exceptions
    .flatMap((exception) =>
      exception.graphs.flatMap((graphName) =>
        exception.binders.map((label) => {
          const graph = graphs.find(([name]) => name === graphName);
          const known = binders.some((binder) => binder.label === label);
          const where = `${graphName} / ${exception.point}: ${label}`;
          if (!graph || !known || exception.reason.trim() === '')
            return `${where} (unknown graph or binder, or no reason)`;
          const users = usersOf(graph[1]);
          // A graph in which the collector finds no point at all (an async or forwardRef module it stopped following, say) would
          // pass every rule vacuously: the entry would excuse a graph nobody analyses.
          if (users.size === 0) return `${where} (no extension point found in the graph: it is not analysed)`;
          const found = [...users].find(([point]) => point.name === exception.point)?.[1] ?? [];
          if (found.join(',') !== [...exception.users].sort().join(','))
            return `${where} (the users of the point are now [${found.join(', ')}], the entry says [${[...exception.users].sort().join(', ')}])`;

          return missingIn(graphName, graph[1], binders, []).includes(`${exception.point}: ${label}`)
            ? null
            : `${where} (the graph carries it now)`;
        }),
      ),
    )
    .filter((entry): entry is string => entry !== null);
}

// R1
describe('extension point wiring per process graph', () => {
  const binders = listenerClasses();

  it('declares, on every listener class, the extension points it binds, each one injected in its constructor', () => {
    const wrong = binders
      .filter(
        ({ type }) => bindsOf(type).length === 0 || bindsOf(type).some((point) => !injected(type).includes(point)),
      )
      .map(({ label }) => label);

    expect(binders.length).toBeGreaterThan(0);
    expect(wrong).toEqual([]);
  });

  it('declares exactly the extension points that `onModuleInit` of each listener class binds or adds to', () => {
    const mismatched = binders.flatMap(({ type, file, label }) => {
      const declared = bindsOf(type)
        .map((point) => point.name)
        .sort();
      const actual = pointsRegisteredIn(join(sourceRoot, file), type.name);

      return JSON.stringify(declared) === JSON.stringify(actual)
        ? []
        : [
            `${label}: binds ${declared.join(', ') || 'nothing'}, onModuleInit registers ${actual.join(', ') || 'nothing'}`,
          ];
    });

    expect(mismatched).toEqual([]);
  });

  it('gives every Hook exactly one binder in src, since it has one implementation and fails unbound', () => {
    const points = new Set(binders.flatMap(({ type }) => [...bindsOf(type)]));
    const hooks = [...points].filter((point) => point.prototype instanceof Hook);

    expect(hooks.length).toBeGreaterThan(0);
    expect(
      hooks
        .map((hook) => ({
          hook: hook.name,
          binders: binders.filter(({ type }) => bindsOf(type).includes(hook)).length,
        }))
        .filter(({ binders: count }) => count !== 1),
    ).toEqual([]);
  });

  it('lists every Nest graph a command of src/cli boots', () => {
    const named = files(join(sourceRoot, 'cli'), '.command.ts').flatMap((file) => {
      const text = readFileSync(file, 'utf8');
      const loaded = [...text.matchAll(/then\(\s*\(m\)\s*=>\s*m\.(\w+)\s*,?\s*\)/g)].map((match) => match[1]);
      // A `graph:` loader written in another form would escape the pattern above: count them against each other.
      expect({ file: srcPath(file), loaders: loaded.length }).toEqual({
        file: srcPath(file),
        loaders: [...text.matchAll(/\bgraph:\s*\(\)/g)].length,
      });

      return loaded;
    });

    expect(named.length).toBeGreaterThan(0);
    expect(named.filter((name) => !PROCESS_GRAPHS.some(([graph]) => graph === name))).toEqual([]);
  });

  it.each(PROCESS_GRAPHS)('%s carries every binder of each extension point it uses', (graph, root) => {
    expect(missingIn(graph, root, binders, GRAPH_WIRING_EXCEPTIONS)).toEqual([]);
  });

  it('keeps no exception that has stopped being true: each listed graph and binder exists and the binder is still absent', () => {
    expect(staleEntries(GRAPH_WIRING_EXCEPTIONS, PROCESS_GRAPHS, binders)).toEqual([]);
  });
});

/** The extension point class names that `onModuleInit` of `className` in `file` binds or adds to, sorted. */
function pointsRegisteredIn(file: string, className: string): string[] {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.ES2022, true);
  const registered = new Set<string>();
  source.forEachChild((node) => {
    if (!ts.isClassDeclaration(node) || node.name?.text !== className) return;
    const fieldTypes = new Map<string, string>();
    for (const member of node.members) {
      if (!ts.isConstructorDeclaration(member)) continue;
      for (const parameter of member.parameters) {
        if (ts.isIdentifier(parameter.name) && parameter.type && ts.isTypeReferenceNode(parameter.type)) {
          fieldTypes.set(parameter.name.text, parameter.type.typeName.getText(source));
        }
      }
    }
    for (const member of node.members) {
      if (!ts.isMethodDeclaration(member) || member.name.getText(source) !== 'onModuleInit') continue;
      const visit = (inner: ts.Node): void => {
        // `this.<field>.bind(...)` or `this.<field>.add(...)`
        if (
          ts.isCallExpression(inner) &&
          ts.isPropertyAccessExpression(inner.expression) &&
          ['bind', 'add'].includes(inner.expression.name.text) &&
          ts.isPropertyAccessExpression(inner.expression.expression) &&
          inner.expression.expression.expression.kind === ts.SyntaxKind.ThisKeyword
        ) {
          const type = fieldTypes.get(inner.expression.expression.name.text);
          if (type) registered.add(type);
        }
        ts.forEachChild(inner, visit);
      };
      visit(member);
    }
  });

  return [...registered].sort();
}

/**
 * The rule itself, on a graph of its own: a Nest module that has a user of an extension point but not one of its binders is
 * reported with the binder named, the exception list lets a proved case through, and a stale exception is caught.
 */
describe('the wiring rule on a synthetic graph', () => {
  class DemoPoint extends Listeners<string, unknown> {
    constructor() {
      super('demo.point');
    }
  }
  class OtherPoint extends Listeners<string, unknown> {
    constructor() {
      super('demo.other');
    }
  }
  @Injectable()
  class DemoUser {
    constructor(readonly point: DemoPoint) {}
  }
  @Injectable()
  class DemoBinder {
    static readonly binds = [DemoPoint] as const;
    constructor(readonly point: DemoPoint) {}
  }
  @Injectable()
  class ReadingBinder {
    static readonly binds = [OtherPoint] as const;
    constructor(
      readonly other: OtherPoint,
      readonly demo: DemoPoint,
    ) {}
  }
  @Module({ providers: [DemoPoint, DemoUser] })
  class WithoutBinder {}
  @Module({ providers: [DemoPoint, DemoUser, DemoBinder] })
  class WithBinder {}
  @Module({ providers: [DemoPoint, OtherPoint, ReadingBinder] })
  class OnlyReads {}
  @Module({ providers: [DemoPoint, { provide: 'LATE', inject: [DemoPoint], useFactory: () => 1 }] })
  class FactoryUser {}
  @Module({ providers: [OtherPoint] })
  class NoUser {}

  const demoBinders: Binder[] = [
    { type: DemoBinder, label: 'DemoBinder', file: 'demo.listener.ts' },
    { type: ReadingBinder, label: 'ReadingBinder', file: 'reading.listener.ts' },
  ];

  it('names the binder that a graph with a user of the point lacks', () => {
    expect(missingIn('WithoutBinder', WithoutBinder, demoBinders, [])).toEqual(['DemoPoint: DemoBinder']);
  });

  it('is quiet when the graph carries the binder', () => {
    expect(missingIn('WithBinder', WithBinder, demoBinders, [])).toEqual([]);
  });

  it('counts a class that injects a point only to read it as its user, even when it binds another point', () => {
    expect(missingIn('OnlyReads', OnlyReads, demoBinders, [])).toEqual(['DemoPoint: DemoBinder']);
  });

  it('counts a factory provider that injects the point as its user', () => {
    expect(missingIn('FactoryUser', FactoryUser, demoBinders, [])).toEqual(['DemoPoint: DemoBinder']);
  });

  it('asks nothing of a graph in which nobody uses the point', () => {
    expect(missingIn('NoUser', NoUser, demoBinders, [])).toEqual([]);
  });

  const exception = {
    graphs: ['WithoutBinder'],
    point: 'DemoPoint',
    binders: ['DemoBinder'],
    users: ['DemoUser'],
    reason: 'never emitted here',
  };

  it('lets a listed exception through only for that graph, that point and that binder', () => {
    expect(missingIn('WithoutBinder', WithoutBinder, demoBinders, [exception])).toEqual([]);
    expect(missingIn('WithoutBinder', WithoutBinder, demoBinders, [{ ...exception, graphs: ['Other'] }])).toHaveLength(
      1,
    );
    expect(
      missingIn('WithoutBinder', WithoutBinder, demoBinders, [{ ...exception, point: 'OtherPoint' }]),
    ).toHaveLength(1);
    expect(
      missingIn('WithoutBinder', WithoutBinder, demoBinders, [{ ...exception, binders: ['ReadingBinder'] }]),
    ).toHaveLength(1);
  });

  it('reports an exception that has stopped being true, names an unknown graph or binder, or gives no reason', () => {
    const graphs = [
      ['WithoutBinder', WithoutBinder],
      ['WithBinder', WithBinder],
    ] as const;

    expect(staleEntries([exception], graphs, demoBinders)).toEqual([]);
    expect(staleEntries([{ ...exception, graphs: ['WithBinder'] }], graphs, demoBinders)).toEqual([
      'WithBinder / DemoPoint: DemoBinder (the graph carries it now)',
    ]);
    expect(staleEntries([{ ...exception, graphs: ['Nowhere'] }], graphs, demoBinders)).toHaveLength(1);
    expect(staleEntries([{ ...exception, binders: ['NoBinder'] }], graphs, demoBinders)).toHaveLength(1);
    expect(staleEntries([{ ...exception, reason: '  ' }], graphs, demoBinders)).toHaveLength(1);
  });

  it('finds the users of a point in a graph: a class that injects it, a reader that also binds another, a factory provider', () => {
    const named = (root: Type<unknown>): Record<string, string[]> =>
      Object.fromEntries([...usersOf(root)].map(([point, users]) => [point.name, users]));

    expect(named(WithoutBinder)).toEqual({ DemoPoint: ['DemoUser'] });
    expect(named(OnlyReads)).toEqual({ DemoPoint: ['ReadingBinder'] });
    expect(named(FactoryUser)).toEqual({ DemoPoint: ['LATE'] });
    expect(named(NoUser)).toEqual({});
  });

  // L-1
  it('makes an exception stale when a user of the point appears or goes in a graph it excuses', () => {
    const graphs = [['WithoutBinder', WithoutBinder]] as const;

    expect(staleEntries([exception], graphs, demoBinders)).toEqual([]);
    expect(staleEntries([{ ...exception, users: [] }], graphs, demoBinders)).toEqual([
      'WithoutBinder / DemoPoint: DemoBinder (the users of the point are now [DemoUser], the entry says [])',
    ]);
    expect(staleEntries([{ ...exception, users: ['DemoUser', 'NewEmitter'] }], graphs, demoBinders)).toEqual([
      'WithoutBinder / DemoPoint: DemoBinder (the users of the point are now [DemoUser], the entry says [DemoUser, NewEmitter])',
    ]);
  });

  // TG-8
  it('refuses to excuse a graph in which the collector finds no extension point at all', () => {
    const graphs = [['NoUser', NoUser]] as const;

    expect(staleEntries([{ ...exception, graphs: ['NoUser'] }], graphs, demoBinders)).toEqual([
      'NoUser / DemoPoint: DemoBinder (no extension point found in the graph: it is not analysed)',
    ]);
  });

  it('finds the extension points that onModuleInit registers with in the source of a listener', () => {
    const file = join(sourceRoot, 'modules', 'personnel', 'offboarding', 'open-requests', 'open-requests.listener.ts');

    expect(pointsRegisteredIn(file, 'OpenRequestsSource')).toEqual([
      'OffboardingWarningContributions',
      'PersonnelFileHookContributions',
    ]);
    expect(pointsRegisteredIn(file, 'NoSuchClass')).toEqual([]);
  });
});
