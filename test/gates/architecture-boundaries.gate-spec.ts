import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import * as ts from 'typescript';
import {
  environmentConfigOptions,
  installationEnvironmentConfigOptions,
} from '../../src/infrastructure/config/env-config';
import { validateEnvironment, validateInstallationEnvironment } from '../../src/infrastructure/config/env-schema';

/*
 * Boundaries an import graph cannot show: who owns each Prisma table and its raw SQL, where PrismaService may be used,
 * the pre-migration readers, the dependency boundary of the installation command (R-13) and one public injectable per
 * file. Which file may import which is enforced by dependency-cruiser (`.dependency-cruiser.cjs`, `pnpm arch:check`);
 * where a file sits and what it is called, by module-layout.gate-spec.ts.
 */

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
  AiInvocation: 'ai-assist',
  ManagedDevice: 'devices',
  DeviceRegistration: 'devices',
  DeviceSignatureRecord: 'devices',
  MonitoringNoticeVersion: 'devices',
  DeviceAcknowledgement: 'devices',
  DeviceStopRequest: 'devices',
  DeviceEnrollmentCode: 'devices',
  DeviceEnrollmentUse: 'devices',
  DeviceCredential: 'devices',
  DeviceReturnTask: 'devices',
  DeviceCodeCounter: 'devices',
  CollectorAllowlistVersion: 'usage',
  CollectorAllowlistEntry: 'usage',
  AiUsageDay: 'usage',
  ToolStatusSnapshot: 'usage',
  ToolStatusWindow: 'usage',
  IntakeRejection: 'usage',
  GhostSeatRuleRun: 'optimization',
  GhostSeatRuleSkip: 'optimization',
  GhostSeatRecommendation: 'optimization',
  GhostSeatApplicationThreshold: 'optimization',
  GhostSeatDecision: 'optimization',
  GhostSeatExemption: 'optimization',
  GhostSeatReturn: 'optimization',
  GhostSeatSeatState: 'optimization',
  GhostSeatEscalation: 'optimization',
  PurchaseInvoice: 'requests',
  PurchaseInvoiceDocument: 'requests',
  InvoiceDiscrepancyCase: 'requests',
  VendorAccountDiscrepancy: 'usage',
  OutOfProcessCase: 'usage',
  UsageActivityDay: 'usage',
  UsageIdentityMapping: 'usage',
  UsageImport: 'usage',
  UsageImportRow: 'usage',
  UsageNoAssignmentFinding: 'usage',
  UsageSource: 'usage',
  UsageUnmatchedIdentity: 'usage',
  AiInvocationContent: 'ai-assist',
  AvatarPurge: 'identity-access',
  Policy: 'policies',
  PolicyVersion: 'policies',
  PolicyAcknowledgement: 'policies',
  DecisionChecklist: 'policies',
  AuditEvent: 'audit',
  Application: 'catalog',
  ApplicationBusinessOwner: 'catalog',
  Subscription: 'catalog',
  Plan: 'catalog',
  PlanTerms: 'catalog',
  PlanUsageRate: 'catalog',
  AssignmentRenewalWindow: 'licensing',
  PlanTermOpinion: 'catalog',
  PlanWorkspaceProfile: 'catalog',
  PlanWorkspaceAdmin: 'catalog',
  Workspace: 'catalog',
  WorkspaceAdmin: 'catalog',
  SubscriptionLine: 'catalog',
  SeatPurchase: 'catalog',
  SeatChange: 'catalog',
  SubscriptionLineTarget: 'licensing',
  LicenseLot: 'catalog',
  LicenseLotCharge: 'budgets',
  InvoiceAllocation: 'budgets',
  InvoiceYearApplication: 'budgets',
  FunctionalGroup: 'catalog',
  Vendor: 'catalog',
  VendorGroup: 'catalog',
  VendorServiceLine: 'catalog',
  VendorDictionaryProposal: 'catalog',
  VendorTaxProfile: 'finance',
  VendorTaxProfileVersion: 'finance',
  VendorTaxProfileLine: 'finance',
  LicenseAssignment: 'licensing',
  ProvisioningTask: 'licensing',
  PoolGrantAvoidedCost: 'licensing',
  ProvisioningTaskReason: 'licensing',
  HandoverDuty: 'licensing',
  ServiceAccountDutyNotice: 'licensing',
  AssignmentExpiryReminder: 'licensing',
  SubscriptionRenewal: 'licensing',
  SubscriptionRenewalReleasedSeat: 'licensing',
  SubscriptionDeadlineEvent: 'licensing',
  DepartmentSoftwareEntry: 'licensing',
  DepartmentSoftwareProposal: 'licensing',
  SaasIssue: 'licensing',
  SaasIssueEntry: 'licensing',
  SaasIssueCounter: 'licensing',
  LicenseKey: 'licensing',
  LicenseKeyRevealWindow: 'licensing',
  DeviceActivation: 'licensing',
  AccessRequest: 'requests',
  RequestTicket: 'requests',
  AccessRequestReply: 'requests',
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
  YearStartCommitmentRun: 'requests',
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
  BudgetVersionHistoryEntry: 'budgets',
  BudgetVersionDecision: 'budgets',
  BudgetCommitment: 'budgets',
  BudgetCommitmentMonth: 'budgets',
  InvoicePoolVarianceResolution: 'budgets',
  BudgetCycle: 'budgets',
  BudgetDepartmentCeiling: 'budgets',
  BudgetCommitmentRelease: 'budgets',
  Invoice: 'budgets',
  SeatMonthCharge: 'budgets',
  SeatMonthRun: 'budgets',
  BudgetCommitmentSeatMonthReversal: 'budgets',
  BudgetReviewPeriod: 'budgets',
  BudgetReviewLine: 'budgets',
  BudgetAdjustment: 'budgets',
  BudgetThresholdAlert: 'budgets',
  BudgetAttachment: 'budgets',
  RequestBudgetCheck: 'requests',
  RequestBudgetCheckYear: 'requests',
  RequestFinanceReview: 'requests',
  RequestReserveConfirmation: 'requests',
  SpendBatch: 'requests',
  SpendBatchItem: 'requests',
  RequestSupplement: 'requests',
  RequestSupplementDrop: 'requests',
  SpendDecision: 'requests',
  BudgetInformationRequest: 'requests',
  ApplicationRetirementConfirmation: 'catalog',
  Contract: 'catalog',
  ContractSubscription: 'catalog',
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
  DepartmentItSubstitute: 'organization',
  UnplacedWorkItDesignation: 'organization',
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
  ItAdminHandover: 'personnel',
  PersonnelNotice: 'personnel',
  PersonnelNoticeVerification: 'personnel',
  PersonnelNoticeCounter: 'personnel',
  SuperAdminEventTicket: 'personnel',
  AppUser: 'identity-access',
  RecoveryTicket: 'identity-access',
  PasswordCredential: 'identity-access',
  RoleGrant: 'identity-access',
  AuthSession: 'identity-access',
  RefreshToken: 'identity-access',
  LoginThrottle: 'identity-access',
  AccountActionToken: 'identity-access',
  EmployeeAccessBlock: 'identity-access',
  EmailOutbox: 'notifications',
  InAppNotification: 'notifications',
  HeldDepartmentNotification: 'notifications',
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

/**
 * Reads relation fields (`field TargetModel ...`) for every Prisma model owned by a module.
 */
function listPrismaRelations(): Map<string, Map<string, string>> {
  const modelsRoot = join(process.cwd(), 'prisma', 'models');
  const ownedModels = new Set(Object.keys(PRISMA_MODEL_OWNER));
  const relations = new Map<string, Map<string, string>>();

  for (const entry of readdirSync(modelsRoot)) {
    const content = readFileSync(join(modelsRoot, entry), 'utf8');
    for (const match of content.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
      const model = match[1];
      const fields = new Map<string, string>();
      for (const line of match[2].split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('@@')) continue;
        const fieldMatch = /^([a-zA-Z_][a-zA-Z0-9_]*)\s+([A-Z][A-Za-z0-9_]*)(?:\[\]|\?)?\b/.exec(trimmed);
        if (!fieldMatch) continue;
        if (ownedModels.has(fieldMatch[2])) {
          fields.set(fieldMatch[1], fieldMatch[2]);
        }
      }
      relations.set(model, fields);
    }
  }

  return relations;
}

const LEGACY_CROSS_MODULE_RELATION_SELECTS = new Set([
  'identity-access/accounts/app-user.repo.ts:AppUser.employee',
  'identity-access/accounts/super-admin-holder.repo.ts:AppUser.employee',
  'identity-access/auth/session.repo.ts:AppUser.employee',
  'licensing/assignment/rule-seats.repo.ts:LicenseAssignment.plan',
  'licensing/assignment/usage-facts.repo.ts:LicenseAssignment.plan',
  'licensing/device-activation/device-activation.repo.ts:LicenseKey.subscription',
  'licensing/device-activation/device-activation.repo.ts:LicenseKey.licenseLot',
  'licensing/shared-pool/shared-pool-avoided-cost.repo.ts:LicenseAssignment.plan',
]);

interface CrossModuleRelationAccess {
  key: string;
  file: string;
  model: string;
  field: string;
  targetModel: string;
  targetOwner: string;
  owner: string;
}

function findCrossModuleRelationSelects(
  modulesRoot: string,
  relations: Map<string, Map<string, string>>,
): CrossModuleRelationAccess[] {
  const delegateToModel = new Map(Object.keys(PRISMA_MODEL_OWNER).map((model) => [prismaDelegateName(model), model]));
  const findings: CrossModuleRelationAccess[] = [];

  const unwrapObject = (expr: ts.Expression | undefined): ts.ObjectLiteralExpression | null => {
    if (!expr) return null;
    if (ts.isObjectLiteralExpression(expr)) return expr;
    if (ts.isParenthesizedExpression(expr) || ts.isAsExpression(expr) || ts.isSatisfiesExpression(expr)) {
      return unwrapObject(expr.expression);
    }
    return null;
  };

  const propNameText = (name: ts.PropertyName): string | null => {
    if (ts.isIdentifier(name) || ts.isStringLiteral(name)) return name.text;
    return null;
  };

  for (const file of listTypeScriptFiles(modulesRoot)) {
    const source = readFileSync(file, 'utf8');
    if (!file.endsWith('.repo.ts') && !source.includes('Prisma.')) continue;

    const owner = relative(modulesRoot, file).split(sep)[0];
    const relPath = relative(modulesRoot, file).split(sep).join('/');
    const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    const seen = new Set<string>();

    const walkSelectOrInclude = (obj: ts.ObjectLiteralExpression, model: string): void => {
      const modelRels = relations.get(model);
      if (!modelRels) return;
      for (const prop of obj.properties) {
        if (!ts.isPropertyAssignment(prop)) continue;
        const field = propNameText(prop.name);
        if (!field) continue;
        const targetModel = modelRels.get(field);
        if (!targetModel) continue;

        const targetOwner = PRISMA_MODEL_OWNER[targetModel];
        if (targetOwner !== undefined && targetOwner !== owner) {
          const line = sf.getLineAndCharacterOfPosition(prop.getStart(sf)).line + 1;
          const dedupeKey = `${relPath}:${line}:${model}.${field}`;
          if (!seen.has(dedupeKey)) {
            seen.add(dedupeKey);
            findings.push({
              key: `${relPath}:${model}.${field}`,
              file: relPath,
              model,
              field,
              targetModel,
              targetOwner,
              owner,
            });
          }
          continue;
        }

        const nested = unwrapObject(prop.initializer);
        if (nested) walkOptionsObject(nested, targetModel);
      }
    };

    const walkOptionsObject = (obj: ts.ObjectLiteralExpression, model: string): void => {
      for (const prop of obj.properties) {
        if (!ts.isPropertyAssignment(prop)) continue;
        const key = propNameText(prop.name);
        if (key !== 'select' && key !== 'include') continue;
        const inner = unwrapObject(prop.initializer);
        if (inner) walkSelectOrInclude(inner, model);
      }
    };

    const prismaSelectModelOfType = (typeNode: ts.TypeNode | undefined): string | null => {
      if (!typeNode || !ts.isTypeReferenceNode(typeNode)) return null;
      const text = typeNode.typeName.getText(sf);
      const match = /^Prisma\.([A-Z][A-Za-z0-9_]*)(?:Select|Include)$/.exec(text);
      return match && PRISMA_MODEL_OWNER[match[1]] ? match[1] : null;
    };

    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
        const receiver = node.expression.expression;
        if (ts.isPropertyAccessExpression(receiver)) {
          const model = delegateToModel.get(receiver.name.text);
          if (model) {
            const arg0 = unwrapObject(node.arguments[0]);
            if (arg0) walkOptionsObject(arg0, model);
          }
        }
      } else if (ts.isSatisfiesExpression(node) || ts.isAsExpression(node)) {
        const model = prismaSelectModelOfType(node.type);
        const obj = unwrapObject(node.expression);
        if (model && obj) walkSelectOrInclude(obj, model);
      } else if (ts.isVariableDeclaration(node) && node.type && node.initializer) {
        const model = prismaSelectModelOfType(node.type);
        const obj = unwrapObject(node.initializer);
        if (model && obj) walkSelectOrInclude(obj, model);
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }

  return findings;
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

  it('forbids Prisma relation selects/includes targeting models owned by another module', () => {
    const modulesRoot = join(sourceRoot, 'modules');
    const relations = listPrismaRelations();
    const findings = findCrossModuleRelationSelects(modulesRoot, relations);

    const violations = findings.filter((item) => !LEGACY_CROSS_MODULE_RELATION_SELECTS.has(item.key));
    expect(violations).toEqual([]);

    const activeKeys = new Set(findings.map((item) => item.key));
    const staleLegacy = [...LEGACY_CROSS_MODULE_RELATION_SELECTS].filter((key) => !activeKeys.has(key));
    expect(staleLegacy).toEqual([]);
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

  it('reads the table of the old approval roles in no file of src but the preflight repository (qd93-remove-fallback-substitute-approvers)', () => {
    // The configuration of the substitute and of the fallback approver is gone (`QĐ-93c`): no use case, facade or command reads or writes
    // the table any more; the image of Phase A stays a valid way back for a database after Phase B only because of this. Neither the
    // delegate nor the name of the table appears in a file of src, generated code left out, but the one that reads the schema before a migration.
    const allowed = new Set(['modules/installation/migration-preflight/migration-preflight.repo.ts']);
    const readers = listTypeScriptFiles(sourceRoot)
      .filter((file) => !file.includes(`${sep}generated${sep}`))
      .filter((file) => /approval_role_holders|approvalRoleHolder/.test(readFileSync(file, 'utf8')))
      .map((file) => relative(sourceRoot, file).split(sep).join('/'))
      .filter((file) => !allowed.has(file));

    expect(readers).toEqual([]);
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
      // The composition roots that reach the reader: the API (main.ts, app/), the worker (worker.ts, worker/) and the
      // command folders cli/<command>/. The shared command runner (cli.ts, files directly in cli/) dispatches to one.
      const roots = [...reached].map((file) => relative(sourceRoot, file).split(sep).join('/'));
      const apiOrWorker = roots.filter((file) => /^(?:main\.ts|worker\.ts|app\/|worker\/)/.test(file)).sort();
      const commands = [...new Set(roots.flatMap((file) => /^cli\/([^/]+)\//.exec(file)?.[1] ?? []))].sort();

      expect({ path, apiOrWorker, commands }).toEqual({ path, apiOrWorker: [], commands: ['preflight'] });
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

/** The `.ts` files `file` imports by a relative specifier. */
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

// R-13
describe('installation command dependency boundary', () => {
  const sourceRoot = join(process.cwd(), 'src');
  const toRelative = (files: Iterable<string>) =>
    [...files].map((file) => relative(sourceRoot, file).split(sep).join('/'));

  it('does not reach the API/worker configuration, the identity-access module, notifications or the JWT library', () => {
    // installation.module is loaded by a dynamic import in the command, after --help and argument parsing.
    const reachable = listReachableSourceFiles(join(sourceRoot, 'cli', 'bootstrap', 'bootstrap.command.ts'));
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
    for (const entry of ['app/app.module.ts', 'worker/worker.module.ts']) {
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

// ROOT-HARDEN.1
describe('public injectable contracts', () => {
  const sourceRoot = join(process.cwd(), 'src');
  const modulesRoot = join(sourceRoot, 'modules');
  const toModulePath = (file: string) => relative(modulesRoot, file).split(sep).join('/');

  // `public/<module>.extension-points.ts` is the exception (ADR-0019): it declares every Hook/Listeners/Contributions
  // provider the module opens, each a one-line class, so a reader finds all the points of a module in one file.
  it('exports at most one @Injectable class from each source file of a business module', () => {
    const findings = listTypeScriptFiles(modulesRoot)
      .filter((file) => !file.endsWith('.extension-points.ts'))
      .map((file) => ({ file: toModulePath(file), injectables: exportedInjectables(file, readFileSync(file, 'utf8')) }))
      .filter((finding) => finding.injectables.length > 1);

    expect(findings).toEqual([]);
  });

  it('re-exports nothing from a business module file: no barrel can hand a private class to another module', () => {
    const findings = listTypeScriptFiles(modulesRoot)
      .map((file) => ({ file: toModulePath(file), reExports: reExports(file, readFileSync(file, 'utf8')) }))
      .filter((finding) => finding.reExports.length > 0);

    expect(findings).toEqual([]);
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
