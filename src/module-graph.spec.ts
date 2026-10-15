import { Type } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { AppModule } from './app.module';
import { MailTransport } from './infrastructure/mail/mail-transport';
import { AccountRepo } from './modules/identity-access/accounts/account.repo';
import { AppUsersController } from './modules/identity-access/accounts/app-users.controller';
import { MeController } from './modules/identity-access/access/me.controller';
import { AuthController } from './modules/identity-access/auth/auth.controller';
import { PasswordHasher } from './modules/identity-access/auth/password-hasher.service';
import { SessionRepo } from './modules/identity-access/auth/session.repo';
import { IdentityAccessService } from './modules/identity-access/identity-access.service';
import { IdentityAccessModule } from './modules/identity-access/identity-access.module';
import { InstallationModule } from './modules/installation/installation.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { PayloadCipher } from './modules/notifications/payload-cipher';
import { QueueInfrastructureModule } from './infrastructure/queue/queue-infrastructure.module';
import { WorkerModule } from './worker.module';

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

function metadata(module: Type<unknown>, key: 'imports' | 'providers' | 'controllers'): unknown[] {
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

describe('module graph', () => {
  const graphs: [string, Type<unknown>][] = [
    ['AppModule', AppModule],
    ['WorkerModule', WorkerModule],
    ['InstallationModule', InstallationModule],
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

  it('declares AccountRepo, PasswordHasher and IdentityAccessService once, and SessionRepo only in the API', () => {
    for (const [name, root] of graphs) {
      const graph = collectGraph(root);

      expect({ name, accountRepo: declarationsOf(graph, AccountRepo).length }).toEqual({ name, accountRepo: 1 });
      expect({ name, hasher: declarationsOf(graph, PasswordHasher).length }).toEqual({ name, hasher: 1 });
      expect({ name, facade: declarationsOf(graph, IdentityAccessService).length }).toEqual({ name, facade: 1 });
      expect({ name, sessionRepo: declarationsOf(graph, SessionRepo).length }).toEqual({
        name,
        sessionRepo: name === 'AppModule' ? 1 : 0,
      });
    }
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

  it('mounts the identity-access module and its three controllers in the API', () => {
    const graph = collectGraph(AppModule);

    expect(graph.map((node) => node.module)).toContain(IdentityAccessModule);
    expect(controllersOf(graph)).toEqual(expect.arrayContaining([AuthController, MeController, AppUsersController]));
  });
});
