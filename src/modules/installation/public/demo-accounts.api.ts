import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import type { DatabaseEnvironmentVariables } from '../../../infrastructure/config/env-schema';
import { HeldSessionLock, trySessionAdvisoryLock } from '../../../infrastructure/database/session-advisory-lock';
import { DbTx, TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import { AuditApi } from '../../audit/public/audit.api';
import { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import { LocalDemoAccountApi } from '../../identity-access/public/local-demo-account.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import {
  DemoAccountPlanItem,
  DemoAccountSpec,
  DemoAccountsAttribution,
  DemoInstallationFacts,
} from './demo-accounts.types';
import { DemoAccountsChangedError } from './installation.errors';

type Credentials = Map<string, { hash: string; hashPolicyVersion: number }>;

/**
 * The one part of `pnpm ops:demo-dataset` that is not driven through the HTTP API: the sign-in accounts of the demo people.
 * An invitation would mail a link to a demo mailbox that does not exist, so the accounts are created activated with the
 * password the operator chose, through the same demo account contract as `pnpm dev:seed` (one direct role, never a derived
 * one, never SUPER_ADMIN; operational-commands rule 6) and audited as an operator action. The employees themselves are
 * created by the Super Admin through the API before this runs; this never creates or changes an employee.
 */
@Injectable()
export class DemoAccountsApi {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly organizationReads: OrganizationReadApi,
    private readonly identity: IdentityAccessApi,
    private readonly accounts: LocalDemoAccountApi,
    private readonly audit: AuditApi,
    private readonly config: ConfigService<DatabaseEnvironmentVariables, true>,
  ) {}

  /**
   * Holds the apply lock of a fixture on this database for as long as the run writes: a second `apply` of the same
   * fixture on the same database is refused while one runs (null). Released by `release()`, or by the server when the
   * process ends, so a run that dies leaves no stale lock.
   */
  holdApplyLock(fixtureId: string): Promise<HeldSessionLock | null> {
    return trySessionAdvisoryLock(this.config.get('DATABASE_URL', { infer: true }), `demo-dataset:${fixtureId}:apply`);
  }

  /** Null when the database holds no installation. */
  async inspect(): Promise<DemoInstallationFacts | null> {
    return this.runner.run(async (tx) => {
      const organization = await this.organizationReads.getOrganization(tx);
      if (organization === null) return null;
      const today = await this.organizationReads.businessToday(new Date(), tx);
      const holder = await this.identity.getSuperAdminHolder(tx);
      const loginEmail = holder ? await this.identity.findLoginEmailOfEmployee(tx, holder.employeeId) : null;

      return {
        organizationId: organization.id,
        organizationName: organization.name,
        reportingCurrency: organization.reportingCurrency,
        today,
        timeZone: organization.timeZone,
        superAdmin:
          holder && loginEmail ? { appUserId: holder.appUserId, employeeId: holder.employeeId, loginEmail } : null,
      };
    });
  }

  /** The employees of these codes that exist, by code. */
  async findEmployees(codes: readonly string[]): Promise<Map<string, { id: string; status: string }>> {
    const found = await this.organizationReads.getEmployeesByCodes(codes);

    return new Map(found.map((employee) => [employee.employeeCode, { id: employee.id, status: employee.status }]));
  }

  /**
   * Whether each wanted account is there as wanted, can be created, or conflicts with existing data. Writes nothing.
   * Each account is judged in a short transaction of its own: a read needs no snapshot across accounts (`create`
   * judges again inside its write transaction), and one transaction for all of them makes ~4 queries × the accounts
   * sequential round trips, which over the SSH tunnel of the local path (~245 ms each to the VPS) outlived
   * DB_TRANSACTION_TIMEOUT_MS (P2028).
   */
  async describe(organizationId: string, specs: readonly DemoAccountSpec[]): Promise<DemoAccountPlanItem[]> {
    const employees = await this.runner.run((tx) =>
      this.organizationReads.getEmployeesByCodes(
        specs.map((spec) => spec.employeeCode),
        tx,
      ),
    );
    const items: DemoAccountPlanItem[] = [];
    for (const spec of specs) {
      const employee = employees.find((candidate) => candidate.employeeCode === spec.employeeCode);
      items.push(
        employee
          ? await this.runner.run((tx) => this.planOne(tx, organizationId, spec, employee))
          : absentEmployee(spec),
      );
    }

    return items;
  }

  /**
   * Creates the accounts the plan says are absent, all in one transaction, each with the same operator-chosen password
   * hashed by the account policy (checked against each sign-in email). A conflict or a missing employee writes nothing.
   */
  async create(
    organizationId: string,
    specs: readonly DemoAccountSpec[],
    password: string,
    attribution: DemoAccountsAttribution,
  ): Promise<DemoAccountPlanItem[]> {
    const first = await this.describe(organizationId, specs);
    if (first.some((item) => item.state === 'conflict' || item.state === 'no-employee')) return first;
    const credentials = await this.hashFor(specs, first, password);
    if (credentials.size === 0) return first;

    return this.runner.run(async (tx) => {
      const again = await this.plan(tx, organizationId, specs);
      if (JSON.stringify(again) !== JSON.stringify(first)) throw new DemoAccountsChangedError();
      await this.write(tx, organizationId, specs, again, credentials, attribution);

      return this.plan(tx, organizationId, specs);
    });
  }

  private async plan(
    tx: DbTx,
    organizationId: string,
    specs: readonly DemoAccountSpec[],
  ): Promise<DemoAccountPlanItem[]> {
    const employees = await this.organizationReads.getEmployeesByCodes(
      specs.map((spec) => spec.employeeCode),
      tx,
    );
    const items: DemoAccountPlanItem[] = [];
    for (const spec of specs) {
      const employee = employees.find((candidate) => candidate.employeeCode === spec.employeeCode);
      items.push(employee ? await this.planOne(tx, organizationId, spec, employee) : absentEmployee(spec));
    }

    return items;
  }

  private async planOne(
    tx: DbTx,
    organizationId: string,
    spec: DemoAccountSpec,
    employee: { id: string },
  ): Promise<DemoAccountPlanItem> {
    const state = await this.accounts.describeDemoAccount(tx, {
      organizationId,
      employeeId: employee.id,
      loginEmail: spec.loginEmail,
      role: spec.role,
    });
    const appUserId = await this.identity.findAccountIdOfEmployee(tx, employee.id);

    return {
      employeeCode: spec.employeeCode,
      state: state.state,
      ...(state.state === 'conflict' ? { reason: state.reason } : {}),
      employeeId: employee.id,
      appUserId,
    };
  }

  /** Hashing is slow on purpose: it is done before any transaction opens (lock protocol rule 3). */
  private async hashFor(
    specs: readonly DemoAccountSpec[],
    plan: readonly DemoAccountPlanItem[],
    password: string,
  ): Promise<Credentials> {
    const credentials: Credentials = new Map();
    for (const spec of specs) {
      if (plan.find((item) => item.employeeCode === spec.employeeCode)?.state !== 'absent') continue;
      credentials.set(spec.employeeCode, await this.identity.prepareCredential(password, spec.loginEmail));
    }

    return credentials;
  }

  private async write(
    tx: DbTx,
    organizationId: string,
    specs: readonly DemoAccountSpec[],
    plan: readonly DemoAccountPlanItem[],
    credentials: Credentials,
    attribution: DemoAccountsAttribution,
  ): Promise<void> {
    const correlationId = randomUUID();
    for (const spec of specs) {
      const item = plan.find((candidate) => candidate.employeeCode === spec.employeeCode);
      const credential = credentials.get(spec.employeeCode);
      if (item?.state !== 'absent' || !item.employeeId || !credential) continue;
      const { appUserId } = await this.accounts.createDemoAccount(tx, {
        organizationId,
        employeeId: item.employeeId,
        loginEmail: spec.loginEmail,
        role: spec.role,
        passwordHash: credential.hash,
        hashPolicyVersion: credential.hashPolicyVersion,
      });
      const record = (action: string, after: Record<string, string>) =>
        this.audit.record(tx, {
          organizationId,
          actorKind: 'OPERATOR',
          operatorReference: attribution.operatorReference,
          correlationId,
          action,
          resourceType: 'AppUser',
          resourceId: appUserId,
          after,
        });
      await record('DEMO_DATASET.ACCOUNT_CREATED', {
        employeeCode: spec.employeeCode,
        activationState: 'ACTIVATED',
        emailVerificationSource: 'BOOTSTRAP_ASSERTED',
        environment: attribution.environment,
      });
      await record('ROLE.GRANTED', { role: spec.role });
    }
  }
}

/** The plan item of an account whose employee is not there: nothing to look up. */
function absentEmployee(spec: DemoAccountSpec): DemoAccountPlanItem {
  return { employeeCode: spec.employeeCode, state: 'no-employee', employeeId: null, appUserId: null };
}
