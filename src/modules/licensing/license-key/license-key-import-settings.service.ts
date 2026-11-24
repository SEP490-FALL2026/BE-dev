import { Injectable } from '@nestjs/common';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import { CatalogPlanTermsApi } from '../../catalog/public/catalog-plan-terms.api';
import { SeatBaselineService } from '../seat-baseline/seat-baseline.service';
import { LicenseKeyInitializationClosedError } from './license-key.errors';
import { resolveMaxActivations } from './license-key.policy';

/**
 * What an import of keys settles besides the keys: the activations they had when they were entered and the cap of activations they take. The
 * two are asked at different moments of the transaction of an import, which is why they are two calls.
 */
@Injectable()
export class LicenseKeyImportSettingsService {
  constructor(
    private readonly baseline: SeatBaselineService,
    private readonly planTerms: CatalogPlanTermsApi,
  ) {}

  /**
   * The activations the keys of the batch already had, one value for the whole batch (W2-Q5). Told only while the installation phase is open
   * (`QĐ-116n`); zero, which is what none says, is allowed whenever. When it is told, the state of the baseline is held `FOR SHARE` here, the
   * first lock of the import (tier 0b of `docs/rules/database-business.md`), before the purchase is locked.
   * Throws LicenseKeyInitializationClosedError.
   */
  async initialActivationsUsed(tx: DbTx, told: number | undefined): Promise<number> {
    const initial = told ?? 0;
    if (initial > 0 && !(await this.baseline.holdInitializationOpen(tx)))
      throw new LicenseKeyInitializationClosedError();

    return initial;
  }

  /** The cap of activations of the keys: the one named, else the install limit in the terms of the plan, else one. */
  async maxActivations(tx: DbTx, planId: string, named: number | undefined): Promise<number> {
    return resolveMaxActivations(named, named === undefined ? await this.planTerms.installLimitOf(planId, tx) : null);
  }
}
