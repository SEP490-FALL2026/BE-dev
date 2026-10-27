import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import * as ts from 'typescript';
import { environmentConfigOptions, installationEnvironmentConfigOptions } from './infrastructure/config/env-config';
import { validateEnvironment, validateInstallationEnvironment } from './infrastructure/config/env-schema';

function listTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory()
      ? listTypeScriptFiles(path)
      : path.endsWith('.ts') && !path.endsWith('.spec.ts')
        ? [path]
        : [];
  });
}

/**
 * Every Prisma model has exactly one owning module. A module may only touch its own
 * delegates; it reads another module's data through that module's public contract.
 */
const PRISMA_MODEL_OWNER: Readonly<Record<string, string>> = {
  AuditEvent: 'audit',
  Application: 'catalog',
  ApplicationBusinessOwner: 'catalog',
  Subscription: 'catalog',
  SubscriptionOwnerAssignment: 'catalog',
  Plan: 'catalog',
  PlanTerms: 'catalog',
  PlanTermOpinion: 'catalog',
  PlanWorkspaceProfile: 'catalog',
  PlanWorkspaceAdmin: 'catalog',
  FunctionalGroup: 'catalog',
  Vendor: 'catalog',
  VendorGroup: 'catalog',
  VendorServiceLine: 'catalog',
  VendorDictionaryProposal: 'catalog',
  VendorTaxProfile: 'finance',
  VendorTaxProfileVersion: 'finance',
  StandardToolset: 'catalog',
  StandardToolsetVersion: 'catalog',
  StandardToolsetItem: 'catalog',
  VendorTaxProfileLine: 'finance',
  SubscriptionCostAllocation: 'finance',
  SubscriptionCostAllocationVersion: 'finance',
  SubscriptionCostAllocationLine: 'finance',
  LicenseAssignment: 'licensing',
  ProvisioningTask: 'licensing',
  ProvisioningTaskReason: 'licensing',
  HandoverDuty: 'licensing',
  ServiceAccountMove: 'licensing',
  ServiceAccountDutyNotice: 'licensing',
  AssignmentExpiryReminder: 'licensing',
  SaasIssue: 'licensing',
  SaasIssueEntry: 'licensing',
  LicenseKey: 'licensing',
  LicenseKeyRevealWindow: 'licensing',
  AccessRequest: 'requests',
  AccessRequestBeneficiary: 'requests',
  AccessRequestLine: 'requests',
  AccessRequestLineDecision: 'requests',
  AccessRequestLineAmount: 'requests',
  AccessRequestStep: 'requests',
  ApprovalRecord: 'requests',
  ControlledWaitAlert: 'requests',
  StepSlaReminder: 'requests',
  StepSlaReminderRecipient: 'requests',
  CongestionIncident: 'requests',
  RequestStatusCursor: 'requests',
  AccessRequestProposal: 'requests',
  AccessRequestAssessment: 'requests',
  AccessRequestServiceAccount: 'requests',
  AccessRequestRenewal: 'requests',
  ReturnRequest: 'requests',
  BudgetProposal: 'budgets',
  BudgetProposalLine: 'budgets',
  BudgetVersion: 'budgets',
  BudgetVersionLine: 'budgets',
  BudgetVersionLineChange: 'budgets',
  BudgetVersionDecision: 'budgets',
  BudgetCommitment: 'budgets',
  BudgetCommitmentRelease: 'budgets',
  RequestBudgetCheck: 'requests',
  RequestBudgetCheckYear: 'requests',
  RequestFinanceReview: 'requests',
  SpendBatch: 'requests',
  SpendBatchItem: 'requests',
  RequestSupplement: 'requests',
  RequestSupplementDrop: 'requests',
  SpendDecision: 'requests',
  BudgetInformationRequest: 'requests',
  ApplicationRetirementConfirmation: 'catalog',
  Contract: 'catalog',
  DocumentAttachment: 'catalog',
  SeatBaselineState: 'licensing',
  SeatBaselineImport: 'data-import',
  SeatBaselineImportRow: 'data-import',
  Currency: 'finance',
  ExchangeRate: 'finance',
  Organization: 'organization',
  CostCenter: 'organization',
  CostCenterDepartmentLink: 'organization',
  CostCenterDirectionActivation: 'organization',
  Department: 'organization',
  DepartmentHeadPeriod: 'organization',
  Project: 'organization',
  ProjectDepartment: 'organization',
  JobTitle: 'organization',
  Employee: 'organization',
  EmployeePlacement: 'organization',
  OrganizationChangeAnnouncement: 'organization',
  DepartmentTransfer: 'personnel',
  DepartmentTransferChange: 'personnel',
  TransferReview: 'personnel',
  TransferReviewItem: 'personnel',
  EmployeeLeave: 'personnel',
  EmployeeLeaveChange: 'personnel',
  OffboardingCase: 'personnel',
  OffboardingCaseChange: 'personnel',
  PersonnelNotice: 'personnel',
  PersonnelNoticeVerification: 'personnel',
  AppUser: 'identity-access',
  ApprovalRoleHolder: 'identity-access',
  RecoveryTicket: 'identity-access',
  PasswordCredential: 'identity-access',
  RoleGrant: 'identity-access',
  AuthSession: 'identity-access',
  RefreshToken: 'identity-access',
  LoginThrottle: 'identity-access',
  AccountActionToken: 'identity-access',
  EmailOutbox: 'notifications',
  InAppNotification: 'notifications',
  ParameterValue: 'operating-parameters',
  EmployeeImport: 'data-import',
  EmployeeImportRow: 'data-import',
  NonWorkingDate: 'operating-parameters',
};

interface PrismaModelTable {
  model: string;
  table: string;
}

/** Reads each `model X { ... @@map("x") }` block so both the delegate name and the real table name are known. */
function listPrismaTables(): PrismaModelTable[] {
  const modelsRoot = join(process.cwd(), 'prisma', 'models');

  return readdirSync(modelsRoot).flatMap((entry) =>
    [...readFileSync(join(modelsRoot, entry), 'utf8').matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)].map((match) => ({
      model: match[1],
      table: /@@map\("([^"]+)"\)/.exec(match[2])?.[1] ?? match[1],
    })),
  );
}

function listPrismaModels(): string[] {
  return listPrismaTables().map(({ model }) => model);
}

function prismaDelegateName(model: string): string {
  return model.charAt(0).toLowerCase() + model.slice(1);
}

describe('architecture boundaries', () => {
  const sourceRoot = join(process.cwd(), 'src');

  it('keeps core framework-free', () => {
    // `/modules/` added 18/10/2026 (docs/rules/module-structure.md): core is pure TypeScript and knows no business module.
    const forbidden = ['@nestjs/', '@prisma/', '@aws-sdk/', 'bullmq', '/infrastructure/', '/modules/'];

    for (const file of listTypeScriptFiles(join(sourceRoot, 'core'))) {
      const source = readFileSync(file, 'utf8').replaceAll('\\', '/');
      for (const dependency of forbidden) {
        expect({
          file: relative(sourceRoot, file),
          dependency,
          isImported: source.includes(dependency),
        }).toMatchObject({ isImported: false });
      }
    }
  });

  it('prevents imports of another business module private files', () => {
    const findings = privateModuleImportFindings(sourceRoot, listTypeScriptFiles(join(sourceRoot, 'modules')));
    const ledger = [...LEGACY_PRIVATE_MODULE_IMPORTS].filter((entry) => entry.startsWith('modules/'));

    expect(againstLedger(findings, ledger)).toEqual({ newViolations: [], staleLedgerEntries: [] });
  });

  it('holds the composition roots (API, worker, CLI entry files) to the same public module contract', () => {
    const rootFiles = readdirSync(sourceRoot)
      .map((entry) => join(sourceRoot, entry))
      .filter((path) => statSync(path).isFile() && path.endsWith('.ts') && !path.endsWith('.spec.ts'));
    expect(rootFiles).toContain(join(sourceRoot, 'installation-cli.ts'));

    const findings = privateModuleImportFindings(sourceRoot, rootFiles);
    const ledger = [...LEGACY_PRIVATE_MODULE_IMPORTS].filter((entry) => !entry.startsWith('modules/'));

    expect(againstLedger(findings, ledger)).toEqual({ newViolations: [], staleLedgerEntries: [] });
  });

  it('reports the ledger differences in both directions', () => {
    expect(againstLedger(['a', 'b'], ['b', 'c'])).toEqual({ newViolations: ['a'], staleLedgerEntries: ['c'] });
  });

  it('reports an import of a module subfolder such as identity-access/errors as private', () => {
    const cli = join(sourceRoot, 'installation-cli.ts');
    const identity = join(sourceRoot, 'modules', 'identity-access');

    expect(privateModuleImport(sourceRoot, cli, join(identity, 'errors', 'identity-access.errors.ts'))).toHaveLength(1);
    expect(privateModuleImport(sourceRoot, cli, join(identity, 'auth', 'password-hasher.service.ts'))).toHaveLength(1);
    expect(privateModuleImport(sourceRoot, cli, join(identity, 'identity-access.errors.ts'))).toEqual([]);
    expect(privateModuleImport(sourceRoot, cli, join(identity, 'identity-access.service.ts'))).toEqual([]);
  });

  describe('A4-02: the public surface of a module is an allowlist, not its whole root', () => {
    const identity = join(sourceRoot, 'modules', 'identity-access');
    const otherModule = join(sourceRoot, 'modules', 'organization', 'department', 'department.service.ts');
    const compositionRoot = join(sourceRoot, 'recovery-cli.ts');

    it('blocks an arbitrary file at the root of another module', () => {
      expect(privateModuleImport(sourceRoot, otherModule, join(identity, 'session-helper.ts'))).toHaveLength(1);
      expect(
        privateModuleImport(
          sourceRoot,
          otherModule,
          join(sourceRoot, 'modules', 'data-import', 'employee-import', 'employee-import.service.ts'),
        ),
      ).toHaveLength(1);
    });

    it('allows each public pattern: module, HTTP and facade modules, facade service, types and public errors', () => {
      for (const file of [
        'identity-access.module.ts',
        'identity-access-http.module.ts',
        'identity-access-facade.module.ts',
        'identity-access.service.ts',
        'session.types.ts',
        'identity-access.errors.ts',
      ]) {
        expect({ file, violations: privateModuleImport(sourceRoot, otherModule, join(identity, file)) }).toEqual({
          file,
          violations: [],
        });
      }
    });

    it('keeps repositories, the credential hasher and capability files private', () => {
      for (const target of [
        join(identity, 'recovery', 'recovery.repo.ts'),
        join(identity, 'accounts', 'password-hasher.service.ts'),
        join(identity, 'accounts', 'account-invitation.service.ts'),
        join(identity, 'auth', 'session.types.ts'),
      ]) {
        expect(privateModuleImport(sourceRoot, otherModule, target)).toHaveLength(1);
      }
    });

    it('opens the listed CLI entry files to composition roots only', () => {
      const entry = join(identity, 'recovery', 'holder-recovery.service.ts');

      expect(privateModuleImport(sourceRoot, compositionRoot, entry)).toEqual([]);
      expect(privateModuleImport(sourceRoot, otherModule, entry)).toHaveLength(1);
      expect(
        privateModuleImport(sourceRoot, compositionRoot, join(identity, 'recovery', 'recovery.repo.ts')),
      ).toHaveLength(1);
    });

    it('gives the same answer for Windows and POSIX separators', () => {
      const posix = (path: string) => path.split(sep).join('/');

      expect(privateModuleImport(sourceRoot, posix(otherModule), posix(join(identity, 'session-helper.ts')))).toEqual(
        privateModuleImport(sourceRoot, otherModule, join(identity, 'session-helper.ts')),
      );
      expect(
        privateModuleImport(sourceRoot, posix(otherModule), posix(join(identity, 'identity-access.service.ts'))),
      ).toEqual([]);
    });
  });

  it('keeps business modules flat instead of recreating application layers', () => {
    const modulesRoot = join(sourceRoot, 'modules');
    const forbiddenLayerDirectories = new Set(['api', 'application', 'domain', 'infrastructure']);

    for (const moduleName of readdirSync(modulesRoot)) {
      const moduleRoot = join(modulesRoot, moduleName);
      if (!statSync(moduleRoot).isDirectory()) continue;

      const forbiddenDirectories = readdirSync(moduleRoot).filter(
        (entry) => statSync(join(moduleRoot, entry)).isDirectory() && forbiddenLayerDirectories.has(entry),
      );
      expect({ moduleName, forbiddenDirectories }).toMatchObject({ forbiddenDirectories: [] });
    }
  });

  it('assigns every Prisma model to an owning module', () => {
    for (const model of listPrismaModels()) {
      const owner = PRISMA_MODEL_OWNER[model];
      expect({ model, owner, isOwned: typeof owner === 'string' }).toEqual({ model, owner, isOwned: true });
    }
  });

  it('lets only the owning module touch its Prisma tables', () => {
    const modulesRoot = join(sourceRoot, 'modules');
    const delegateOwner = new Map(
      Object.entries(PRISMA_MODEL_OWNER).map(([model, owner]) => [prismaDelegateName(model), owner]),
    );

    for (const file of listTypeScriptFiles(modulesRoot)) {
      const owner = relative(modulesRoot, file).split(sep)[0];
      const source = readFileSync(file, 'utf8');

      for (const match of source.matchAll(/\b(?:prisma|tx|client)\.([A-Za-z][A-Za-z0-9]*)\b/g)) {
        const delegateOwnerModule = delegateOwner.get(match[1]);
        if (delegateOwnerModule === undefined) continue;

        const location = { file: relative(sourceRoot, file), delegate: match[1] };
        expect({ ...location, owner: delegateOwnerModule }).toEqual({ ...location, owner });
      }
    }
  });

  it('confines PrismaService to repository files inside business modules', () => {
    const modulesRoot = join(sourceRoot, 'modules');

    for (const file of listTypeScriptFiles(modulesRoot)) {
      if (file.endsWith('.repo.ts')) continue;

      expect({
        file: relative(sourceRoot, file),
        usesPrismaService: readFileSync(file, 'utf8').includes('PrismaService'),
      }).toEqual({ file: relative(sourceRoot, file), usesPrismaService: false });
    }
  });

  it('keeps raw SQL inside the module that owns the table', () => {
    // The delegate scan above cannot see `$queryRaw`/`$executeRaw`, which is the most
    // realistic way to reach another module's table while evading every other rule here.
    // Only files that actually run raw SQL are scanned for table names, so an ordinary
    // file mentioning a word like "employees" in prose is not a false positive.
    const modulesRoot = join(sourceRoot, 'modules');
    const tableOwner = new Map(
      listPrismaTables()
        .filter(({ model }) => PRISMA_MODEL_OWNER[model] !== undefined)
        .map(({ model, table }) => [table, PRISMA_MODEL_OWNER[model]]),
    );

    for (const file of listTypeScriptFiles(modulesRoot)) {
      const source = readFileSync(file, 'utf8');
      if (!/\$(?:query|execute)Raw(?:Unsafe)?/.test(source)) continue;
      if (PRE_MIGRATION_READERS.has(relative(modulesRoot, file).split(sep).join('/'))) continue;

      const owner = relative(modulesRoot, file).split(sep)[0];

      for (const [table, owningModule] of tableOwner) {
        // String.raw is required: inside a plain template literal `\b` is the
        // backspace character, not a word boundary, so the pattern would match nothing.
        if (!new RegExp(String.raw`\b${table}\b`).test(source)) continue;

        const location = { file: relative(sourceRoot, file), table };
        expect({ ...location, owner: owningModule }).toEqual({ ...location, owner });
      }
    }
  });

  it('lets only the registered pre-migration readers read across modules, and only with SELECT', () => {
    const modulesRoot = join(sourceRoot, 'modules');

    for (const path of PRE_MIGRATION_READERS.keys()) {
      // One exact file per entry: no directory, no wildcard, no spec.
      const file = join(modulesRoot, ...path.split('/'));
      const exact = /^[a-z0-9-]+(?:\/[a-z0-9-]+)*\/[a-z0-9.-]+\.ts$/.test(path) && !path.endsWith('.spec.ts');
      expect({ path, exact, file: existsSync(file) && statSync(file).isFile() }).toEqual({
        path,
        exact: true,
        file: true,
      });
      const { statements, fragments, otherAccess } = rawSqlOf(file);
      // Only `$queryRaw` statements and `Prisma.sql` fragments: no `$executeRaw`, no `*Unsafe`, no delegate write.
      expect({ path, otherAccess }).toEqual({ path, otherAccess: [] });
      expect({ path, reads: statements.length > 0 }).toEqual({ path, reads: true });
      const notSelect = statements.filter((sql) => !/^\s*(?:SELECT|WITH)\b/i.test(sql));
      expect({ path, notSelect }).toEqual({ path, notSelect: [] });
      const writes = [...statements, ...fragments].flatMap((sql) => sql.match(SQL_WRITE) ?? []);
      expect({ path, writes }).toEqual({ path, writes: [] });
    }
  });

  it('reaches each pre-migration reader from the preflight command only: never the API, the worker or another command', () => {
    const importers = new Map<string, string[]>();
    for (const file of listTypeScriptFiles(sourceRoot)) {
      if (file.includes(`${sep}generated${sep}`)) continue;
      for (const target of listResolvedRelativeImports(file))
        importers.set(target, [...(importers.get(target) ?? []), file]);
    }

    for (const path of PRE_MIGRATION_READERS.keys()) {
      const reached = new Set([join(sourceRoot, 'modules', ...path.split('/'))]);
      const pending = [...reached];
      while (pending.length > 0) {
        for (const importer of importers.get(pending.pop() as string) ?? []) {
          if (reached.has(importer)) continue;
          reached.add(importer);
          pending.push(importer);
        }
      }
      const roots = [...reached]
        .filter((file) => dirname(file) === sourceRoot)
        .map((file) => relative(sourceRoot, file))
        .sort();

      expect({ path, roots }).toEqual({ path, roots: ['migration-preflight-cli.ts'] });
    }
  });
});

/** A statement or function that writes, locks or changes the session — none may appear in a pre-migration reader. */
const SQL_WRITE =
  /\b(?:INSERT|UPDATE|DELETE|MERGE|UPSERT|INTO|ALTER|CREATE|DROP|TRUNCATE|GRANT|REVOKE|COPY|LOCK|CALL|VACUUM|REINDEX|CLUSTER|REFRESH|COMMENT|SET_CONFIG|SETVAL|NEXTVAL|PG_ADVISORY_\w+)\b/gi;

/**
 * The SQL of a file: the text of every `…$queryRaw` tagged template (a statement) and every `Prisma.sql` tagged template
 * (a fragment), placeholders left out; `otherAccess` lists every other way to reach the database it finds.
 */
function rawSqlOf(file: string): { statements: string[]; fragments: string[]; otherAccess: string[] } {
  const sourceFile = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const statements: string[] = [];
  const fragments: string[] = [];
  const otherAccess: string[] = [];
  const textOf = (template: ts.TemplateLiteral): string =>
    ts.isNoSubstitutionTemplateLiteral(template)
      ? template.text
      : [template.head.text, ...template.templateSpans.map((span) => span.literal.text)].join(' ');

  const visit = (node: ts.Node): void => {
    if (ts.isTaggedTemplateExpression(node)) {
      const tag = node.tag.getText(sourceFile);
      if (/\.\$queryRaw$/.test(tag)) statements.push(textOf(node.template));
      else if (tag === 'Prisma.sql') fragments.push(textOf(node.template));
      else otherAccess.push(tag);
    } else if (ts.isPropertyAccessExpression(node)) {
      const name = node.name.text;
      if (/^\$(?:executeRaw|executeRawUnsafe|queryRawUnsafe|transaction|runCommandRaw)$/.test(name))
        otherAccess.push(name);
      if (/^(?:create|createMany|createManyAndReturn|update|updateMany|upsert|delete|deleteMany)$/.test(name)) {
        otherAccess.push(name);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  return { statements, fragments, otherAccess };
}

/**
 * Files that read the schema as it stands **before** a migration, which no module's Prisma model describes (a removed
 * enum value, a column not yet added), so they cannot read through each owner's model or facade. Registered by path with
 * the reason; every one runs in a read-only session (operational-commands rule 1) and holds SELECT statements only
 * (asserted above). Not a pattern for business reads.
 */
const PRE_MIGRATION_READERS = new Map<string, string>([
  [
    'installation/migration-preflight/migration-preflight.repo.ts',
    'P28-01 (Prompt 29, B-FORWARD): `pnpm ops:preflight` judges a database before 20261022120000_cost_centers_unit_only, whose COMPANY Cost Centers and missing owning department the current models cannot read',
  ],
]);

/** The relative module specifiers of a source file: `import ... from`, `export ... from`, `import '...'` and `import('...')`. */
function listRelativeSpecifiers(source: string): string[] {
  return [
    ...source.matchAll(/\b(?:import|export)\b[^;'"]*?\bfrom\s*['"]([^'"]+)['"]/g),
    ...source.matchAll(/\bimport\s*['"]([^'"]+)['"]/g),
    ...source.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g),
  ]
    .map((match) => match[1])
    .filter((specifier) => specifier.startsWith('.'));
}

/** Resolves a relative specifier of `file` to the `.ts` file it names (`x.ts` or `x/index.ts`). */
function resolveRelativeImport(file: string, specifier: string): string {
  const base = resolve(dirname(file), specifier);
  const target = [`${base}.ts`, join(base, 'index.ts')].find((candidate) => existsSync(candidate));
  if (target === undefined) {
    throw new Error(`${relative(process.cwd(), file)} imports ${specifier}, which does not resolve to a .ts file`);
  }

  return target;
}

/**
 * Module files a composition root (a file directly in src/) may import besides the public surface: the CLI entry files
 * kept at the module root (docs/rules/module-structure.md, Owner Q6). Not open to other business modules.
 */
const CLI_ENTRY_FILES: ReadonlySet<string> = new Set([
  'modules/identity-access/recovery.module.ts',
  // E7 (H5.7): the recovery implementation lives in recovery/; the command reaches exactly its two entry services,
  // its arguments, errors and result types.
  'modules/identity-access/recovery/holder-recovery.service.ts',
  'modules/identity-access/recovery/recovery.arguments.ts',
  'modules/identity-access/recovery/recovery.errors.ts',
  'modules/identity-access/recovery/recovery.types.ts',
  'modules/identity-access/recovery/role-transfer-recovery.service.ts',
  'modules/installation/hidden-prompt.ts',
  'modules/installation/installation.arguments.ts',
  // H6.1 (E8 = A): `pnpm ops:inspect` reaches its graph, its service, its arguments and its report.
  'modules/installation/inspect/inspection-report.ts',
  'modules/installation/inspect/inspection.arguments.ts',
  'modules/installation/inspect/inspection.module.ts',
  'modules/installation/inspect/inspection.service.ts',
  // H6.2 (E8 = A): `pnpm dev:seed` reaches its graph, its service, its arguments and its report.
  'modules/installation/dev-seed/dev-seed-report.ts',
  'modules/installation/dev-seed/dev-seed.arguments.ts',
  'modules/installation/dev-seed/dev-seed.module.ts',
  'modules/installation/dev-seed/dev-seed.service.ts',
  // P28-01 (Prompt 29): `pnpm ops:preflight` reaches its graph, its service, its arguments and its report.
  'modules/installation/migration-preflight/migration-preflight-report.ts',
  'modules/installation/migration-preflight/migration-preflight.arguments.ts',
  'modules/installation/migration-preflight/migration-preflight.module.ts',
  'modules/installation/migration-preflight/migration-preflight.service.ts',
  // F02 (g0-g6-final-business-baseline-remediation, Task 1.2a): `pnpm ops:assign-subscription-owner` reaches its graph,
  // its service, its arguments and its errors.
  'modules/catalog/subscription-owner-assignment/subscription-owner-assignment.arguments.ts',
  'modules/catalog/subscription-owner-assignment/subscription-owner-assignment.errors.ts',
  'modules/catalog/subscription-owner-assignment/subscription-owner-assignment.module.ts',
  'modules/catalog/subscription-owner-assignment/subscription-owner-assignment.service.ts',
  // F01 (Task 1.1a): `pnpm ops:cost-center-direction` and the organization facade reach its graph, its service and its arguments.
  'modules/organization/cost-center-direction/cost-center-direction.arguments.ts',
  'modules/organization/cost-center-direction/cost-center-direction.errors.ts',
  'modules/organization/cost-center-direction/cost-center-direction.module.ts',
  'modules/organization/cost-center-direction/cost-center-direction.service.ts',
]);

/**
 * Cross-module imports of a non-public file that existed when GATE.1 (19/10/2026, Owner decision E9 = A) replaced "any
 * root file is public" with the allowlist (A4-02 of docs/reviews/be-full-src-architecture-audit-2026-10-19). Each
 * entry names the slice of that report that removes it. Entries are only removed; a stale entry fails like a new
 * violation, and adding one needs Owner/dev review.
 */
// Empty since ROOT.1. H8.3 removed the onboarding -> employee-import.service.ts entry (A4-10); ROOT.1 removed
// email-dispatch.loop.ts -> modules/notifications/email-dispatcher.service.ts (the loop reads EmailDeliveryService).
const LEGACY_PRIVATE_MODULE_IMPORTS: ReadonlySet<string> = new Set<string>();

/**
 * ROOT-HARDEN.1: the root files that hold one public injectable contract besides the facade `<module>.service.ts`,
 * listed exactly (no suffix or wildcard rule; a new one needs Owner/dev review and a real consumer outside the module).
 */
const PUBLIC_ROOT_CONTRACT_FILES: ReadonlySet<string> = new Set([
  // The worker mail loop (email-dispatch.loop.ts) reads the delivery contract; the dispatcher stays private.
  'notifications/email-delivery.service.ts',
  // ops:inspect (installation/inspect) reads the account side of the inspection.
  'identity-access/identity-access-inspection.service.ts',
  // dev:seed (installation/dev-seed) writes the local demo accounts.
  'identity-access/local-demo-account.service.ts',
  // The worker request loop (request-work.loop.ts) runs the reassignment of the steps of requests.
  'requests/step-redetermination-sweep.service.ts',
  // The worker request loop (request-work.loop.ts) runs the projection of the audit events of requests into the inbox.
  'requests/request-status-projector.service.ts',
  'requests/step-sla-sweep.service.ts',
  // The personnel context writes the history of a person (a transfer) through this second facade of the organization (ADR-0017).
  'organization/organization-history.service.ts',
]);

/**
 * BEH.1: the root files that hold one pure business policy another module shares, listed exactly (no `*.policy.ts`
 * rule). src/policy-ownership.spec.ts owns the consumers and the purity of each, and checks this list against its own.
 */
const PUBLIC_ROOT_POLICY_FILES: ReadonlySet<string> = new Set([
  // Manual entry and the import preview (data-import) share whether a department and a job title can take a person in.
  'organization/employee-placement.policy.ts',
]);

/**
 * The public surface of a business module, as path segments below src/modules: only these files directly in the
 * module root — the Nest modules, the facade service, public types and public errors. Anything else in the root, a
 * repo, the credential hasher and every subfolder file is private. Kept in step with `isModuleRootPublicSurface` of
 * architecture-structure.spec.ts.
 */
function isModulePublicSurface(parts: string[]): boolean {
  if (parts.length !== 2) return false;
  const [moduleName, fileName] = parts;
  if (PUBLIC_ROOT_CONTRACT_FILES.has(parts.join('/')) || PUBLIC_ROOT_POLICY_FILES.has(parts.join('/'))) return true;

  return (
    fileName === `${moduleName}.module.ts` ||
    fileName.endsWith('-http.module.ts') ||
    fileName.endsWith('-facade.module.ts') ||
    fileName === `${moduleName}.service.ts` ||
    fileName.endsWith('.types.ts') ||
    fileName.endsWith('.errors.ts')
  );
}

/**
 * Resolved from the real import graph, not from folder names: code outside a business module (another
 * module or a composition root in src/) may import only the module's public surface (allowlist above);
 * a composition root may also import the listed CLI entry files. Returns the private target, or nothing.
 */
function privateModuleImport(sourceRoot: string, importer: string, target: string): string[] {
  const modulesRoot = join(sourceRoot, 'modules');
  const parts = relative(modulesRoot, target).split(sep);
  if (parts[0] === '..') return [];
  const importerParts = relative(modulesRoot, importer).split(sep);
  if (importerParts[0] !== '..' && importerParts[0] === parts[0]) return [];

  const targetPath = relative(sourceRoot, target).split(sep).join('/');
  const isCompositionRoot = relative(sourceRoot, importer).split(sep).length === 1;
  const isPublic = isModulePublicSurface(parts) || (isCompositionRoot && CLI_ENTRY_FILES.has(targetPath));

  return isPublic ? [] : [targetPath];
}

/** `importer -> target` for every private cross-module import made by `files`, paths relative to src/. */
function privateModuleImportFindings(sourceRoot: string, files: string[]): string[] {
  return files.flatMap((file) =>
    listResolvedRelativeImports(file).flatMap((target) =>
      privateModuleImport(sourceRoot, file, target).map(
        (privateTarget) => `${relative(sourceRoot, file).split(sep).join('/')} -> ${privateTarget}`,
      ),
    ),
  );
}

/** New findings and stale ledger entries, so a failure names exactly what to fix. */
function againstLedger(findings: string[], ledger: Iterable<string>) {
  const found = new Set(findings);
  const legacy = new Set(ledger);

  return {
    newViolations: [...found].filter((finding) => !legacy.has(finding)).sort(),
    staleLedgerEntries: [...legacy].filter((entry) => !found.has(entry)).sort(),
  };
}

function listResolvedRelativeImports(file: string): string[] {
  return listRelativeSpecifiers(readFileSync(file, 'utf8')).map((specifier) => resolveRelativeImport(file, specifier));
}

/** Follows relative `import ... from`, `export ... from` and `import('...')` specifiers from an entry file. */
function listReachableSourceFiles(entry: string): Map<string, string> {
  const reachable = new Map<string, string>();
  const pending = [entry];

  while (pending.length > 0) {
    const file = pending.pop() as string;
    if (reachable.has(file)) continue;

    const source = readFileSync(file, 'utf8');
    reachable.set(file, source);
    // Generated code has its own import style and no Nest wiring; it is a leaf here.
    if (file.includes(`${sep}generated${sep}`)) continue;

    for (const specifier of listRelativeSpecifiers(source)) pending.push(resolveRelativeImport(file, specifier));
  }

  return reachable;
}

describe('installation command dependency boundary (R-13)', () => {
  const sourceRoot = join(process.cwd(), 'src');
  const toRelative = (files: Iterable<string>) =>
    [...files].map((file) => relative(sourceRoot, file).split(sep).join('/'));

  it('does not reach the API/worker configuration, the identity-access module, notifications or the JWT library', () => {
    // installation.module is loaded by a dynamic import in the command, after --help and argument parsing.
    const reachable = listReachableSourceFiles(join(sourceRoot, 'installation-cli.ts'));
    const files = toRelative(reachable.keys());

    expect(files).toContain('modules/installation/installation.module.ts');
    expect(files).toContain('infrastructure/config/installation-configuration.module.ts');
    expect(files).toContain('modules/identity-access/identity-access-facade.module.ts');
    expect(files).not.toContain('infrastructure/config/configuration.module.ts');
    expect(files).not.toContain('modules/identity-access/identity-access.module.ts');
    expect(files.filter((file) => file.startsWith('modules/notifications/'))).toEqual([]);
    expect(files.filter((file) => /@nestjs\/jwt/.test(reachable.get(join(sourceRoot, file)) ?? ''))).toEqual([]);
  });

  it('wires the full validator to the API options and the database-only validator to the command options', () => {
    expect(environmentConfigOptions.validate).toBe(validateEnvironment);
    expect(installationEnvironmentConfigOptions.validate).toBe(validateInstallationEnvironment);
  });

  it('keeps the command-only configuration module out of everything the API and the worker load', () => {
    for (const entry of ['main.ts', 'worker.ts']) {
      const files = toRelative(listReachableSourceFiles(join(sourceRoot, entry)).keys());

      expect({ entry, files: files.filter((file) => file.includes('installation-configuration.module')) }).toEqual({
        entry,
        files: [],
      });
      expect(files).toContain('infrastructure/config/configuration.module.ts');
    }
  });

  it('keeps the full environment validation on the API and the worker', () => {
    for (const entry of ['app.module.ts', 'worker.module.ts']) {
      const source = readFileSync(join(sourceRoot, entry), 'utf8');

      expect({
        entry,
        importsConfigurationModule: /\bConfigurationModule\b/.test(
          source.replace(/InstallationConfigurationModule/g, ''),
        ),
      }).toEqual({
        entry,
        importsConfigurationModule: true,
      });
      expect({ entry, importsInstallationConfiguration: source.includes('InstallationConfigurationModule') }).toEqual({
        entry,
        importsInstallationConfiguration: false,
      });
    }
  });
});

/**
 * ROOT-HARDEN.1: one public injectable contract per file. Every non-spec source file under src/modules exports at most
 * one `@Injectable` class (private helper classes, interfaces and functions stay allowed). Read with the TypeScript
 * parser: a comment or a string naming a decorator does not count.
 */
function exportedInjectables(file: string, source: string): string[] {
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  return parsed.statements.filter(ts.isClassDeclaration).flatMap((declaration) => {
    const exported = ts.getModifiers(declaration)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
    const injectable = (ts.getDecorators(declaration) ?? []).some((decorator) => {
      const expression = ts.isCallExpression(decorator.expression)
        ? decorator.expression.expression
        : decorator.expression;
      return ts.isIdentifier(expression) && expression.text === 'Injectable';
    });
    return exported && injectable && declaration.name ? [declaration.name.text] : [];
  });
}

/** `export ... from '...'` declarations (re-exports, barrels) of a source file, by module specifier. */
function reExports(file: string, source: string): string[] {
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  return parsed.statements
    .filter(ts.isExportDeclaration)
    .flatMap((declaration) =>
      declaration.moduleSpecifier && ts.isStringLiteral(declaration.moduleSpecifier)
        ? [declaration.moduleSpecifier.text]
        : [],
    );
}

describe('ROOT-HARDEN.1: public injectable contracts', () => {
  const sourceRoot = join(process.cwd(), 'src');
  const modulesRoot = join(sourceRoot, 'modules');
  const toModulePath = (file: string) => relative(modulesRoot, file).split(sep).join('/');

  it('exports at most one @Injectable class from each source file of a business module', () => {
    const findings = listTypeScriptFiles(modulesRoot)
      .map((file) => ({ file: toModulePath(file), injectables: exportedInjectables(file, readFileSync(file, 'utf8')) }))
      .filter((finding) => finding.injectables.length > 1);

    expect(findings).toEqual([]);
  });

  it('lists only public root contract files that exist, hold one injectable and have a consumer outside their module', () => {
    // Generated code imports nothing of ours and uses specifiers this resolver does not follow.
    const importers = listTypeScriptFiles(sourceRoot).filter((file) => !file.includes(`${sep}generated${sep}`));
    const findings = [...PUBLIC_ROOT_CONTRACT_FILES].flatMap((entry) => {
      const file = join(modulesRoot, ...entry.split('/'));
      if (!existsSync(file)) return [`${entry}: missing`];
      const problems: string[] = [];
      if (exportedInjectables(file, readFileSync(file, 'utf8')).length !== 1)
        problems.push(`${entry}: not one injectable`);
      const owner = entry.split('/')[0];
      const consumers = importers.filter((importer) => {
        const path = relative(sourceRoot, importer).split(sep);
        if (path[0] === 'modules' && path[1] === owner) return false;
        return listRelativeSpecifiers(readFileSync(importer, 'utf8')).some(
          (specifier) => resolveRelativeImport(importer, specifier) === file,
        );
      });
      if (consumers.length === 0) problems.push(`${entry}: no consumer outside the module`);
      return problems;
    });

    expect(findings).toEqual([]);
  });

  it('keeps the root public surface of architecture-structure.spec.ts in step with this exact registry', () => {
    const structure = readFileSync(join(sourceRoot, 'architecture-structure.spec.ts'), 'utf8');
    const block = /const PUBLIC_ROOT_CONTRACT_FILES[^=]*=\s*new Set\(\[([\s\S]*?)\]\)/.exec(structure)?.[1] ?? '';
    const listed = [...block.matchAll(/'([^']+)'/g)].map((match) => match[1]).sort();

    expect(listed).toEqual([...PUBLIC_ROOT_CONTRACT_FILES].sort());
  });

  it('re-exports nothing from a business module file: no barrel can hand a private class to another module', () => {
    const findings = listTypeScriptFiles(modulesRoot)
      .map((file) => ({ file: toModulePath(file), reExports: reExports(file, readFileSync(file, 'utf8')) }))
      .filter((finding) => finding.reExports.length > 0);

    expect(findings).toEqual([]);
  });

  it('opens exactly the registered root contract files, not every root *.service.ts', () => {
    const otherModule = join(modulesRoot, 'organization', 'organization.service.ts');

    expect(
      privateModuleImport(sourceRoot, otherModule, join(modulesRoot, 'notifications', 'email-delivery.service.ts')),
    ).toEqual([]);
    for (const privateService of [
      join(modulesRoot, 'notifications', 'email-dispatcher.service.ts'),
      join(modulesRoot, 'identity-access', 'session-helper.service.ts'),
    ]) {
      expect(privateModuleImport(sourceRoot, otherModule, privateService)).toHaveLength(1);
    }
  });

  describe('the check itself', () => {
    it('counts exported @Injectable classes only, not private helpers, plain classes, comments or strings', () => {
      const source = [
        "import { Injectable } from '@nestjs/common';",
        '// @Injectable() export class InComment {}',
        "const text = '@Injectable() export class InString {}';",
        '@Injectable()',
        'export class PublicService {}',
        '@Injectable()',
        'class PrivateHelper {}',
        'export class PlainValue {}',
        'export interface Shape { value: number }',
      ].join('\n');

      expect(exportedInjectables('a.ts', source)).toEqual(['PublicService']);
      expect(
        reExports('c.ts', "export { A } from './a';\nexport * from './b';\nexport { local };\nconst local = 1;"),
      ).toEqual(['./a', './b']);
      expect(exportedInjectables('b.ts', `${source}\n@Injectable()\nexport class SecondService {}`)).toEqual([
        'PublicService',
        'SecondService',
      ]);
    });
  });
});
