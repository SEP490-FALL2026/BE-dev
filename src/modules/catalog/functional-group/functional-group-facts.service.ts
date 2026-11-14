import { Injectable } from '@nestjs/common';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import { DEFAULT_GROUP_KEY } from './functional-group-standard.policy';
import { FunctionalGroupRepo } from './functional-group.repo';

/** What an application declaration needs from the functional groups: one that can be chosen and stays active. */
@Injectable()
export class FunctionalGroupFactsService {
  constructor(private readonly groups: FunctionalGroupRepo) {}

  /** The group when it exists and is active; locked `FOR SHARE` until the caller's transaction ends. */
  findActive(tx: DbTx, id: string): Promise<{ id: string; name: string } | null> {
    return this.groups.findActiveShared(tx, id);
  }

  /** The group an application declared with none is put in (`Khác`, `QĐ-111d`), locked `FOR SHARE`; null when the organization has none yet. */
  findDefault(tx: DbTx, organizationId: string): Promise<{ id: string; name: string } | null> {
    return this.groups.findFixedShared(tx, organizationId, DEFAULT_GROUP_KEY);
  }
}
