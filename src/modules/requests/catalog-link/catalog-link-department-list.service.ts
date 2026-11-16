import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import { LicensingDepartmentToolsApi } from '../../licensing/public/licensing-department-tools.api';
import type { DepartmentSoftwareEntryResult } from '../../licensing/public/licensing-department-tools.types';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { CatalogLinkRefusedError } from '../assessment/assessment.errors';

/**
 * The tick of the link: puts the application and the plan in the list of software of the department of the request (`QĐ-111c`). The list facade
 * does not judge who may write the list of which department: this does, before the facade is called (`D-118`); a refusal throws and the
 * transaction of the link, with its plan, is undone.
 */
@Injectable()
export class CatalogLinkDepartmentListService {
  constructor(
    private readonly departmentTools: LicensingDepartmentToolsApi,
    private readonly organizationReads: OrganizationReadApi,
    private readonly identity: IdentityAccessApi,
  ) {}

  /**
   * Throws CatalogLinkRefusedError when the department is not one the IT Admin is in charge of, and the refusals of the list
   * (DepartmentSoftwareNotInCatalogError, DepartmentSoftwareNoteInvalidError, ToolsDepartmentNotFoundError).
   */
  async add(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    departmentId: string,
    applicationId: string,
    planId: string,
  ): Promise<DepartmentSoftwareEntryResult> {
    await this.requireInCharge(tx, actor, departmentId);

    return this.departmentTools.addDepartmentSoftwareFromCatalogLink(tx, actor, {
      departmentId,
      applicationId,
      planId,
    });
  }

  /** Throws CatalogLinkRefusedError unless the department is one the IT Admin is in charge of (`US-01-11`: the ones that name them and, while nobody who can act is named, every active one). */
  private async requireInCharge(tx: DbTx, actor: AuthenticatedPrincipal, departmentId: string): Promise<void> {
    const scope = await this.organizationReads.getItAdminScope(
      actor.employeeId,
      (ids) => this.identity.findUsableItAdminEmployeeIds(ids, tx),
      tx,
    );
    if (!scope.includes(departmentId)) throw new CatalogLinkRefusedError('DEPARTMENT_OUT_OF_SCOPE');
  }
}
