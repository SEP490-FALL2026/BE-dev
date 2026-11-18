import { Injectable } from '@nestjs/common';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { catalogAuditEvent } from '../catalog-audit-event.mapper';
import { ApplicationNotFoundError } from '../catalog-entry/application.errors';
import { needsResponsible } from '../catalog-entry/application.policy';
import { ApplicationRepo } from '../catalog-entry/application.repo';
import { decideResponsibilityTransfer } from './application-responsibility.policy';

export interface ResponsibilityTransferResult {
  applicationId: string;
  responsibleItAdmin: { employeeId: string; employeeCode: string; fullName: string };
  changed: boolean;
}

/**
 * Handing an application to another IT Admin (`QĐ-111g`, `R-26`). The row is locked before it is read, so two IT Admins who both take an
 * application that needs one cannot both succeed: the second finds a responsible IT Admin already and is refused. The person named is
 * judged on the account as it is in this transaction. One audit event says who handed it to whom.
 */
@Injectable()
export class ApplicationResponsibilityService {
  constructor(
    private readonly applications: ApplicationRepo,
    private readonly identity: IdentityAccessApi,
    private readonly organizationReads: OrganizationReadApi,
    private readonly audit: AuditApi,
    private readonly runner: TransactionRunner,
  ) {}

  /** Throws ApplicationNotFoundError, ApplicationResponsibilityForbiddenError and ApplicationResponsibleNotItAdminError. */
  async transfer(
    actor: AuthenticatedPrincipal,
    applicationId: string,
    toEmployeeId: string,
  ): Promise<ResponsibilityTransferResult> {
    const organization = await this.organizationReads.getOrganization();
    if (!organization) throw new Error('The application catalog was used before installation');
    const role = actor.roles.includes('SUPER_ADMIN') ? 'SUPER_ADMIN' : 'IT_ADMIN';

    const changed = await this.runner.run(async (tx) => {
      const application = await this.applications.lock(tx, applicationId);
      if (!application) throw new ApplicationNotFoundError();
      const responsible = application.responsibleItAdminEmployeeId;
      const usable = await this.identity.findUsableItAdminEmployeeIds(
        [...new Set([toEmployeeId, ...(responsible === null ? [] : [responsible])])],
        tx,
      );
      const decision = decideResponsibilityTransfer({
        actor: { role, employeeId: actor.employeeId },
        responsibleEmployeeId: responsible,
        needsResponsible: needsResponsible(responsible, usable),
        toEmployeeId,
        toIsUsableItAdmin: usable.has(toEmployeeId),
      });
      if (decision === 'UNCHANGED') return false;

      await this.applications.setResponsible(tx, applicationId, toEmployeeId);
      await this.audit.record(
        tx,
        catalogAuditEvent(
          actor,
          organization.id,
          'APPLICATION.RESPONSIBILITY_TRANSFERRED',
          'Application',
          applicationId,
          { responsibleItAdminEmployeeId: responsible },
          { responsibleItAdminEmployeeId: toEmployeeId },
        ),
      );

      return true;
    });
    const [employee] = await this.organizationReads.getEmployees([toEmployeeId]);
    if (!employee) throw new Error('The IT Admin responsible for an application is not an employee');

    return {
      applicationId,
      responsibleItAdmin: {
        employeeId: employee.id,
        employeeCode: employee.employeeCode,
        fullName: employee.fullName,
      },
      changed,
    };
  }
}
