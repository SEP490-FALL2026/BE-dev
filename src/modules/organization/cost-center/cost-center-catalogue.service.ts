import { Injectable } from '@nestjs/common';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import { CreateCostCenterInput } from '../organization.types';
import { CostCenterRepo } from './cost-center.repo';

/**
 * The Cost Center catalogue as the organization facade needs it outside the catalogue's own HTTP use cases: the
 * installation's first UNIT and the number of free UNITs the onboarding checklist shows. The catalogue use cases
 * themselves (`CostCenterService`) keep using `CostCenterRepo` directly (Owner decision E4).
 */
@Injectable()
export class CostCenterCatalogueService {
  constructor(private readonly repo: CostCenterRepo) {}

  createUnitForInstallation(tx: DbTx, input: CreateCostCenterInput): Promise<{ id: string }> {
    return this.repo.createCostCenter(tx, input);
  }

  countFreeUnits(): Promise<number> {
    return this.repo.countFreeUnits();
  }
}
