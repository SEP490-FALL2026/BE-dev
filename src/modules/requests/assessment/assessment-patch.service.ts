import { Injectable } from '@nestjs/common';
import { CatalogApi } from '../../catalog/public/catalog.api';
import type { AssessmentRecord } from '../access-request/assessment-record.types';
import type { AssessmentPatchDto } from './assessment.dto';
import { AssessmentReferenceNotFoundError } from './assessment.errors';
import type { AssessmentPatch } from './assessment.repo';
import { QuoteService } from './quote.service';

/**
 * The fields of a save as the repo keeps them, after the vendor, the plan, the person and the quote the body names have been checked
 * (`US-05-06`): a reference that does not exist is AssessmentReferenceNotFoundError, a quote the money rules refuse is theirs.
 */
@Injectable()
export class AssessmentPatchService {
  constructor(
    private readonly catalog: CatalogApi,
    private readonly quotes: QuoteService,
  ) {}

  async toPatch(body: AssessmentPatchDto, current: AssessmentRecord): Promise<AssessmentPatch> {
    const { opinion, quote, vendorId, equivalentPlanId, ...plain } = body;
    const patch: AssessmentPatch = { ...plain };

    if (vendorId !== undefined) Object.assign(patch, await this.vendorPatch(vendorId, body, current));
    if (equivalentPlanId !== undefined) patch.equivalentPlanId = await this.checkedPlan(equivalentPlanId);
    if (opinion !== undefined) {
      patch.opinionStatus = opinion?.status ?? null;
      patch.opinionNote = opinion?.note ?? null;
    }
    if (quote !== undefined) patch.quote = quote === null ? null : await this.quotes.read(quote);

    return patch;
  }

  /** A vendor of the catalog names the vendor of the proposal unless the IT Admin writes another name. */
  private async vendorPatch(
    vendorId: string | null,
    body: AssessmentPatchDto,
    current: AssessmentRecord,
  ): Promise<AssessmentPatch> {
    const name = vendorId === null ? null : await this.catalog.getVendorName(vendorId);
    if (vendorId !== null && name === null) throw new AssessmentReferenceNotFoundError('vendorId');
    const namesIt = name !== null && body.vendorName === undefined && current.vendorName === null;

    return { vendorId, ...(namesIt ? { vendorName: name } : {}) };
  }

  private async checkedPlan(planId: string | null): Promise<string | null> {
    if (planId !== null && (await this.catalog.getPlanSummaries([planId])).length === 0) {
      throw new AssessmentReferenceNotFoundError('equivalentPlanId');
    }

    return planId;
  }
}
