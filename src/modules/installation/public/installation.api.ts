import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import { AuditApi } from '../../audit/public/audit.api';
import { FinanceApi } from '../../finance/public/finance.api';
import { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import { OrganizationApi } from '../../organization/public/organization.api';
import { AlreadyInstalledError, InstallationInputError } from './installation.errors';
import { InstallationInput, installationInputSchema } from '../installation.dto';
import { InstallationRepo } from '../installation.repo';

export interface InstallationResult {
  organizationId: string;
  superAdminAppUserId: string;
  superAdminEmployeeId: string;
  correlationId: string;
}

/**
 * First-run installation (FR-9.8, `QĐ-87f`(1)). Runs outside HTTP, once, before anything else. Creates the minimum real
 * data in one transaction: the organization, ONE first department with no Cost Center, head or IT Admin in charge, the
 * Super Admin's employee in that department (no job title) and the activated Super Admin account. It creates no Cost Center
 * (Finance creates one for a department that exists, `QĐ-87d`(1)), no job title and no IT employee. Every Audit Trail event
 * it writes carries `installationException: true`: the one set of records written without an HR basis (`QĐ-87b`(1)). A
 * second run finds the organization and changes nothing. It never edits an existing account: recovery is a separate,
 * approved procedure (FR-8.10(d)).
 */
@Injectable()
export class InstallationApi {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly organization: OrganizationApi,
    private readonly identity: IdentityAccessApi,
    private readonly audit: AuditApi,
    private readonly repo: InstallationRepo,
    private readonly finance: FinanceApi,
  ) {}

  async install(rawInput: unknown, password: string): Promise<InstallationResult> {
    const parsed = installationInputSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new InstallationInputError(
        parsed.error.issues.map((i) => `${i.path.join('.') || '(input)'}: ${i.message}`),
      );
    }
    const input = parsed.data;
    // The reporting currency must be one finance has a minor-unit table for (DB-02): a code outside it would only fail
    // later, at the first conversion, with no way back once rates and prices are recorded in it.
    if (!(await this.finance.findCurrency(input.reportingCurrency))) {
      throw new InstallationInputError([
        `reportingCurrency: ${input.reportingCurrency} is not in the currency table of this installation`,
      ]);
    }
    const loginEmail = input.loginEmail ?? input.superAdmin.workEmail;

    // Policy check and the slow hash happen before any lock is taken.
    const credential = await this.identity.prepareCredential(password, loginEmail);
    const correlationId = randomUUID();

    return this.runner.run(async (tx) => {
      await this.repo.lockInstallation(tx);
      // Read after the lock: a concurrent installer that finished first is visible now.
      if (await this.organization.getOrganization(tx)) throw new AlreadyInstalledError();

      const operator = {
        actorKind: 'OPERATOR' as const,
        operatorReference: input.operatorReference,
        correlationId,
      };
      const record = async (
        organizationId: string,
        action: string,
        resourceType: string,
        resourceId: string,
        after: Record<string, string | number | boolean>,
      ): Promise<void> =>
        this.audit.record(tx, {
          ...operator,
          organizationId,
          action,
          resourceType,
          resourceId,
          after: { ...after, installationException: true },
        });

      const org = await this.organization.createOrganization(tx, {
        name: input.organizationName,
        timeZone: input.timeZone,
        reportingCurrency: input.reportingCurrency,
      });
      await record(org.id, 'INSTALLATION.ORGANIZATION_CREATED', 'Organization', org.id, {
        timeZone: input.timeZone,
        reportingCurrency: input.reportingCurrency,
        environment: input.environment,
      });

      const department = await this.organization.createDepartment(tx, {
        organizationId: org.id,
        code: input.departmentCode,
        name: input.departmentName,
      });
      await record(org.id, 'INSTALLATION.DEPARTMENT_CREATED', 'Department', department.id, {
        code: input.departmentCode,
      });

      const person = input.superAdmin;
      const employee = await this.organization.createEmployeeWithPlacement(tx, {
        organizationId: org.id,
        employeeCode: person.employeeCode,
        fullName: person.fullName,
        workEmail: person.workEmail,
        employmentType: person.employmentType,
        hireDate: person.hireDate,
        departmentId: department.id,
        jobTitle: null,
      });
      await record(org.id, 'INSTALLATION.EMPLOYEE_CREATED', 'Employee', employee.id, {
        employeeCode: person.employeeCode,
        employmentType: person.employmentType,
        hireDate: person.hireDate,
        departmentCode: input.departmentCode,
      });

      const account = await this.identity.createBootstrapSuperAdmin(tx, {
        organizationId: org.id,
        employeeId: employee.id,
        loginEmail,
        passwordHash: credential.hash,
        hashPolicyVersion: credential.hashPolicyVersion,
      });
      await record(org.id, 'INSTALLATION.SUPER_ADMIN_CREATED', 'AppUser', account.appUserId, {
        employeeCode: person.employeeCode,
        activationState: 'ACTIVATED',
        emailVerificationSource: 'BOOTSTRAP_ASSERTED',
      });
      await record(org.id, 'ROLE.GRANTED', 'AppUser', account.appUserId, { role: 'SUPER_ADMIN' });

      return {
        organizationId: org.id,
        superAdminAppUserId: account.appUserId,
        superAdminEmployeeId: employee.id,
        correlationId,
      };
    });
  }
}

export type { InstallationInput };
