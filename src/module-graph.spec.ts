import { Type } from '@nestjs/common';
import { SELF_DECLARED_DEPS_METADATA } from '@nestjs/common/constants';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { AppModule } from './app.module';
import { ACCOUNT_SESSIONS } from './modules/identity-access/identity-access.ports';
import { AccountStatusService } from './modules/identity-access/accounts/account-status.service';
import { SessionDirectoryService } from './modules/identity-access/auth/session-directory.service';
import { HolderCredentialReset } from './modules/identity-access/recovery/holder-credential-reset.service';
import { MailTransport } from './infrastructure/mail/mail-transport';
import { AuditController } from './modules/audit/audit.controller';
import { AuditQueryRepo } from './modules/audit/audit-query.repo';
import { ActionTokenRepo } from './modules/identity-access/accounts/action-token.repo';
import { AppUserRepo } from './modules/identity-access/accounts/app-user.repo';
import { CredentialRepo } from './modules/identity-access/accounts/credential.repo';
import { RoleGrantRepo } from './modules/identity-access/accounts/role-grant.repo';
import { AppUsersController } from './modules/identity-access/accounts/app-users.controller';
import { MeController } from './modules/identity-access/access/me.controller';
import { AuthController } from './modules/identity-access/auth/auth.controller';
import { PasswordHasher } from './modules/identity-access/accounts/password-hasher.service';
import { SessionRepo } from './modules/identity-access/auth/session.repo';
import { IdentityAccessService } from './modules/identity-access/identity-access.service';
import { IdentityAccessModule } from './modules/identity-access/identity-access.module';
import { RecoveryModule } from './modules/identity-access/recovery.module';
import { InstallationModule } from './modules/installation/installation.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { PayloadCipher } from './modules/notifications/payload-cipher';
import { QueueInfrastructureModule } from './infrastructure/queue/queue-infrastructure.module';
import { RecoveryCliModule } from './recovery-cli.module';
import { WorkerModule } from './worker.module';

/**
 * What a business module may export (docs/rules/module-structure.md): its facade, a port it implements for
 * infrastructure, or the service of a CLI entry module. Every other exported token of a business module is private,
 * whatever its name (A4-03). Exact `Module: token` pairs; a module that is not mounted (catalog) is not listed.
 */
const PUBLIC_CONTRACT_EXPORTS: ReadonlySet<string> = new Set([
  'AuditModule: AuditService',
  // H8.3 (A4-10): the data-import facade; onboarding reads the latest people import through it.
  'DataImportModule: DataImportService',
  'IdentityAccessFacadeModule: IdentityAccessService',
  // H5.5 (identity-access Wave B): the account contracts the API and the recovery command reach the account persistence
  // through; the persistence itself is declared once, here, because every graph needs it.
  'IdentityAccessFacadeModule: AccountDirectoryService',
  'IdentityAccessFacadeModule: ActionLinkService',
  'IdentityAccessFacadeModule: CredentialService',
  'IdentityAccessFacadeModule: RoleGrantService',
  'IdentityAccessModule: Symbol(ACCESS_TOKEN_VERIFIER)', // port of src/infrastructure/security
  'InstallationModule: InstallationService',
  'NotificationsModule: NotificationsService',
  'OperatingParametersModule: OperatingParametersService',
  'OrganizationModule: OrganizationService',
  // The two entry services of `pnpm ops:recover` (Q6; E7): the holder's own account, and the role transfer.
  'RecoveryModule: HolderRecoveryService',
  'RecoveryModule: RoleTransferRecoveryService',
]);

/**
 * Exports outside that contract. The 18/10/2026 entries are removed by the named slice of
 * docs/workspace/items/foundation-remediation-handoff-2026-10-18; the GATE.1 entries (19/10/2026) by the slice of
 * docs/reviews/be-full-src-architecture-audit-2026-10-19. Entries are only removed, never added to pass a build; a
 * stale entry fails like a new export.
 */
const LEGACY_PRIVATE_EXPORTS: ReadonlySet<string> = new Set([
  // E4 = A (Owner, scoped legacy exception kept at H4.7, reviewed at G3): OrganizationHttpModule shares CostCenterRepo
  // (CostCenterService) and DepartmentRepo (the three department use-case services); OrganizationRepo has no HTTP
  // consumer since Wave 2 and stays exported only under E4. No other repo is exported.
  'OrganizationModule: CostCenterRepo',
  'OrganizationModule: DepartmentRepo',
  'OrganizationModule: OrganizationRepo',
  // Owner 19/10/2026 (GATE.1, extends E9): non-facade exports the contract allowlist found. H8.3 removed the
  // data-import entry (facade DataImportService).
  'NotificationsModule: EmailDispatcher', // ROOT.1/DOC.1: decided with the email-dispatch.loop import edge (ADR-0012)
  'OperatingParametersModule: NonWorkingDatesService', // G3: same-context HTTP module sharing, reviewed like E4
]);

// The real configuration modules load and validate an env file the moment they are imported. The
// graph only needs their shape, so they are replaced by an empty module.
jest.mock('@nestjs/config', () => ({
  ...jest.requireActual<object>('@nestjs/config'),
  ConfigModule: { forRoot: () => ({ module: class ConfigStubModule {} }) },
}));

interface ModuleNode {
  /** The module class; for a dynamic module, the class its `module` property names. */
  module: Type<unknown>;
  controllers: unknown[];
  providers: unknown[];
  imports: unknown[];
}

type Token = unknown;

/** Nest lets many providers share these on purpose (one per guard, pipe, filter or interceptor). */
const MULTI_PROVIDER_TOKENS: ReadonlySet<Token> = new Set([APP_GUARD, APP_PIPE, APP_FILTER, APP_INTERCEPTOR]);

function metadata(module: Type<unknown>, key: 'imports' | 'providers' | 'controllers' | 'exports'): unknown[] {
  return (Reflect.getMetadata(key, module) as unknown[] | undefined) ?? [];
}

function isDynamicModule(entry: object): entry is {
  module: Type<unknown>;
  imports?: unknown[];
  providers?: unknown[];
  controllers?: unknown[];
} {
  return 'module' in entry;
}

/** Reads the metadata Nest itself would read. Promises (async modules) and forwardRef are not followed. */
function describeModule(entry: unknown): ModuleNode | null {
  if (typeof entry === 'function') {
    const module = entry as Type<unknown>;

    return {
      module,
      controllers: metadata(module, 'controllers'),
      providers: metadata(module, 'providers'),
      imports: metadata(module, 'imports'),
    };
  }
  if (typeof entry !== 'object' || entry === null || 'then' in entry || 'forwardRef' in entry) return null;
  if (!isDynamicModule(entry)) return null;

  return {
    module: entry.module,
    controllers: [...metadata(entry.module, 'controllers'), ...(entry.controllers ?? [])],
    providers: [...metadata(entry.module, 'providers'), ...(entry.providers ?? [])],
    imports: [...metadata(entry.module, 'imports'), ...(entry.imports ?? [])],
  };
}

/** Every module reachable from `root` through `imports`, the root included. A static module appears once. */
function collectGraph(root: Type<unknown>): ModuleNode[] {
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

function tokenOf(provider: unknown): Token {
  if (typeof provider === 'object' && provider !== null && 'provide' in provider) return provider.provide;

  return provider;
}

function tokenName(token: Token): string {
  if (typeof token === 'function') return token.name;

  return String(token);
}

/** The modules that declare `token` as a provider, one entry per declaration. */
function declarationsOf(graph: ModuleNode[], token: Token): ModuleNode[] {
  return graph.flatMap((node) => node.providers.filter((provider) => tokenOf(provider) === token).map(() => node));
}

function moduleNames(graph: ModuleNode[]): string[] {
  return graph.map((node) => node.module.name);
}

function controllersOf(graph: ModuleNode[]): unknown[] {
  return graph.flatMap((node) => node.controllers);
}

/** True when a module exporting `token` leaks something other than its public contract. */
function isPrivateExport(moduleName: string, token: string): boolean {
  return !PUBLIC_CONTRACT_EXPORTS.has(`${moduleName}: ${token}`);
}

/** The Nest modules declared under src/modules: the ones whose exports are a business contract. */
function businessModuleNames(): ReadonlySet<string> {
  const names = new Set<string>();
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory)) {
      const path = join(directory, entry);
      if (statSync(path).isDirectory()) visit(path);
      else if (entry.endsWith('.module.ts')) {
        for (const match of readFileSync(path, 'utf8').matchAll(/\bexport\s+class\s+(\w+)/g)) names.add(match[1]);
      }
    }
  };
  visit(join(process.cwd(), 'src', 'modules'));

  return names;
}

/**
 * E6 (H5.6): the providers the API and the recovery command both need but the facade does not. Each is declared once
 * in IdentityAccessModule and once in RecoveryModule; the two never meet in one graph, and none is exported.
 */
const DECLARED_FOR_API_AND_RECOVERY = [
  'ActionLinkRevocation',
  'ApprovalRoleDirectoryService',
  'ApprovalRoleRepo',
  'RecoveryRepo',
  'SessionDirectoryService',
  'SessionRepo',
  'SuccessorEligibility',
  'Symbol(ACCOUNT_SESSIONS)',
  'Symbol(APPROVAL_ROLE_HOLDINGS)',
];

/** GATE.2: the one file that declares the session port shared by accounts and recovery (implemented by auth). */
const ACCOUNT_SESSIONS_OWNER = 'src/modules/identity-access/identity-access.ports.ts';

/** Source files (tests and generated code excluded) whose text contains `needle`, as repository-relative paths. */
function sourceFilesDeclaring(needle: string): string[] {
  const found: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory)) {
      const path = join(directory, entry);
      if (statSync(path).isDirectory()) {
        if (entry !== 'generated') visit(path);
      } else if (entry.endsWith('.ts') && !entry.endsWith('.spec.ts') && readFileSync(path, 'utf8').includes(needle)) {
        found.push(relative(process.cwd(), path).split(sep).join('/'));
      }
    }
  };
  visit(join(process.cwd(), 'src'));

  return found.sort();
}

describe('module graph', () => {
  const graphs: [string, Type<unknown>][] = [
    ['AppModule', AppModule],
    ['WorkerModule', WorkerModule],
    ['InstallationModule', InstallationModule],
    ['RecoveryCliModule', RecoveryCliModule],
  ];

  it.each(graphs)('%s declares no provider token in two different modules', (_name, root) => {
    const declaredIn = new Map<Token, Set<ModuleNode>>();
    for (const node of collectGraph(root)) {
      for (const provider of node.providers) {
        const token = tokenOf(provider);
        if (MULTI_PROVIDER_TOKENS.has(token)) continue;
        declaredIn.set(token, (declaredIn.get(token) ?? new Set()).add(node));
      }
    }

    const duplicated = [...declaredIn]
      .filter(([, nodes]) => nodes.size > 1)
      .map(([token, nodes]) => ({ token: tokenName(token), modules: [...nodes].map((node) => node.module.name) }));
    expect(duplicated).toEqual([]);
  });

  it('declares the account repositories, PasswordHasher and IdentityAccessService once, and SessionRepo only in the API and the recovery command', () => {
    for (const [name, root] of graphs) {
      const graph = collectGraph(root);

      for (const repo of [AppUserRepo, CredentialRepo, RoleGrantRepo, ActionTokenRepo]) {
        expect({ name, repo: repo.name, declarations: declarationsOf(graph, repo).length }).toEqual({
          name,
          repo: repo.name,
          declarations: 1,
        });
      }
      expect({ name, hasher: declarationsOf(graph, PasswordHasher).length }).toEqual({ name, hasher: 1 });
      expect({ name, facade: declarationsOf(graph, IdentityAccessService).length }).toEqual({ name, facade: 1 });
      expect({ name, sessionRepo: declarationsOf(graph, SessionRepo).length }).toEqual({
        name,
        sessionRepo: name === 'AppModule' || name === 'RecoveryCliModule' ? 1 : 0,
      });
    }
  });

  it('E6: declares exactly the providers shared with the recovery command once in the API and once in the command', () => {
    const declaredIn = (graph: ModuleNode[], name: string) =>
      graph.flatMap((node) =>
        node.providers.filter((provider) => tokenName(tokenOf(provider)) === name).map(() => node.module.name),
      );
    const api = collectGraph(AppModule);
    const recovery = collectGraph(RecoveryCliModule);
    for (const name of DECLARED_FOR_API_AND_RECOVERY) {
      expect({ name, api: declaredIn(api, name), recovery: declaredIn(recovery, name) }).toEqual({
        name,
        api: ['IdentityAccessModule'],
        recovery: ['RecoveryModule'],
      });
    }

    // No other provider is declared in both modules: the list above is the whole exception, not a pattern.
    const providerNames = (module: Type<unknown>) => metadata(module, 'providers').map((p) => tokenName(tokenOf(p)));
    const inBoth = providerNames(IdentityAccessModule).filter((name) => providerNames(RecoveryModule).includes(name));
    expect(inBoth.sort()).toEqual([...DECLARED_FOR_API_AND_RECOVERY].sort());
  });

  it('GATE.2: binds the one ACCOUNT_SESSIONS token to SessionDirectoryService in the API and the recovery command, and injects that token into both consumers', () => {
    const declaringFiles = sourceFilesDeclaring("Symbol('ACCOUNT_SESSIONS')");
    expect(declaringFiles).toEqual([ACCOUNT_SESSIONS_OWNER]);

    for (const [name, root] of [
      ['AppModule', AppModule],
      ['RecoveryCliModule', RecoveryCliModule],
    ] as const) {
      const bindings = collectGraph(root).flatMap((node) =>
        node.providers
          .filter((provider) => tokenOf(provider) === ACCOUNT_SESSIONS)
          .map((provider) => ({ module: node.module.name, provider })),
      );
      expect({ name, bindings }).toEqual({
        name,
        bindings: [
          {
            module: name === 'AppModule' ? 'IdentityAccessModule' : 'RecoveryModule',
            provider: { provide: ACCOUNT_SESSIONS, useExisting: SessionDirectoryService },
          },
        ],
      });
    }
    for (const consumer of [AccountStatusService, HolderCredentialReset]) {
      const injected = (
        (Reflect.getMetadata(SELF_DECLARED_DEPS_METADATA, consumer) as { param: unknown }[] | undefined) ?? []
      ).filter(({ param }) => param === ACCOUNT_SESSIONS);
      expect({ consumer: consumer.name, injections: injected.length }).toEqual({
        consumer: consumer.name,
        injections: 1,
      });
    }
  });

  it('keeps controllers, the identity-access API module and the JWT library out of the recovery command', () => {
    const graph = collectGraph(RecoveryCliModule);

    expect(controllersOf(graph)).toEqual([]);
    expect(graph.map((node) => node.module)).not.toContain(IdentityAccessModule);
    expect(moduleNames(graph)).not.toContain('JwtModule');
  });

  it('declares the mail transport and the payload cipher once in the worker and not at all in the installation command', () => {
    const worker = collectGraph(WorkerModule);
    const installation = collectGraph(InstallationModule);

    for (const token of [MailTransport, PayloadCipher]) {
      expect({ token: token.name, declarations: declarationsOf(worker, token).length }).toEqual({
        token: token.name,
        declarations: 1,
      });
      expect({ token: token.name, declarations: declarationsOf(installation, token).length }).toEqual({
        token: token.name,
        declarations: 0,
      });
    }
  });

  it('keeps controllers, the identity-access module and the JWT library out of the worker', () => {
    const graph = collectGraph(WorkerModule);

    expect(controllersOf(graph)).toEqual([]);
    expect(graph.map((node) => node.module)).not.toContain(IdentityAccessModule);
    expect(moduleNames(graph)).not.toContain('JwtModule');
  });

  it('keeps controllers, notifications, the identity-access module, the queue and the JWT library out of the installation command', () => {
    const graph = collectGraph(InstallationModule);
    const modules = graph.map((node) => node.module);

    expect(controllersOf(graph)).toEqual([]);
    for (const forbidden of [NotificationsModule, IdentityAccessModule, QueueInfrastructureModule]) {
      expect(modules).not.toContain(forbidden);
    }
    expect(moduleNames(graph)).not.toContain('JwtModule');
  });

  it('mounts the Audit Trail reader in the API, and nowhere the facade alone is meant to go', () => {
    expect(controllersOf(collectGraph(AppModule))).toContain(AuditController);
    for (const root of [WorkerModule, InstallationModule]) {
      expect(controllersOf(collectGraph(root))).not.toContain(AuditController);
      expect(declarationsOf(collectGraph(root), AuditQueryRepo)).toHaveLength(0);
    }
  });

  it('exports only the public contract of a business module, except the legacy entries being removed', () => {
    const businessModules = businessModuleNames();
    const exported = new Set<string>();
    for (const root of [AppModule, WorkerModule, InstallationModule, RecoveryCliModule]) {
      for (const node of collectGraph(root)) {
        if (!businessModules.has(node.module.name)) continue;
        for (const token of metadata(node.module, 'exports')) {
          const name = tokenName(token);
          if (isPrivateExport(node.module.name, name)) exported.add(`${node.module.name}: ${name}`);
        }
      }
    }

    expect({
      newPrivateExports: [...exported].filter((entry) => !LEGACY_PRIVATE_EXPORTS.has(entry)).sort(),
      staleLedgerEntries: [...LEGACY_PRIVATE_EXPORTS].filter((entry) => !exported.has(entry)).sort(),
    }).toEqual({ newPrivateExports: [], staleLedgerEntries: [] });
  });

  it('A4-03: judges every exported token against the public contract list, not a name suffix', () => {
    expect(isPrivateExport('IdentityAccessFacadeModule', 'SuccessorEligibility')).toBe(true);
    expect(isPrivateExport('NotificationsModule', 'EmailDispatcher')).toBe(true);
    expect(isPrivateExport('OrganizationModule', 'IdentityAccessService')).toBe(true);
    expect(isPrivateExport('OrganizationModule', 'OrganizationRepo')).toBe(true);
    expect(isPrivateExport('IdentityAccessFacadeModule', 'PasswordHasher')).toBe(true);
    expect(isPrivateExport('IdentityAccessFacadeModule', 'IdentityAccessService')).toBe(false);
    expect(isPrivateExport('IdentityAccessModule', 'Symbol(ACCESS_TOKEN_VERIFIER)')).toBe(false);
    expect(isPrivateExport('OrganizationModule', 'OrganizationService')).toBe(false);
  });

  it('applies the export contract to business modules only, not to infrastructure or composition modules', () => {
    const names = businessModuleNames();

    for (const name of ['OrganizationModule', 'IdentityAccessFacadeModule', 'NotificationsModule', 'RecoveryModule']) {
      expect({ name, isBusiness: names.has(name) }).toEqual({ name, isBusiness: true });
    }
    for (const name of ['DatabaseModule', 'SecurityModule', 'WorkerModule', 'RecoveryCliModule']) {
      expect({ name, isBusiness: names.has(name) }).toEqual({ name, isBusiness: false });
    }
  });

  it('mounts the identity-access module and its three controllers in the API', () => {
    const graph = collectGraph(AppModule);

    expect(graph.map((node) => node.module)).toContain(IdentityAccessModule);
    expect(controllersOf(graph)).toEqual(expect.arrayContaining([AuthController, MeController, AppUsersController]));
  });
});
