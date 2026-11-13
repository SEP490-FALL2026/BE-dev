import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { CatalogApi } from '../../catalog/public/catalog.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { DepartmentSoftwareNotInCatalogError } from '../public/licensing.errors';
import type { SoftwareEntryWire, SoftwareProposalWire } from './department-software.dto';
import { toEntryWire, toProposalWire, type SoftwareNames } from './department-software.mapper';
import { catalogRefusal, type CatalogFacts, type DepartmentSoftwareItem } from './department-software.policy';
import type { SoftwareEntry, SoftwareProposal } from './department-software.types';

/**
 * Puts words on the places and the proposals before they leave (`API-LIST-DETAIL.1`): one read of the catalog for the applications, one for
 * the plans, one for the people and one for the departments of a whole page, whatever its size. It also reads what the catalog says of the
 * places a request names, which the policy judges (`catalogFacts`).
 */
@Injectable()
export class DepartmentSoftwareViewService {
  constructor(
    private readonly catalog: CatalogApi,
    private readonly organizationReads: OrganizationReadApi,
  ) {}

  async entries(entries: readonly SoftwareEntry[]): Promise<SoftwareEntryWire[]> {
    const names = await this.namesOf(entries);

    return entries.map((entry) => toEntryWire(entry, names));
  }

  async proposals(proposals: readonly SoftwareProposal[]): Promise<SoftwareProposalWire[]> {
    const names = await this.namesOf(proposals, proposals);

    return proposals.map((proposal) => toProposalWire(proposal, names));
  }

  /** What the catalog says of these places: which applications exist and are retired, and which application each plan belongs to. */
  async catalogFacts(items: readonly DepartmentSoftwareItem[], tx?: DbTx): Promise<CatalogFacts> {
    const applicationIds = [...new Set(items.map((item) => item.applicationId))];
    const planIds = [...new Set(items.flatMap((item) => (item.planId === null ? [] : [item.planId])))];
    const applications = await this.catalog.getCollectorApplications(applicationIds, tx);
    const plans = planIds.length === 0 ? [] : await this.catalog.getPlanSummaries(planIds, tx);

    return {
      applications: new Map(
        applications.map((application) => [application.id, { retired: application.retiredAt !== null }]),
      ),
      plans: new Map(plans.map((plan) => [plan.planId, { applicationId: plan.applicationId }])),
    };
  }

  /** Throws DepartmentSoftwareNotInCatalogError naming every place the catalog does not offer (`QĐ-110t`); none of them is written or proposed. */
  async assertInCatalog(items: readonly DepartmentSoftwareItem[], tx?: DbTx): Promise<void> {
    if (items.length === 0) return;
    const facts = await this.catalogFacts(items, tx);
    const outside = items.filter((item) => catalogRefusal(item, facts) !== null);
    if (outside.length > 0) {
      throw new DepartmentSoftwareNotInCatalogError(
        outside.map((item) => ({ applicationId: item.applicationId, planId: item.planId })),
      );
    }
  }

  private async namesOf(
    places: readonly DepartmentSoftwareItem[],
    proposals: readonly SoftwareProposal[] = [],
  ): Promise<SoftwareNames> {
    const applicationIds = [...new Set(places.map((place) => place.applicationId))];
    const planIds = [...new Set(places.flatMap((place) => (place.planId === null ? [] : [place.planId])))];
    const applications = applicationIds.length === 0 ? [] : await this.catalog.getCollectorApplications(applicationIds);
    const plans = planIds.length === 0 ? [] : await this.catalog.getPlanSummaries(planIds);
    const people =
      proposals.length === 0
        ? []
        : await this.organizationReads.getEmployees([
            ...new Set(proposals.map((proposal) => proposal.proposedByEmployeeId)),
          ]);
    const departments =
      proposals.length === 0
        ? []
        : await this.organizationReads.getDepartmentBriefs([
            ...new Set(proposals.map((proposal) => proposal.departmentId)),
          ]);

    return {
      applications: new Map(applications.map((application) => [application.id, application.name])),
      plans: new Map(plans.map((plan) => [plan.planId, plan.planName])),
      people: new Map(
        people.map((person) => [person.id, { employeeCode: person.employeeCode, fullName: person.fullName }]),
      ),
      departments: new Map(
        departments.map((department) => [department.id, { code: department.code, name: department.name }]),
      ),
    };
  }
}
