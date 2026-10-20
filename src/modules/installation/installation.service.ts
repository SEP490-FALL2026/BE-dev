import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { TransactionRunner } from '../../infrastructure/database/transaction-runner';
import { AuditService } from '../audit/audit.service';
import { IdentityAccessService } from '../identity-access/identity-access.service';
import { OrganizationService } from '../organization/organization.service';
import { AlreadyInstalledError, InstallationInputError } from './installation.errors';
import { InstallationInput, installationInputSchema } from './installation.input';
import { InstallationRepo } from './installation.repo';

export interface InstallationResult {
  organizationId: string;
  superAdminAppUserId: string;
  superAdminEmployeeId: string;
  itAdminEmployeeId: string;
  correlationId: string;
}

/**
 * First-run installation (FR-9.8, QĐ-67a/b). Runs outside HTTP, once, before anything else.
 * Creates the minimum real data in one transaction: the organization, one UNIT cost center, one
 * department, one job title, the Super Admin's employee and an IT employee (no account), and the
 * activated Super Admin account. A second run finds the organization and changes nothing.
 * It never edits an existing account: recovery is a separate, approved procedure (FR-8.10(d)).
 */
@Injectable()
export class InstallationService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly organization: OrganizationService,
    private readonly identity: IdentityAccessService,
    private readonly audit: AuditService,
    private readonly repo: InstallationRepo,
  ) {}

  async install(rawInput: unknown, password: string): Promise<InstallationResult> {
    const parsed = installationInputSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new InstallationInputError(
        parsed.error.issues.map((i) => `${i.path.join('.') || '(input)'}: ${i.message}`),
      );
    }
    const input = parsed.data;
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
        this.audit.record(tx, { ...operator, organizationId, action, resourceType, resourceId, after });

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

      const costCenter = await this.organization.createUnitCostCenter(tx, {
        organizationId: org.id,
        code: input.costCenterCode,
        name: input.costCenterName,
      });
      await record(org.id, 'INSTALLATION.COST_CENTER_CREATED', 'CostCenter', costCenter.id, {
        code: input.costCenterCode,
        kind: 'UNIT',
      });

      const department = await this.organization.createDepartment(tx, {
        organizationId: org.id,
        code: input.departmentCode,
        name: input.departmentName,
        costCenterId: costCenter.id,
      });
      await record(org.id, 'INSTALLATION.DEPARTMENT_CREATED', 'Department', department.id, {
        code: input.departmentCode,
        costCenterCode: input.costCenterCode,
      });

      const jobTitle = await this.organization.createJobTitle(tx, org.id, input.jobTitleName);
      await record(org.id, 'INSTALLATION.JOB_TITLE_CREATED', 'JobTitle', jobTitle.id, { name: input.jobTitleName });

      const employeeIds: string[] = [];
      for (const person of [input.superAdmin, input.itAdmin]) {
        const employee = await this.organization.createEmployeeWithPlacement(tx, {
          organizationId: org.id,
          employeeCode: person.employeeCode,
          fullName: person.fullName,
          workEmail: person.workEmail,
          employmentType: person.employmentType,
          hireDate: person.hireDate,
          departmentId: department.id,
          jobTitleId: jobTitle.id,
        });
        employeeIds.push(employee.id);
        await record(org.id, 'INSTALLATION.EMPLOYEE_CREATED', 'Employee', employee.id, {
          employeeCode: person.employeeCode,
          employmentType: person.employmentType,
          hireDate: person.hireDate,
          departmentCode: input.departmentCode,
        });
      }

      const account = await this.identity.createBootstrapSuperAdmin(tx, {
        organizationId: org.id,
        employeeId: employeeIds[0],
        loginEmail,
        passwordHash: credential.hash,
        hashPolicyVersion: credential.hashPolicyVersion,
      });
      await record(org.id, 'INSTALLATION.SUPER_ADMIN_CREATED', 'AppUser', account.appUserId, {
        employeeCode: input.superAdmin.employeeCode,
        activationState: 'ACTIVATED',
        emailVerificationSource: 'BOOTSTRAP_ASSERTED',
      });
      await record(org.id, 'ROLE.GRANTED', 'AppUser', account.appUserId, { role: 'SUPER_ADMIN' });

      return {
        organizationId: org.id,
        superAdminAppUserId: account.appUserId,
        superAdminEmployeeId: employeeIds[0],
        itAdminEmployeeId: employeeIds[1],
        correlationId,
      };
    });
  }
}

export type { InstallationInput };
