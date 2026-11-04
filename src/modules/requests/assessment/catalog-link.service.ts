import { Injectable } from '@nestjs/common';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { CatalogApi } from '../../catalog/public/catalog.api';
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

/**
 * Linking a proposal to the plan the IT Admin registered in the catalog (`US-05-06` AC-4, AC-8). The software of a request
 * enters the catalog only through the registration that follows the decision of the spending approver: a request that has
 * not been decided as spend cannot be linked, so the IT Admin has no way to put it into the catalog by way of the request.
 * And the plan linked must belong to an application that has a Business Owner who still works (`INV-06`), so that the
 * seat is never granted for software nobody answers for.
 */
@Injectable()
export class CatalogLinkService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly requests: AccessRequestRepo,
    private readonly catalog: CatalogApi,
    private readonly organizationReads: OrganizationReadApi,
    private readonly audit: AuditApi,
  ) {}

  /**
   * Throws AccessRequestNotFoundError, CatalogLinkRefusedError, AccessRequestPlanNotFoundError and
   * AccessRequestApplicationRetiredError.
   */
  async link(actor: AuthenticatedPrincipal, requestId: string, planId: string): Promise<AccessRequestRecord> {
    return this.runner.run(async (tx) => {
      const request = await this.requests.lockById(tx, requestId);
      if (!request || request.branch !== 'NEW_SOFTWARE') throw new AccessRequestNotFoundError();
      if (!canLinkCatalogPlan(request)) throw new CatalogLinkRefusedError('NOT_LINKABLE');

      const [target] = await this.catalog.findPlanSeatTargets([planId], tx);
      if (!target) throw new AccessRequestPlanNotFoundError();
      if (target.applicationStatus === 'RETIRED') throw new AccessRequestApplicationRetiredError();
      const ownerId = await this.catalog.getPlanBusinessOwnerId(planId, tx);
      const [owner] = ownerId === null ? [] : await this.organizationReads.getEmployees([ownerId], tx);
      if (!owner || owner.status !== 'ACTIVE') throw new CatalogLinkRefusedError('BUSINESS_OWNER_REQUIRED');

      await this.requests.setPlan(tx, requestId, planId);
      await this.audit.record(
        tx,
        accessRequestAuditEvent(
          actor,
          request.organizationId,
          'ACCESS_REQUEST.CATALOG_LINKED',
          'ACCESS_REQUEST',
          requestId,
          { requestId, planId, businessOwnerEmployeeId: owner.id },
        ),
      );

      const linked = await this.requests.findById(requestId, tx);
      if (!linked) throw new Error(`The request ${requestId} was not found after it was linked.`);

      return linked;
    });
  }
}
