import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { CatalogApi } from '../../catalog/public/catalog.api';
import { AccessRequestApplicationRetiredError } from '../access-request/access-request.errors';
import type { ProposalBodyDto } from './assessment.dto';
import { AssessmentReferenceNotFoundError, ProposalSoftwareInCatalogError } from './assessment.errors';
import { AssessmentRepo } from './assessment.repo';

/** What the assessment of a short proposal starts from: the application the software is in, the plan asked for, the vendor of the application. */
export interface ShortProposalBasis {
  existingApplicationId: string;
  plannedPlanName: string;
  vendor: { id: string; name: string } | null;
}

/**
 * What the Employee declares of software that is not in the catalog, judged against the catalog and then written (`US-05-06` AC-1, `QĐ-111a`,
 * `QĐ-111b`). Software that is new must not be in the catalog already, by name or by domain (the one rule of the catalog, shared with the IT Admin
 * who declares an application); when only a plan is missing the person names the application, and the assessment is opened for that plan alone.
 */
@Injectable()
export class ProposalDeclarationService {
  constructor(
    private readonly catalog: CatalogApi,
    private readonly assessments: AssessmentRepo,
  ) {}

  /**
   * Null for software that is new, or what a short proposal starts from. Throws ProposalSoftwareInCatalogError, AssessmentReferenceNotFoundError for an
   * application that does not exist and AccessRequestApplicationRetiredError for one that has left the catalog.
   */
  async judge(
    tx: DbTx,
    declared: Pick<ProposalBodyDto, 'softwareName' | 'homepageUrl' | 'existingApplicationId' | 'plannedPlanName'>,
  ): Promise<ShortProposalBasis | null> {
    if (declared.existingApplicationId === undefined || declared.plannedPlanName === undefined) {
      const match = await this.catalog.findCatalogEntryOfSoftware(tx, {
        name: declared.softwareName,
        homepageUrl: declared.homepageUrl,
      });
      if (match) throw new ProposalSoftwareInCatalogError(match.entry, match.by);

      return null;
    }

    const entry = await this.catalog.getCatalogEntry(tx, declared.existingApplicationId, declared.plannedPlanName);
    if (!entry) throw new AssessmentReferenceNotFoundError('existingApplicationId');
    if (entry.status === 'RETIRED') throw new AccessRequestApplicationRetiredError();
    if (entry.planNamed) throw new ProposalSoftwareInCatalogError(entry, 'PLAN');

    return {
      existingApplicationId: entry.applicationId,
      plannedPlanName: declared.plannedPlanName,
      vendor: entry.vendor,
    };
  }

  /** Writes the declaration and opens the assessment: empty for new software, started from what is known for a short proposal. */
  open(tx: DbTx, requestId: string, body: ProposalBodyDto, basis: ShortProposalBasis | null): Promise<void> {
    return this.assessments.open(
      tx,
      requestId,
      {
        softwareName: body.softwareName,
        homepageUrl: body.homepageUrl,
        purpose: body.purpose,
        dataDescription: body.dataDescription,
        expectedUsers: body.expectedUsers,
        existingApplicationId: basis?.existingApplicationId ?? null,
      },
      basis && { plannedPlanName: basis.plannedPlanName, vendor: basis.vendor },
    );
  }
}
