import { Injectable } from '@nestjs/common';
import { pageOf, type Page } from '../../../core/application/pagination';
import type { BusinessDate } from '../../../core/business-date';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { CatalogApi } from '../../catalog/public/catalog.api';
import { OrganizationApi } from '../../organization/public/organization.api';
import { effectiveFromLabel } from '../assignment/assignment.policy';
import type { ProvisioningKind } from '../public/licensing.types';
import { isExpiringSoon, rightStatusOf, type MySoftwareStatus, type MySoftwareView } from './my-software.policy';
import { MySoftwareRepo, type MyRightRow } from './my-software.repo';

/** One right of the person as the list answers it: what it is, how it is granted, where it stands and until when. */
export interface MySoftwareRight {
  assignmentId: string;
  application: { id: string; name: string };
  plan: { id: string; name: string };
  provisioningType: ProvisioningKind;
  status: MySoftwareStatus;
  effectiveFrom: BusinessDate;
  grantedOn: BusinessDate | null;
  effectiveFromLabel: string | null;
  expectedEndDate: BusinessDate | null;
  expiringSoon: boolean;
  validUntil: BusinessDate | null;
  successorAssignmentId: string | null;
}

/**
 * "My software" (`US-12-15` AC-2, `US-16-01` AC-1): the rights the signed-in person holds today or will, or those that ended, one
 * page at a time, each with its kind of provisioning (K1 to K5), its status on the business day of the organization, and the day it
 * is expected to end. Read from the caller's own employee only: no route parameter names a person, so nobody reads the rights of
 * someone else here, a head or an IT Admin included. Nothing about money, a Cost Center, other people, the account identifier or a
 * license key is read or answered: a K4 right shows that the software is granted, never its key. Plans are named in one read for
 * the whole page.
 */
@Injectable()
export class MySoftwareService {
  constructor(
    private readonly repo: MySoftwareRepo,
    private readonly organization: OrganizationApi,
    private readonly catalog: CatalogApi,
  ) {}

  async list(
    actor: AuthenticatedPrincipal,
    query: { view: MySoftwareView; page: number; pageSize: number },
  ): Promise<{ asOf: BusinessDate; view: MySoftwareView; page: Page<MySoftwareRight> }> {
    const today = await this.organization.businessToday();
    const { items, total } = await this.repo.page(actor.employeeId, query.view, today, {
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    });
    const planIds = [...new Set(items.map((item) => item.planId))];
    const plans = new Map(
      (planIds.length > 0 ? await this.catalog.getPlanRevocationInfo(planIds) : []).map((plan) => [plan.planId, plan]),
    );
    const rights = items.flatMap((row): MySoftwareRight[] => {
      const plan = plans.get(row.planId);

      return plan ? [toRight(row, plan, today)] : [];
    });

    return { asOf: today, view: query.view, page: pageOf(rights, total, query.page, query.pageSize) };
  }
}

function toRight(
  row: MyRightRow,
  plan: {
    planId: string;
    planName: string;
    applicationId: string;
    applicationName: string;
    provisioningType: ProvisioningKind;
  },
  today: BusinessDate,
): MySoftwareRight {
  const status = rightStatusOf(row, today);

  return {
    assignmentId: row.assignmentId,
    application: { id: plan.applicationId, name: plan.applicationName },
    plan: { id: plan.planId, name: plan.planName },
    provisioningType: plan.provisioningType,
    status,
    effectiveFrom: row.effectiveFrom,
    grantedOn: row.effectiveFromBasis === 'ACTUAL' ? row.effectiveFrom : null,
    effectiveFromLabel: effectiveFromLabel(row.effectiveFromBasis, row.effectiveFrom),
    expectedEndDate: row.expectedEndDate,
    expiringSoon: isExpiringSoon(row, status, today),
    validUntil: row.validUntil,
    successorAssignmentId: row.successorAssignmentId,
  };
}
