import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { DatabaseEnvironmentVariables } from '../../../infrastructure/config/env-schema';
import { DbTx, TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import { isUniqueViolation } from '../../../infrastructure/database/unique-violation';
import { AuditApi } from '../../audit/public/audit.api';
import { LocalDemoAccountApi } from '../../identity-access/public/local-demo-account.api';
import { OrganizationApi } from '../../organization/public/organization.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { DEMO_FIXTURE_KEYS, DEMO_PEOPLE_LOOKUP, buildSeedPlan, samePlan } from '../dev-seed/dev-seed-plan.policy';
import { SeedStateChangedError } from '../dev-seed/dev-seed.errors';
import { DEMO_COST_CENTER, DEMO_DEPARTMENT, DEMO_HIRE_DATE, DEMO_PEOPLE } from '../dev-seed/dev-seed-fixture.types';
import { DevSeedRepo } from '../dev-seed/dev-seed.repo';
import { DevSeedResult, SeedPlan, SeedReportItem } from './dev-seed.types';
import { checkLocalSeedGuards } from '../dev-seed/local-seed.policy';
import { DevSeedCredentialsService, type Credentials } from '../dev-seed/dev-seed-credentials.service';

/** Marks every Audit Trail event of a seed run (`actorKind: OPERATOR`). */
export const LOCAL_SEED_OPERATOR_REFERENCE = 'LOCAL_SEED';

/**
 * `pnpm dev:seed`: the local demo data, through the owning services and the Audit Trail. The department is written
 * before the Cost Center created for it (`QĐ-87d`(1)), the people carry no job title and no Cost Center activation row is
 * written (the final code never reads one). The three local guards
 * are checked first; then a plan is read, the new passwords are hashed outside any transaction, and one transaction
 * takes the seed lock, reads the plan again and writes. All or nothing; a rerun writes nothing.
 */
@Injectable()
export class DevSeedApi {
  constructor(
    private readonly config: ConfigService<DatabaseEnvironmentVariables, true>,
    private readonly runner: TransactionRunner,
    private readonly repo: DevSeedRepo,
    private readonly organization: OrganizationApi,
    private readonly organizationReads: OrganizationReadApi,
    private readonly accounts: LocalDemoAccountApi,
    private readonly audit: AuditApi,
    private readonly credentials: DevSeedCredentialsService,
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

    const credentials = await this.credentials.prepare(first);
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
    const organization = await this.organizationReads.getOrganization(tx);
    if (organization === null) return null;

    const fixture = await this.organizationReads.readLocalSeedFixture(tx, {
      organizationId: organization.id,
      ...DEMO_FIXTURE_KEYS,
    });
    const lookup = await this.organizationReads.lookupForEmployeeImport(DEMO_PEOPLE_LOOKUP, tx);
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

    // The department first, then the Cost Center created for it (`QĐ-87d(1)`: there is no Cost Center without a department).
    let departmentId = plan.departmentId;
    if (creates('DEPARTMENT', DEMO_DEPARTMENT.code)) {
      const department = await this.organization.createDepartment(tx, { organizationId, ...DEMO_DEPARTMENT });
      departmentId = department.id;
      await record('DEV_SEED.DEPARTMENT_CREATED', 'Department', department.id, { code: DEMO_DEPARTMENT.code });
    }

    if (creates('COST_CENTER', DEMO_COST_CENTER.code)) {
      const costCenter = await this.organization.createUnitCostCenter(tx, {
        organizationId,
        ...DEMO_COST_CENTER,
        departmentId: departmentId as string,
      });
      await record('DEV_SEED.COST_CENTER_CREATED', 'CostCenter', costCenter.id, {
        code: DEMO_COST_CENTER.code,
        kind: 'UNIT',
        departmentCode: DEMO_DEPARTMENT.code,
      });
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
            jobTitle: null,
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
