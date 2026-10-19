import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { DatabaseEnvironmentVariables } from '../../../infrastructure/config/env-schema';
import { DbTx, TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import { isUniqueViolation } from '../../../infrastructure/database/unique-violation';
import { AuditService } from '../../audit/audit.service';
import { IdentityAccessService, LocalDemoAccountService } from '../../identity-access/identity-access.service';
import { OrganizationService } from '../../organization/organization.service';
import { DEMO_FIXTURE_KEYS, DEMO_PEOPLE_LOOKUP, buildSeedPlan, samePlan } from './dev-seed-plan';
import { SeedStateChangedError } from './dev-seed.errors';
import { DEMO_COST_CENTER, DEMO_DEPARTMENT, DEMO_HIRE_DATE, DEMO_JOB_TITLE, DEMO_PEOPLE } from './dev-seed.fixture';
import { DevSeedRepo } from './dev-seed.repo';
import { DevSeedResult, SeedPlan, SeedReportItem } from './dev-seed.types';
import { checkLocalSeedGuards } from './local-seed.guard';
import { PasswordGenerator } from './local-password';

export const LOCAL_PASSWORD_GENERATOR = Symbol('LOCAL_PASSWORD_GENERATOR');

/** Marks every Audit Trail event of a seed run (`actorKind: OPERATOR`). */
export const LOCAL_SEED_OPERATOR_REFERENCE = 'LOCAL_SEED';

type Credentials = Map<string, { password: string; hash: string; hashPolicyVersion: number }>;

/**
 * `pnpm dev:seed` (H6.2): the local demo data, through the owning services and the Audit Trail. The three local guards
 * are checked first; then a plan is read, the new passwords are hashed outside any transaction, and one transaction
 * takes the seed lock, reads the plan again and writes. All or nothing; a rerun writes nothing.
 */
@Injectable()
export class DevSeedService {
  constructor(
    private readonly config: ConfigService<DatabaseEnvironmentVariables, true>,
    private readonly runner: TransactionRunner,
    private readonly repo: DevSeedRepo,
    private readonly organization: OrganizationService,
    private readonly identity: IdentityAccessService,
    private readonly accounts: LocalDemoAccountService,
    private readonly audit: AuditService,
    @Inject(LOCAL_PASSWORD_GENERATOR) private readonly generatePassword: PasswordGenerator,
  ) {}

  async seed(options: { confirmLocal: boolean }): Promise<DevSeedResult> {
    const refusal = checkLocalSeedGuards({
      nodeEnv: this.config.get('NODE_ENV', { infer: true }),
      databaseUrl: this.config.get('DATABASE_URL', { infer: true }),
      confirmLocal: options.confirmLocal,
    });
    if (refusal !== null) return { outcome: 'REFUSED', refusal, items: [] };

    const first = await this.runner.run((tx) => this.plan(tx));
    if (first === null) return { outcome: 'REFUSED', refusal: 'NOT_INSTALLED', items: [] };
    if (first.items.some((item) => item.action === 'conflict'))
      return { outcome: 'REFUSED', refusal: 'CONFLICT', items: report(first, new Map()) };
    if (first.items.every((item) => item.action === 'present'))
      return { outcome: 'ALREADY_PRESENT', items: report(first, new Map()) };

    const credentials = await this.prepareCredentials(first);
    try {
      await this.runner.run(async (tx) => {
        await this.repo.lockDevSeed(tx);
        const again = await this.plan(tx);
        if (again === null || !samePlan(first, again)) throw new SeedStateChangedError();
        await this.write(tx, again, credentials);
      });
    } catch (error) {
      if (error instanceof SeedStateChangedError) return { outcome: 'REFUSED', refusal: 'STATE_CHANGED', items: [] };
      // A code the plan could not see (a cost center named like the demo one): everything was rolled back.
      if (isUniqueViolation(error, 'code', 'name'))
        return { outcome: 'REFUSED', refusal: 'UNIQUE_KEY_TAKEN', items: [] };
      throw error;
    }

    return { outcome: 'CREATED', items: report(first, credentials) };
  }

  /** Null when there is no installation. */
  private async plan(tx: DbTx): Promise<SeedPlan | null> {
    const organization = await this.organization.getOrganization(tx);
    if (organization === null) return null;

    const fixture = await this.organization.readLocalSeedFixture(tx, {
      organizationId: organization.id,
      ...DEMO_FIXTURE_KEYS,
    });
    const lookup = await this.organization.lookupForEmployeeImport(DEMO_PEOPLE_LOOKUP, tx);
    const accounts = new Map();
    for (const person of DEMO_PEOPLE) {
      const employee = lookup.employees.find((candidate) => candidate.employeeCode === person.employeeCode);
      accounts.set(
        person.employeeCode,
        await this.accounts.describeDemoAccount(tx, {
          organizationId: organization.id,
          employeeId: employee?.id ?? null,
          loginEmail: person.workEmail,
          role: person.role,
        }),
      );
    }

    return buildSeedPlan(organization.id, fixture, lookup, accounts);
  }

  /** A new password for each account to create, hashed before any lock (lock protocol rule 3). */
  private async prepareCredentials(plan: SeedPlan): Promise<Credentials> {
    const credentials: Credentials = new Map();
    for (const person of DEMO_PEOPLE) {
      const account = plan.items.find((item) => item.kind === 'ACCOUNT' && item.key === person.employeeCode);
      if (account?.action !== 'create') continue;
      const password = this.generatePassword();
      const { hash, hashPolicyVersion } = await this.identity.prepareCredential(password, person.workEmail);
      credentials.set(person.employeeCode, { password, hash, hashPolicyVersion });
    }
    return credentials;
  }

  private async write(tx: DbTx, plan: SeedPlan, credentials: Credentials): Promise<void> {
    const organizationId = plan.organizationId;
    const correlationId = randomUUID();
    const creates = (kind: string, key: string) =>
      plan.items.some((item) => item.kind === kind && item.key === key && item.action === 'create');
    const record = (action: string, resourceType: string, resourceId: string, after: Record<string, string>) =>
      this.audit.record(tx, {
        organizationId,
        actorKind: 'OPERATOR',
        operatorReference: LOCAL_SEED_OPERATOR_REFERENCE,
        correlationId,
        action,
        resourceType,
        resourceId,
        after,
      });

    let costCenterId = plan.costCenterId;
    if (creates('COST_CENTER', DEMO_COST_CENTER.code)) {
      costCenterId = (await this.organization.createUnitCostCenter(tx, { organizationId, ...DEMO_COST_CENTER })).id;
      await record('DEV_SEED.COST_CENTER_CREATED', 'CostCenter', costCenterId, {
        code: DEMO_COST_CENTER.code,
        kind: 'UNIT',
      });
    }

    let departmentId = plan.departmentId;
    if (creates('DEPARTMENT', DEMO_DEPARTMENT.code)) {
      // On the Cost Center just created, or on the exact DEMO-CC that exists without its department (P23-RV-01).
      const department = await this.organization.createDepartment(tx, {
        organizationId,
        ...DEMO_DEPARTMENT,
        costCenterId: costCenterId as string,
      });
      departmentId = department.id;
      await record('DEV_SEED.DEPARTMENT_CREATED', 'Department', department.id, {
        code: DEMO_DEPARTMENT.code,
        costCenterCode: DEMO_COST_CENTER.code,
      });
    }

    let jobTitleId = plan.jobTitleId;
    if (creates('JOB_TITLE', DEMO_JOB_TITLE)) {
      jobTitleId = (await this.organization.createJobTitle(tx, organizationId, DEMO_JOB_TITLE)).id;
      await record('DEV_SEED.JOB_TITLE_CREATED', 'JobTitle', jobTitleId, { name: DEMO_JOB_TITLE });
    }

    for (const person of DEMO_PEOPLE) {
      let employeeId = plan.employeeIds.get(person.employeeCode) ?? null;
      if (creates('EMPLOYEE', person.employeeCode)) {
        employeeId = (
          await this.organization.createEmployeeWithPlacement(tx, {
            organizationId,
            employeeCode: person.employeeCode,
            fullName: person.fullName,
            workEmail: person.workEmail,
            employmentType: 'STAFF',
            hireDate: DEMO_HIRE_DATE,
            departmentId: departmentId as string,
            jobTitleId: jobTitleId as string,
          })
        ).id;
        await record('DEV_SEED.EMPLOYEE_CREATED', 'Employee', employeeId, {
          employeeCode: person.employeeCode,
          employmentType: 'STAFF',
          hireDate: DEMO_HIRE_DATE,
          departmentCode: DEMO_DEPARTMENT.code,
        });
      }

      const credential = credentials.get(person.employeeCode);
      if (!creates('ACCOUNT', person.employeeCode) || credential === undefined) continue;
      const { appUserId } = await this.accounts.createDemoAccount(tx, {
        organizationId,
        employeeId: employeeId as string,
        loginEmail: person.workEmail,
        role: person.role,
        passwordHash: credential.hash,
        hashPolicyVersion: credential.hashPolicyVersion,
      });
      await record('DEV_SEED.ACCOUNT_CREATED', 'AppUser', appUserId, {
        employeeCode: person.employeeCode,
        activationState: 'ACTIVATED',
        emailVerificationSource: 'BOOTSTRAP_ASSERTED',
      });
      await record('ROLE.GRANTED', 'AppUser', appUserId, { role: person.role });
    }
  }
}

/** The report lines of a plan; an account this run created carries its one-time password. */
function report(plan: SeedPlan, credentials: Credentials): SeedReportItem[] {
  return plan.items.map((item) => {
    const person = DEMO_PEOPLE.find((candidate) => candidate.employeeCode === item.key);
    const base: SeedReportItem = {
      kind: item.kind,
      key: item.key,
      state: item.action === 'create' ? 'created' : item.action === 'present' ? 'already-present' : 'conflict',
      ...(item.action === 'conflict' ? { reason: item.reason } : {}),
    };
    if (item.kind !== 'ACCOUNT' || person === undefined) return base;
    const password = item.action === 'create' ? credentials.get(item.key)?.password : undefined;

    return { ...base, role: person.role, loginEmail: person.workEmail, ...(password ? { password } : {}) };
  });
}
