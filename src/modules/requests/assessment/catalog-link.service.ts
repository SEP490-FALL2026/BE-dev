import { Injectable } from '@nestjs/common';
import { TransactionRunner, type DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { CatalogApi } from '../../catalog/public/catalog.api';
import { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import { LicensingDepartmentToolsApi } from '../../licensing/public/licensing-department-tools.api';
import type { DepartmentSoftwareEntryResult } from '../../licensing/public/licensing-department-tools.types';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { accessRequestAuditEvent } from '../access-request/access-request-audit-event.mapper';
import {
  AccessRequestApplicationRetiredError,
  AccessRequestNotFoundError,
  AccessRequestPlanNotFoundError,
} from '../access-request/access-request.errors';
import { AccessRequestRepo } from '../access-request/access-request.repo';
import type { AccessRequestRecord } from '../access-request/access-request.types';
import { CatalogLinkRefusedError } from './assessment.errors';
import { canLinkCatalogPlan } from './assessment.policy';
import { AssessmentTermFitService } from './assessment-term-fit.service';

/** What the link did: the request with its plan, and the place in the list of the department when the IT Admin asked for one. */
export interface CatalogLinked {
  request: AccessRequestRecord;
  departmentList: DepartmentSoftwareEntryResult | null;
}

/**
 * Linking a proposal to the plan the IT Admin registered in the catalog (`US-05-06` AC-4, AC-8). The software of a request
 * enters the catalog only through the registration that follows the decision of the spending approver: a request that has
 * not been decided as spend cannot be linked, so the IT Admin has no way to put it into the catalog by way of the request.
 * The plan may be one the catalog already had: an IT Admin who declared the software and was told it is there (`QĐ-111b`) links the request to
 * that entry and it goes on as case A (R-25), without the person sending it again. With the tick `addToDepartmentList` the application and the
 * plan also go into the list of software of the department of the request (`QĐ-111c`), in the same transaction, which only an IT Admin in charge of
 * that department may ask. The audit names the IT Admin who answers for the application of the plan (`QĐ-111g`); the link does not wait for one.
 * The plan can be of another kind than the one the assessment concluded, so the months of the request are judged again by the kind of the plan
 * (`AssessmentTermFitService`, the rule of the completion): a plan bought once clears them, a plan that does not take them refuses the link.
 */
@Injectable()
export class CatalogLinkService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly requests: AccessRequestRepo,
    private readonly catalog: CatalogApi,
    private readonly audit: AuditApi,
    private readonly departmentTools: LicensingDepartmentToolsApi,
    private readonly organizationReads: OrganizationReadApi,
    private readonly identity: IdentityAccessApi,
    private readonly termFit: AssessmentTermFitService,
  ) {}

  /**
   * Throws AccessRequestNotFoundError, CatalogLinkRefusedError (the request cannot be linked now, or the department is not one the IT Admin is in
   * charge of), AccessRequestPlanNotFoundError and AccessRequestApplicationRetiredError, and, for the tick, the refusals of the list of the department
   * (DepartmentSoftwareNotInCatalogError, DepartmentSoftwareNoteInvalidError, ToolsDepartmentNotFoundError) and AssessmentTermNotFitError (the months of the
   * request do not fit the kind of the plan). Nothing is written when any is thrown.
   */
  async link(
    actor: AuthenticatedPrincipal,
    requestId: string,
    input: { planId: string; addToDepartmentList?: boolean },
  ): Promise<CatalogLinked> {
    return this.runner.run(async (tx) => {
      const request = await this.requests.lockById(tx, requestId);
      if (!request || request.branch !== 'NEW_SOFTWARE') throw new AccessRequestNotFoundError();
      if (!canLinkCatalogPlan(request)) throw new CatalogLinkRefusedError('NOT_LINKABLE');

      const [target] = await this.catalog.findPlanSeatTargets([input.planId], tx);
      if (!target) throw new AccessRequestPlanNotFoundError();
      if (target.applicationStatus === 'RETIRED') throw new AccessRequestApplicationRetiredError();
      const responsibleItAdminEmployeeId = await this.catalog.getPlanResponsibleItAdminId(input.planId, tx);
      const fitted = await this.termFit.fitToLinkedPlan(tx, request, target.provisioningType, new Date());

      await this.requests.setPlan(tx, requestId, input.planId);
      const departmentList =
        input.addToDepartmentList === true
          ? await this.listInDepartment(tx, actor, request.departmentId, target.applicationId, input.planId)
          : null;
      await this.audit.record(
        tx,
        accessRequestAuditEvent(
          actor,
          request.organizationId,
          'ACCESS_REQUEST.CATALOG_LINKED',
          'ACCESS_REQUEST',
          requestId,
          {
            requestId,
            planId: input.planId,
            responsibleItAdminEmployeeId,
            addToDepartmentList: input.addToDepartmentList === true,
            departmentSoftwareEntryId: departmentList?.entryId ?? null,
            departmentSoftwareEntryAdded: departmentList?.added ?? null,
            // The time of use the request keeps, and the months a plan bought once cleared from it (`QĐ-111i`).
            termMonths: fitted.request.termMonths,
            termMonthsCleared: fitted.termMonthsCleared,
          },
        ),
      );

      const linked = await this.requests.findById(requestId, tx);
      if (!linked) throw new Error(`The request ${requestId} was not found after it was linked.`);

      return { request: linked, departmentList };
    });
  }

  /**
   * Puts the application and the plan in the list of the department of the request. The list facade does not judge who may write the list of which
   * department: this does, before the facade is called (`D-118`); a refusal throws and the transaction of the link, with its plan, is undone.
   */
  private async listInDepartment(
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
