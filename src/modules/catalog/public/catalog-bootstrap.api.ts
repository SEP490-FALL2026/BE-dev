import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { FunctionalGroupRepo } from '../functional-group/functional-group.repo';

/**
 * What the installation command asks of the catalog when it makes an organization (`QĐ-111bf`): the seven standard functional groups
 * every application stands in one of. It writes in the caller's transaction and nothing else of the catalog.
 */
@Injectable()
export class CatalogBootstrapApi {
  constructor(private readonly groups: FunctionalGroupRepo) {}

  /** Writes the standard groups of the organization; a group it already has is left alone. Returns how many were written. */
  seedStandardFunctionalGroups(tx: DbTx, organizationId: string): Promise<number> {
    return this.groups.insertStandard(tx, organizationId);
  }
}
