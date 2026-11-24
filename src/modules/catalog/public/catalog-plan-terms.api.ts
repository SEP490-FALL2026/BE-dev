import { Injectable } from '@nestjs/common';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import { PlanTermsRepo } from '../plan-terms/plan-terms.repo';

/** What the terms of a plan say that another module needs; read-only. */
@Injectable()
export class CatalogPlanTermsApi {
  constructor(private readonly terms: PlanTermsRepo) {}

  /**
   * How many machines one key of the plan may be on, as the terms of the plan record it (`installLimitMaxDevices`); null when the plan has no
   * terms or they set no numeric limit. A key entered without a cap of its own takes this as its cap of activations.
   */
  async installLimitOf(planId: string, tx?: DbTx): Promise<number | null> {
    return (await this.terms.find(planId, tx))?.installLimitMaxDevices ?? null;
  }
}
