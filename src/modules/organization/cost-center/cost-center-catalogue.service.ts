import { Injectable } from '@nestjs/common';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import { CostCenterBrief, CreateCostCenterInput } from '../public/organization.types';
import { CostCenterRepo } from './cost-center.repo';
import { CostCenterRecord } from './cost-center.types';

/**
 * The Cost Center catalogue as the organization facade needs it outside the catalogue's own HTTP use cases: the
 * installation's first UNIT, created for its department. The catalogue use cases
 * themselves (`CostCenterService`) keep using `CostCenterRepo` directly (a scoped Owner exception).
 */
@Injectable()
export class CostCenterCatalogueService {
  constructor(private readonly repo: CostCenterRepo) {}

  createUnitForInstallation(tx: DbTx, input: CreateCostCenterInput): Promise<{ id: string }> {
    return this.repo.createCostCenter(tx, input);
  }

  isDirectionActivated(tx?: DbTx): Promise<boolean> {
    return this.repo.isDirectionActivated(tx);
  }

  departmentsWithoutCostCenter(tx?: DbTx): Promise<{ id: string; code: string; name: string }[]> {
    return this.repo.departmentsWithoutCostCenter(tx);
  }

  findByCode(tx: DbTx, organizationId: string, code: string): Promise<CostCenterRecord | null> {
    return this.repo.findByCode(tx, organizationId, code);
  }

  findBriefs(ids: readonly string[], tx?: DbTx): Promise<CostCenterBrief[]> {
    return this.repo.findBriefs(ids, tx);
  }

  findBriefsByCodes(codes: readonly string[], tx?: DbTx): Promise<CostCenterBrief[]> {
    return this.repo.findBriefsByCodes(codes, tx);
  }

  lockSharedBriefs(tx: DbTx, ids: readonly string[]): Promise<CostCenterBrief[]> {
    return this.repo.lockSharedBriefs(tx, ids);
  }
}
