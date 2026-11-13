import { Inject, Injectable, Module, Type } from '@nestjs/common';
import { SELF_DECLARED_DEPS_METADATA } from '@nestjs/common/constants';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { AppModule } from '../../src/app/app.module';
import { ACCOUNT_SESSIONS } from '../../src/modules/identity-access/accounts/account-sessions.types';
import { AccountStatusService } from '../../src/modules/identity-access/accounts/app-users/account-status.service';
import { SessionRecordService } from '../../src/modules/identity-access/auth/session-record.service';
import { HolderCredentialReset } from '../../src/modules/identity-access/recovery/holder-credential-reset.service';
import { MailTransport } from '../../src/infrastructure/mail/mail-transport';
import { AuditController } from '../../src/modules/audit/audit.controller';
import { AuditQueryRepo } from '../../src/modules/audit/audit-query.repo';
import { ActionTokenRepo } from '../../src/modules/identity-access/accounts/action-token.repo';
import { AppUserRepo } from '../../src/modules/identity-access/accounts/app-user.repo';
import { CredentialRepo } from '../../src/modules/identity-access/credentials/credential.repo';
import { RoleGrantRepo } from '../../src/modules/identity-access/accounts/role-grant.repo';
import { AppUsersController } from '../../src/modules/identity-access/accounts/app-users/app-users.controller';
import { MeController } from '../../src/modules/identity-access/access/me.controller';
import { AuthController } from '../../src/modules/identity-access/auth/auth.controller';
import { PasswordHasher } from '../../src/modules/identity-access/credentials/password-hasher.service';
import { SessionRepo } from '../../src/modules/identity-access/auth/session.repo';
import { IdentityAccessApi } from '../../src/modules/identity-access/public/identity-access.api';
import { IdentityAccessModule } from '../../src/modules/identity-access/identity-access.module';
import { IdentityAccessRecoveryCliModule } from '../../src/modules/identity-access/identity-access-recovery-cli.module';
import { InstallationModule } from '../../src/modules/installation/installation.module';
import { InspectionCliModule } from '../../src/modules/installation/inspect/inspection-cli.module';
import { SeedCliModule } from '../../src/modules/installation/seed/seed-cli.module';
import { MigrationPreflightCliModule } from '../../src/modules/installation/migration-preflight/migration-preflight-cli.module';
import { SubscriptionOwnerAssignmentCliModule } from '../../src/modules/catalog/subscription-owner-assignment/subscription-owner-assignment-cli.module';
import { AssignSubscriptionOwnerCliModule } from '../../src/cli/assign-subscription-owner/assign-subscription-owner-cli.module';
import { AiPurgeCliModule } from '../../src/cli/ai-purge/ai-purge-cli.module';
import { AiAssistPurgeCliModule } from '../../src/modules/ai-assist/purge/ai-assist-purge-cli.module';
import { CostCenterDirectionRootCliModule } from '../../src/cli/cost-center-direction/cost-center-direction-cli.module';
import { SuperAdminEventCliModule } from '../../src/modules/personnel/super-admin-event/super-admin-event-cli.module';
import { RecordSuperAdminEventCliModule } from '../../src/cli/record-super-admin-event/record-super-admin-event-cli.module';
import { IdentityAccessLocalSeedFacadeModule } from '../../src/modules/identity-access/identity-access-local-seed-facade.module';
import { IdentityAccessInspectionFacadeModule } from '../../src/modules/identity-access/identity-access-inspection-facade.module';
import { DATABASE_SESSION_OPTIONS } from '../../src/infrastructure/database/read-only-session.module';
import { NotificationsModule } from '../../src/modules/notifications/notifications.module';
import { PayloadCipher } from '../../src/modules/notifications/email/payload-cipher.service';
import { ObjectStorageModule } from '../../src/infrastructure/object-storage/object-storage.module';
import { QueueInfrastructureModule } from '../../src/infrastructure/queue/queue-infrastructure.module';
import { EmailDispatchLoop } from '../../src/worker/email-dispatch.job';
import { RequestWorkLoop } from '../../src/worker/request-work.job';
import { RecoveryCliModule } from '../../src/cli/recover/recover-cli.module';
import { WorkerModule } from '../../src/worker/worker.module';
import { consumersOfExports, moduleFolders, outsideConsumers } from '../support/module-export-consumers';
import { collectGraph, metadata, tokenName, tokenOf, type ModuleNode, type Token } from '../support/nest-module-graph';
import { PROCESS_GRAPHS } from '../support/process-graphs';

/**
 * What a business module may export for any module to use (docs/rules/module-structure.md): its facade, a port it implements for
 * infrastructure, or the service of a CLI entry module. Every other exported token of a business module is private, whatever its
 * name (A4-03), and R10 lets it be exported only when every class that injects it is in the exporting module's own folder (the
 * capability services an HTTP module of the same module calls instead of the facade). Exact `Module: token` pairs; a module that
 * is not mounted is not listed.
 */
const PUBLIC_CONTRACT_EXPORTS: ReadonlySet<string> = new Set([
  'AuditModule: AuditApi',
  // G5 (ADR-0016): the budgets facade the check of a request reads the figures through, and registers its listener with.
  'BudgetsModule: BudgetsApi',
  // The worker prices and checks conversions through read-only contracts, without mounting the HTTP contexts.
  'BudgetsReadFacadeModule: BudgetsReadApi',
  'CatalogPricingFacadeModule: CatalogPricingApi',
  // The extension points the requests context binds (public/budgets.extension-points.ts): what waits to be decided as spend, the release guard and the facts of a commitment request.
  'BudgetsModule: PendingSpendContributions',
  'BudgetsModule: CommitmentReleaseGuardHook',
  'BudgetsModule: CommitmentRequestFactsHook',
  // G4 (ADR-0013): the catalog facade licensing reads the seat targets (subscription or internal plan) through.
  'CatalogModule: CatalogApi',
  // The extension point licensing binds its reader of occupied seats to (public/catalog.extension-points.ts).
  'CatalogModule: SeatOccupancyHook',
  // The phase of the seat baseline licensing binds, so the rule against a second K2 or K4 subscription knows whether it is closed.
  'CatalogModule: SeatBaselinePhaseHook',
  'CatalogModule: SubscriptionPeriodApi',
  // H8.3 (A4-10): the data-import facade; onboarding reads the latest people import through it.
  'DataImportModule: DataImportApi',
  // G7: the register of company machines; personnel ends the registrations of a person who left through it.
  'DevicesModule: DevicesApi',
  // The extension point the usage module binds the collector allowlist to (devices/public/devices.extension-points.ts).
  'DevicesModule: CollectorAllowlistHook',
  'DevicesModule: Symbol(DEVICE_CREDENTIAL_VERIFIER)', // port of src/infrastructure/security
  // G3 (ADR-0013): the finance facade, money in and conversion snapshot out; the repos stay private.
  'FinanceModule: FinanceApi',
  // The audited exchange-rate use case the finance HTTP module serves; the raw ledger is not exported.
  'FinanceModule: ExchangeRateService',
  'IdentityAccessFacadeModule: IdentityAccessApi',
  // D-S21 (qd93-remove-fallback-substitute-approvers): who can never ask for or be given access through a Request, one facade for every route that makes one.
  'IdentityAccessFacadeModule: RequestPartyEligibilityApi',
  // The licensing facades, one per topic of its type files (R4): the revocation of seats and the grant of a request, the renewal, the
  // open grant tasks of a person, and (G4, ADR-0013) the seat baseline the import reads and writes through.
  'LicensingModule: LicensingApi',
  'LicensingModule: LicensingRenewalApi',
  'LicensingModule: LicensingGhostSeatApi',
  // qd103-vendor-usage-import: the seats and holders the usage import matches identities against, and the one door to the usage evidence the rules of wasted seats read.
  'LicensingModule: LicensingUsageApi',
  'UsageModule: UsageEvidenceApi',
  // qd103-ghost-seat-g3-g4: the extension point the rules of wasted seats bind to deny a recommendation when a report is confirmed.
  'UsageModule: UsageImportListeners',
  'LicensingModule: LicensingOpenGrantsApi',
  'OptimizationModule: OptimizationApi',
  'LicensingModule: LicensingSeatBaselineApi',
  // G8 (US-12-15): the counts of licensing the role overviews read.
  'LicensingModule: LicensingDashboardApi',
  // P2-03: what the shared pool of a plan holds, which the queue of grants of requests shows beside each request.
  'LicensingModule: LicensingPoolStockApi',
  // The extension points requests and personnel bind or add to (public/licensing.extension-points.ts).
  'LicensingModule: GrantRequestGateHook',
  'LicensingModule: RevocationListeners',
  'LicensingModule: RenewalHoldHook',
  'LicensingModule: RenewalFinancialContributions',
  'LicensingModule: RenewalUsageContributions',
  'LicensingModule: SeatBaselineClosedListeners',
  // H5.5 (identity-access Wave B): the account contracts the API and the recovery command reach the account persistence
  // through; the persistence itself is declared once, here, because every graph needs it.
  'IdentityAccessFacadeModule: AccountRecordService',
  'IdentityAccessFacadeModule: ActionLinkService',
  'IdentityAccessFacadeModule: CredentialService',
  // G5 (FR-3.16): where the approval roles and the role of Finance announce that they changed hands, so the account
  // services of the API emit into the one extension point the facade holds and requests listens to.
  'IdentityAccessFacadeModule: ApprovalRoleChangeListeners',
  // QĐ-93d(3): where the grant of SPENDING_APPROVER asks the modules above it for the open work of a person; requests, budgets and
  // licensing add a check each from a `*.listener.ts`, so the one point the facade holds is injected by them.
  'IdentityAccessFacadeModule: SpendingApproverGrantChecks',
  'IdentityAccessFacadeModule: RoleGrantService',
  // H6.1: the read-only account contract of `ops:inspect`, declared only in the inspection graph.
  'IdentityAccessInspectionFacadeModule: IdentityAccessInspectionApi',
  // H6.2: the local demo account contract of `ops:seed`, declared only in the seed graph.
  'IdentityAccessLocalSeedFacadeModule: LocalDemoAccountApi',
  'IdentityAccessModule: Symbol(ACCESS_TOKEN_VERIFIER)', // port of src/infrastructure/security
  'InstallationModule: InstallationApi',
  // H6.2: the entry service of `pnpm ops:seed`.
  // The in-process part of `pnpm ops:seed`: the demo accounts of the shared demo dataset (the rest goes through HTTP).
  'SeedCliModule: DemoAccountsApi',
  // H6.1: the entry service of `pnpm ops:inspect`.
  'InspectionCliModule: InstallationInspectionApi',
  // P28-01 (Prompt 29): the entry service of `pnpm ops:preflight`.
  'MigrationPreflightCliModule: MigrationPreflightApi',
  // F02: the entry service of `pnpm ops:assign-subscription-owner`.
  'SubscriptionOwnerAssignmentCliModule: SubscriptionOwnerAssignmentApi',
  // US-15-05: the entry service of `pnpm ops:ai-purge`.
  'AiAssistPurgeCliModule: AiPurgeApi',
  // F01: the service `pnpm ops:cost-center-direction` runs and the organization facade asks (whether the link is activated).
  'CostCenterDirectionCliModule: CostCenterDirectionApi',
  // F19 (Task 5.5): the controlled procedure for an event about the Super Admin, and the writes of the events it runs with an operator
  // actor (spec L.2): the personnel services of the CLI entry graph, never reached by another module.
  'SuperAdminEventCliModule: SuperAdminEventApi',
  'PersonnelModule: TransferService',
  'PersonnelModule: TransferChangeService',
  'PersonnelModule: LeaveService',
  'PersonnelModule: OffboardingService',
  'PersonnelModule: OffboardingChangeService',
  'PersonnelModule: NoticeHandlingService',
  'NotificationsModule: NotificationsApi',
  // ROOT.1: the delivery contract the worker's mail loop (composition root, ADR-0012) calls; EmailDispatcher stays private.
  'NotificationsModule: EmailDeliveryApi',
  // G5 (FR-3.11): the inbox the routes of `NotificationsHttpModule` read, held once in the module that gives the notices.
  'NotificationsModule: InboxService',
  'OperatingParametersModule: OperatingParametersApi',
  // G6 (ADR-0017): the extension point the flows that follow a personnel file (the owner of a service account) add their hooks to.
  'PersonnelModule: PersonnelFileHookContributions',
  // G6 (US-03-03): the days a person was on long leave, read by the rules of the recommendations of G7.
  'PersonnelModule: PersonnelApi',
  // G8 (US-12-15): the counts of personnel the role overviews read.
  'PersonnelModule: PersonnelDashboardApi',
  'OrganizationModule: OrganizationApi',
  'OrganizationModule: OrganizationReadApi',
  // The extension points the modules above bind or add to (public/organization.extension-points.ts).
  'OrganizationModule: OrganizationChangeListeners',
  'OrganizationModule: DepartmentUseContributions',
  'OrganizationModule: CostCenterUseContributions',
  'OrganizationModule: DepartmentServiceAccountReaderHook',
  'OrganizationModule: DepartmentCreationWindowHook',
  'OrganizationModule: EmployeeAccountsHook',
  // G6 (ADR-0017): the writes of history (a placement and a head period written ahead of their day) the personnel context calls.
  'OrganizationModule: OrganizationHistoryApi',
  // G5 (FR-3.16): the loop of the worker calls the sweep; the API module of requests reads the rest through the same module,
  // which holds the reassignment of steps once for both graphs (who a step is given to, the routing facts, the queue of waits).
  'RequestsWorkFacadeModule: StepRedeterminationSweepApi',
  // G5 (US-05-15): the loop of the worker calls the projection of the audit events of the requests into the inbox.
  'RequestsWorkFacadeModule: RequestStatusProjectorApi',
  // G5 (FR-3.8): the loop of the worker calls the reminders of the late steps; the API of the same context reads the age of the
  // queue of the head and the board of the Super Admin through the one declaration of each, so no provider is declared twice.
  'RequestsWorkFacadeModule: StepSlaSweepApi',
  'RequestsWorkFacadeModule: SlaQueueAgeService',
  'RequestsWorkFacadeModule: CongestionRepo',
  'RequestsWorkFacadeModule: StepTargetService',
  'RequestsWorkFacadeModule: RoutingFactsService',
  'RequestsWorkFacadeModule: ControlledWaitQueryService',
  // Spec L.1 (F27): the repo of the drafts of paid requests, read and written by the draft operations of the API and deleted with the
  // person who leaves by the listener of the worker graph, so it is declared once, here, for both.
  'RequestsWorkFacadeModule: RequestDraftRepo',
  // G6 (US-03-04): the facade the personnel context reads the open requests of a person who leaves through.
  'RequestsModule: RequestsApi',
  // G8 (US-12-15): the counts of requests the role overviews read.
  'RequestsModule: RequestsDashboardApi',
  // US-15-05: the steps that wait for a person, which the summary of their queue reads and checks again.
  'RequestsModule: RequestsAiSourceApi',
  // F43: the extension point the personnel context adds its listener of the outcome of a request to (public/requests.extension-points.ts).
  'RequestsModule: RequestOutcomeListeners',
  // MF3-C.3 (QĐ-110q, R-49): the extension point the personnel context adds its answer to — a person in the grace of a transfer who holds the software asked for (public/requests.extension-points.ts).
  'RequestsModule: TransferGraceHoldContributions',
  // The two entry services of `pnpm ops:recover` (Q6; E7): the holder's own account, and the role transfer.
  'IdentityAccessRecoveryCliModule: HolderRecoveryApi',
  'IdentityAccessRecoveryCliModule: RoleTransferRecoveryApi',
]);

// The real configuration modules load and validate an env file the moment they are imported. The
// graph only needs their shape, so they are replaced by an empty module.
jest.mock('@nestjs/config', () => ({
  ...jest.requireActual<object>('@nestjs/config'),
  ConfigModule: { forRoot: () => ({ module: class ConfigStubModule {} }) },
}));

/** Nest lets many providers share these on purpose (one per guard, pipe, filter or interceptor). */
const MULTI_PROVIDER_TOKENS: ReadonlySet<Token> = new Set([APP_GUARD, APP_PIPE, APP_FILTER, APP_INTERCEPTOR]);

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
 * in IdentityAccessModule and once in IdentityAccessRecoveryCliModule; the two never meet in one graph, and none is exported.
 */
const DECLARED_FOR_API_AND_RECOVERY = [
  'ActionLinkRevocation',
  'ApprovalRoleFactsService',
  'Symbol(APPROVAL_ROLE_HOLDINGS)',
  'RecoveryRepo',
  'SessionRecordService',
  'SessionRepo',
  'Symbol(ACCOUNT_SESSIONS)',
];

/** GATE.2: the one file that declares the session port shared by accounts and recovery (implemented by auth). */
const ACCOUNT_SESSIONS_OWNER = 'src/modules/identity-access/accounts/account-sessions.types.ts';

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
    ['InspectionCliModule', InspectionCliModule],
    ['SeedCliModule', SeedCliModule],
    ['MigrationPreflightCliModule', MigrationPreflightCliModule],
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

  it('declares the account repositories, PasswordHasher and IdentityAccessApi once, and SessionRepo only in the API and the recovery command', () => {
    for (const [name, root] of graphs) {
      const graph = collectGraph(root);
      // The preflight (P28-01) reads the database only: no account is in its graph at all.
      const once = name === 'MigrationPreflightCliModule' ? 0 : 1;

      for (const repo of [AppUserRepo, CredentialRepo, RoleGrantRepo, ActionTokenRepo]) {
        expect({ name, repo: repo.name, declarations: declarationsOf(graph, repo).length }).toEqual({
          name,
          repo: repo.name,
          declarations: once,
        });
      }
      expect({ name, hasher: declarationsOf(graph, PasswordHasher).length }).toEqual({ name, hasher: once });
      expect({ name, facade: declarationsOf(graph, IdentityAccessApi).length }).toEqual({ name, facade: once });
      expect({ name, sessionRepo: declarationsOf(graph, SessionRepo).length }).toEqual({
        name,
        sessionRepo: name === 'AppModule' || name === 'RecoveryCliModule' ? 1 : 0,
      });
    }
  });

  // E6
  it('declares exactly the providers shared with the recovery command once in the API and once in the command', () => {
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
        recovery: ['IdentityAccessRecoveryCliModule'],
      });
    }

    // No other provider is declared in both modules: the list above is the whole exception, not a pattern.
    const providerNames = (module: Type<unknown>) => metadata(module, 'providers').map((p) => tokenName(tokenOf(p)));
    const inBoth = providerNames(IdentityAccessModule).filter((name) =>
      providerNames(IdentityAccessRecoveryCliModule).includes(name),
    );
    expect(inBoth.sort()).toEqual([...DECLARED_FOR_API_AND_RECOVERY].sort());
  });

  // GATE.2
  it('binds the one ACCOUNT_SESSIONS token to SessionRecordService in the API and the recovery command, and injects that token into both consumers', () => {
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
            module: name === 'AppModule' ? 'IdentityAccessModule' : 'IdentityAccessRecoveryCliModule',
            provider: { provide: ACCOUNT_SESSIONS, useExisting: SessionRecordService },
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

  // R10
  it('lets a business module export outside its public contract only what a class of its own folder injects', () => {
    const businessModules = businessModuleNames();
    const folders = moduleFolders(join(process.cwd(), 'src'));
    const folderOf = (name: string): string => folders.get(name) ?? `library:${name}`;
    const reached: string[] = [];
    for (const [graphName, root] of PROCESS_GRAPHS) {
      for (const use of outsideConsumers(consumersOfExports(collectGraph(root)), folderOf)) {
        if (!businessModules.has(use.exporter) || !isPrivateExport(use.exporter, use.token)) continue;
        reached.push(`${graphName}: ${use.consumerModule}.${use.consumer} injects ${use.exporter}: ${use.token}`);
      }
    }

    expect(reached.sort()).toEqual([]);
  });

  // A4-03
  it('judges every exported token against the public contract list, not a name suffix', () => {
    expect(isPrivateExport('IdentityAccessFacadeModule', 'SuccessorEligibility')).toBe(true);
    expect(isPrivateExport('NotificationsModule', 'EmailDispatcher')).toBe(true);
    expect(isPrivateExport('OrganizationModule', 'IdentityAccessApi')).toBe(true);
    expect(isPrivateExport('OrganizationModule', 'OrganizationRepo')).toBe(true);
    expect(isPrivateExport('IdentityAccessFacadeModule', 'PasswordHasher')).toBe(true);
    expect(isPrivateExport('IdentityAccessFacadeModule', 'IdentityAccessApi')).toBe(false);
    expect(isPrivateExport('IdentityAccessModule', 'Symbol(ACCESS_TOKEN_VERIFIER)')).toBe(false);
    expect(isPrivateExport('OrganizationModule', 'OrganizationApi')).toBe(false);
  });

  it('applies the export contract to business modules only, not to infrastructure or composition modules', () => {
    const names = businessModuleNames();

    for (const name of [
      'OrganizationModule',
      'IdentityAccessFacadeModule',
      'NotificationsModule',
      'IdentityAccessRecoveryCliModule',
    ]) {
      expect({ name, isBusiness: names.has(name) }).toEqual({ name, isBusiness: true });
    }
    for (const name of ['DatabaseModule', 'SecurityModule', 'WorkerModule', 'RecoveryCliModule']) {
      expect({ name, isBusiness: names.has(name) }).toEqual({ name, isBusiness: false });
    }
  });

  // H6.4 (E2 = A, OD-R5, ADR-0014)
  it('keeps the standby queue module (no consumer yet) out of every process graph today, and object storage only in the API, for the files of contracts', () => {
    for (const [name, root] of graphs) {
      const modules = collectGraph(root).map((node) => node.module);

      expect({
        name,
        storage: modules.includes(ObjectStorageModule),
        queue: modules.includes(QueueInfrastructureModule),
      }).toEqual({ name, storage: name === 'AppModule', queue: false });
    }
  });

  // Describes today: the queue has no producer and no processor. The slice that adds the first consumer mounts
  // QueueInfrastructureModule on purpose and changes this expectation (and the one above) with it.
  // H6.4
  it('delivers mail by polling PostgreSQL in the worker, with no BullMQ queue, producer or processor registered yet', () => {
    const worker = collectGraph(WorkerModule);
    const tokens = worker.flatMap((node) => node.providers.map((provider) => tokenName(tokenOf(provider))));

    expect(declarationsOf(worker, EmailDispatchLoop)).toHaveLength(1);
    expect(tokens.filter((token) => token.startsWith('BullQueue_'))).toEqual([]);
    expect(sourceFilesDeclaring('registerQueue')).toEqual([]);
    expect(sourceFilesDeclaring('@Processor(')).toEqual([]);
  });

  // G5
  it('runs the reminders of late steps in the worker through the narrow requests graph, with no catalog and no controller, and declares what the API shares once', () => {
    const worker = collectGraph(WorkerModule);
    const api = collectGraph(AppModule);

    expect(worker.map((node) => node.module.name)).toContain('RequestsWorkFacadeModule');
    expect(worker.map((node) => node.module.name)).not.toContain('CatalogModule');
    expect(declarationsOf(worker, RequestWorkLoop)).toHaveLength(1);
    for (const name of [
      'StepSlaSweepApi',
      'StepSlaService',
      'BacklogAlertService',
      'ReminderWriter',
      'SlaSubjectRepo',
      'SlaReminderRepo',
      'SlaQueueAgeService',
      'CongestionRepo',
    ]) {
      const named = (graph: ModuleNode[]) =>
        graph.flatMap((node) =>
          node.providers.filter((provider) => tokenName(tokenOf(provider)) === name).map(() => node.module.name),
        );
      expect({ name, worker: named(worker) }).toEqual({ name, worker: ['RequestsWorkFacadeModule'] });
      expect({ name, api: named(api) }).toEqual({ name, api: ['RequestsWorkFacadeModule'] });
    }
    // Only the API serves the board of the Super Admin and has the controller that shows it.
    expect(controllersOf(worker)).toEqual([]);
    expect(controllersOf(api).map((controller) => (controller as { name: string }).name)).toContain(
      'CongestionController',
    );
  });

  it('mounts the identity-access module and its three controllers in the API', () => {
    const graph = collectGraph(AppModule);

    expect(graph.map((node) => node.module)).toContain(IdentityAccessModule);
    expect(controllersOf(graph)).toEqual(expect.arrayContaining([AuthController, MeController, AppUsersController]));
  });
});

// H6.1
describe('operational command graphs (docs/rules/operational-commands.md)', () => {
  const apiAndWorker: [string, Type<unknown>][] = [
    ['AppModule', AppModule],
    ['WorkerModule', WorkerModule],
  ];

  // rule 3
  it('keeps the command graphs and their contracts out of the API and the worker', () => {
    for (const [name, root] of apiAndWorker) {
      const modules = collectGraph(root).map((node) => node.module);

      expect({
        name,
        mounted: [
          InspectionCliModule,
          IdentityAccessInspectionFacadeModule,
          SeedCliModule,
          IdentityAccessLocalSeedFacadeModule,
          MigrationPreflightCliModule,
          SubscriptionOwnerAssignmentCliModule,
          AssignSubscriptionOwnerCliModule,
          AiAssistPurgeCliModule,
          AiPurgeCliModule,
          CostCenterDirectionRootCliModule,
          SuperAdminEventCliModule,
          RecordSuperAdminEventCliModule,
        ]
          .filter((module) => modules.includes(module))
          .map((module) => module.name),
      }).toEqual({ name, mounted: [] });
    }
  });

  // rule 1
  it('opens the sessions of the inspection and preflight graphs read-only, and of no other graph', () => {
    const graphs: [string, Type<unknown>, number][] = [
      ['AppModule', AppModule, 0],
      ['WorkerModule', WorkerModule, 0],
      ['InstallationModule', InstallationModule, 0],
      ['RecoveryCliModule', RecoveryCliModule, 0],
      ['InspectionCliModule', InspectionCliModule, 1],
      ['SeedCliModule', SeedCliModule, 0],
      ['MigrationPreflightCliModule', MigrationPreflightCliModule, 1],
      ['AssignSubscriptionOwnerCliModule', AssignSubscriptionOwnerCliModule, 0],
      ['AiPurgeCliModule', AiPurgeCliModule, 0],
      ['CostCenterDirectionRootCliModule', CostCenterDirectionRootCliModule, 0],
      ['RecordSuperAdminEventCliModule', RecordSuperAdminEventCliModule, 0],
    ];
    for (const [name, root, expected] of graphs) {
      expect({ name, readOnly: declarationsOf(collectGraph(root), DATABASE_SESSION_OPTIONS).length }).toEqual({
        name,
        readOnly: expected,
      });
    }
  });

  // rule 1
  it('loads only what the inspection reads: no controller, mail, queue, storage, JWT or API module', () => {
    const graph = collectGraph(InspectionCliModule);
    const modules = graph.map((node) => node.module);

    expect(controllersOf(graph)).toEqual([]);
    for (const forbidden of [
      NotificationsModule,
      IdentityAccessModule,
      IdentityAccessRecoveryCliModule,
      QueueInfrastructureModule,
    ]) {
      expect({ forbidden: forbidden.name, mounted: modules.includes(forbidden) }).toEqual({
        forbidden: forbidden.name,
        mounted: false,
      });
    }
    expect(moduleNames(graph)).not.toContain('JwtModule');
    expect(moduleNames(graph)).not.toContain('ConfigurationModule');
    expect(moduleNames(graph)).toContain('InstallationConfigurationModule');
    expect(declarationsOf(graph, MailTransport)).toHaveLength(0);
  });

  // rule 1, F01
  it('the Cost Center link graph loads the database settings and the audit facade only: no controller, no mail, no queue', () => {
    const graph = collectGraph(CostCenterDirectionRootCliModule);

    expect(controllersOf(graph)).toEqual([]);
    for (const forbidden of [
      NotificationsModule,
      IdentityAccessModule,
      IdentityAccessRecoveryCliModule,
      QueueInfrastructureModule,
    ]) {
      expect({ forbidden: forbidden.name, mounted: graph.map((node) => node.module).includes(forbidden) }).toEqual({
        forbidden: forbidden.name,
        mounted: false,
      });
    }
    expect(moduleNames(graph)).toContain('InstallationConfigurationModule');
    expect(moduleNames(graph)).not.toContain('ConfigurationModule');
    expect(declarationsOf(graph, MailTransport)).toHaveLength(0);
  });

  // rule 1, F02
  it('the owner-assignment graph loads the database settings, the organization and the audit facades only', () => {
    const graph = collectGraph(AssignSubscriptionOwnerCliModule);

    expect(controllersOf(graph)).toEqual([]);
    for (const forbidden of [
      NotificationsModule,
      IdentityAccessModule,
      IdentityAccessRecoveryCliModule,
      QueueInfrastructureModule,
    ]) {
      expect({ forbidden: forbidden.name, mounted: graph.map((node) => node.module).includes(forbidden) }).toEqual({
        forbidden: forbidden.name,
        mounted: false,
      });
    }
    expect(moduleNames(graph)).toContain('InstallationConfigurationModule');
    expect(moduleNames(graph)).not.toContain('ConfigurationModule');
    expect(moduleNames(graph)).not.toContain('CatalogModule');
    expect(declarationsOf(graph, MailTransport)).toHaveLength(0);
  });

  // rule 1, US-15-05
  it('the AI purge graph loads the database settings, the organization and the audit facades only: no AI service, no requests, no controller', () => {
    const graph = collectGraph(AiPurgeCliModule);

    expect(controllersOf(graph)).toEqual([]);
    for (const forbidden of [
      NotificationsModule,
      IdentityAccessModule,
      IdentityAccessRecoveryCliModule,
      QueueInfrastructureModule,
    ]) {
      expect({ forbidden: forbidden.name, mounted: graph.map((node) => node.module).includes(forbidden) }).toEqual({
        forbidden: forbidden.name,
        mounted: false,
      });
    }
    expect(moduleNames(graph)).toContain('InstallationConfigurationModule');
    for (const forbidden of ['ConfigurationModule', 'AiAssistModule', 'RequestsModule', 'OperatingParametersModule']) {
      expect({ forbidden, mounted: moduleNames(graph).includes(forbidden) }).toEqual({ forbidden, mounted: false });
    }
    expect(declarationsOf(graph, MailTransport)).toHaveLength(0);
  });

  // rule 1, P28-01
  it('the preflight graph loads the database settings and the database only: no business module', () => {
    const graph = collectGraph(MigrationPreflightCliModule);

    expect(controllersOf(graph)).toEqual([]);
    for (const forbidden of [
      NotificationsModule,
      IdentityAccessModule,
      IdentityAccessRecoveryCliModule,
      QueueInfrastructureModule,
    ]) {
      expect({ forbidden: forbidden.name, mounted: graph.map((node) => node.module).includes(forbidden) }).toEqual({
        forbidden: forbidden.name,
        mounted: false,
      });
    }
    expect(moduleNames(graph)).toContain('InstallationConfigurationModule');
    expect(moduleNames(graph)).not.toContain('OrganizationModule');
    expect(moduleNames(graph)).not.toContain('ConfigurationModule');
  });
});

// H6.2
describe('the local seed graph', () => {
  // rule 3
  it('declares the demo account contract in the seed graph only', () => {
    const graphs: [string, Type<unknown>, number][] = [
      ['AppModule', AppModule, 0],
      ['WorkerModule', WorkerModule, 0],
      ['InstallationModule', InstallationModule, 0],
      ['RecoveryCliModule', RecoveryCliModule, 0],
      ['InspectionCliModule', InspectionCliModule, 0],
      // ops:seed writes its demo accounts through the same contract (one direct role, never a derived one).
      ['SeedCliModule', SeedCliModule, 1],
      ['MigrationPreflightCliModule', MigrationPreflightCliModule, 0],
      ['AssignSubscriptionOwnerCliModule', AssignSubscriptionOwnerCliModule, 0],
      ['AiPurgeCliModule', AiPurgeCliModule, 0],
      ['CostCenterDirectionRootCliModule', CostCenterDirectionRootCliModule, 0],
      ['RecordSuperAdminEventCliModule', RecordSuperAdminEventCliModule, 0],
    ];
    for (const [name, root, expected] of graphs) {
      const modules = collectGraph(root).map((node) => node.module);
      expect({
        name,
        seedContract: modules.filter((module) => module === IdentityAccessLocalSeedFacadeModule).length,
      }).toEqual({
        name,
        seedContract: expected,
      });
    }
  });

  it.each([['SeedCliModule', SeedCliModule]])(
    '%s loads only what it writes through: no controller, mail, queue, JWT, API module or full configuration',
    (_name, root) => {
      const graph = collectGraph(root);
      const modules = graph.map((node) => node.module);

      expect(controllersOf(graph)).toEqual([]);
      for (const forbidden of [
        NotificationsModule,
        IdentityAccessModule,
        IdentityAccessRecoveryCliModule,
        QueueInfrastructureModule,
        ObjectStorageModule,
      ]) {
        expect({ forbidden: forbidden.name, mounted: modules.includes(forbidden) }).toEqual({
          forbidden: forbidden.name,
          mounted: false,
        });
      }
      expect(moduleNames(graph)).not.toContain('JwtModule');
      expect(moduleNames(graph)).not.toContain('ConfigurationModule');
      expect(moduleNames(graph)).toContain('InstallationConfigurationModule');
      expect(declarationsOf(graph, MailTransport)).toHaveLength(0);
    },
  );
});

// R10
describe('an export outside the public contract is used only inside its own module folder (docs/rules/module-structure.md)', () => {
  @Injectable()
  class Secret {}
  @Injectable()
  class Neighbour {
    constructor(readonly secret: Secret) {}
  }
  @Injectable()
  class Stranger {
    constructor(readonly secret: Secret) {}
  }
  const SESSION = Symbol('SESSION');
  @Injectable()
  class ByToken {
    constructor(@Inject(SESSION) readonly session: unknown) {}
  }
  @Module({ providers: [Secret, { provide: SESSION, useValue: 1 }], exports: [Secret, SESSION] })
  class ExporterModule {}
  @Module({ imports: [ExporterModule], providers: [Neighbour] })
  class NeighbourModule {}
  @Module({ imports: [ExporterModule], providers: [Stranger, ByToken] })
  class StrangerModule {}
  @Module({ imports: [ExporterModule], providers: [{ provide: 'MADE', useFactory: () => 1, inject: [Secret] }] })
  class FactoryModule {}
  @Module({ imports: [ExporterModule] })
  class ReExportModule {}
  @Module({ imports: [ReExportModule], providers: [Stranger] })
  class BehindModule {}
  // an alias of an export is a use of it: `{ provide: ALIAS, useExisting: Secret }` hands the private class to whoever injects ALIAS
  const ALIAS = Symbol('ALIAS');
  @Module({
    imports: [ExporterModule],
    providers: [
      { provide: ALIAS, useExisting: Secret },
      { provide: 'OF_TOKEN', useExisting: SESSION },
    ],
  })
  class AliasModule {}
  @Module({ imports: [ExporterModule], providers: [{ provide: 'BUILT', useClass: Stranger }] })
  class ClassModule {}
  @Module({ imports: [ExporterModule], providers: [{ provide: ALIAS, useExisting: Secret }] })
  class AliasNeighbourModule {}

  const folders: Record<string, string> = {
    ExporterModule: 'src/modules/a',
    NeighbourModule: 'src/modules/a',
    StrangerModule: 'src/modules/b',
    FactoryModule: 'src/worker',
    BehindModule: 'src/modules/b',
    AliasModule: 'src/modules/c',
    ClassModule: 'src/modules/d',
    AliasNeighbourModule: 'src/modules/a',
  };
  const folderOf = (name: string): string => folders[name] ?? 'unknown';
  const outside = (root: Type<unknown>) =>
    outsideConsumers(consumersOfExports(collectGraph(root)), folderOf)
      .map((use) => `${use.consumerModule}.${use.consumer} -> ${use.exporter}: ${use.token}`)
      .sort();

  it('reads a consumer from the constructor of a provider of an importing module: by type, by @Inject token, and from a factory', () => {
    @Module({ imports: [NeighbourModule, StrangerModule, FactoryModule] })
    class Root {}

    expect(
      consumersOfExports(collectGraph(Root))
        .map((use) => `${use.consumerModule}.${use.consumer} -> ${use.token}`)
        .sort(),
    ).toEqual([
      'FactoryModule.MADE -> Secret',
      'NeighbourModule.Neighbour -> Secret',
      'StrangerModule.ByToken -> Symbol(SESSION)',
      'StrangerModule.Stranger -> Secret',
    ]);
  });

  it('accepts a consumer in the exporting module folder and names one outside it', () => {
    @Module({ imports: [NeighbourModule] })
    class Inside {}
    @Module({ imports: [NeighbourModule, StrangerModule, FactoryModule] })
    class Outside {}

    expect(outside(Inside)).toEqual([]);
    expect(outside(Outside)).toEqual([
      'FactoryModule.MADE -> ExporterModule: Secret',
      'StrangerModule.ByToken -> ExporterModule: Symbol(SESSION)',
      'StrangerModule.Stranger -> ExporterModule: Secret',
    ]);
  });

  it('counts the target of a `useExisting` alias, and the class of a `useClass` provider, as used by the module that declares them', () => {
    @Module({ imports: [AliasModule, ClassModule, AliasNeighbourModule] })
    class Root {}

    expect(outside(Root)).toEqual(
      [
        'AliasModule.Symbol(ALIAS) -> ExporterModule: Secret',
        'AliasModule.OF_TOKEN -> ExporterModule: Symbol(SESSION)',
        'ClassModule.BUILT -> ExporterModule: Secret',
      ].sort(),
    );
    // the same alias in the folder of the exporter stays inside the folder
    @Module({ imports: [AliasNeighbourModule] })
    class Inside {}

    expect(outside(Inside)).toEqual([]);
    expect(consumersOfExports(collectGraph(Inside)).map((use) => `${use.consumer} -> ${use.token}`)).toEqual([
      'Symbol(ALIAS) -> Secret',
    ]);
  });

  it('is not hidden by a module in between that re-exports the exporting module', () => {
    @Module({ imports: [ExporterModule], exports: [ExporterModule] })
    class Through {}
    @Module({ imports: [Through], providers: [Stranger] })
    class Behind {}
    @Module({ imports: [Behind] })
    class Root {}
    const folderThrough = (name: string): string => (name === 'Behind' ? 'src/modules/b' : folderOf(name));

    expect(
      outsideConsumers(consumersOfExports(collectGraph(Root)), folderThrough).map(
        (use) => `${use.consumerModule}.${use.consumer} -> ${use.token}`,
      ),
    ).toEqual(['Behind.Stranger -> Secret']);
  });

  it('does not count the import of a module whose providers never inject the token', () => {
    @Module({ imports: [ReExportModule, BehindModule] })
    class Root {}

    expect(consumersOfExports(collectGraph(Root)).filter((use) => use.consumerModule === 'ReExportModule')).toEqual([]);
  });
});
