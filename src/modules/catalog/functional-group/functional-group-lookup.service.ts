import { Injectable } from '@nestjs/common';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import { FunctionalGroupRepo } from './functional-group.repo';

/** What an application declaration needs from the functional groups: one that can be chosen and stays active. */
@Injectable()
export class FunctionalGroupLookupService {
  constructor(private readonly groups: FunctionalGroupRepo) {}

  /** The group when it exists and is active; locked `FOR SHARE` until the caller's transaction ends. */
  findActive(tx: DbTx, id: string): Promise<{ id: string; name: string } | null> {
    return this.groups.findActiveShared(tx, id);
  }
}
