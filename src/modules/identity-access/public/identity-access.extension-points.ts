import { Injectable } from '@nestjs/common';
import { Listeners } from '../../../core/extension/listeners';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { ApprovalRoleChange } from './identity-access.types';

// The points identity-access opens for the modules above it (`core/extension`): they add to them from a `*.listener.ts` when
// their module starts, so identity-access never imports them. One instance of each per application.

/**
 * A module that acts when an approval role or the role of Finance changes hands. It is called in the transaction of the change,
 * in the order the listeners were added; throwing rolls the change back with it.
 */
export interface ApprovalRoleChangeListener {
  onChange(tx: DbTx, change: ApprovalRoleChange): Promise<void>;
}

/**
 * The modules told when an approval role or the role of Finance changes hands, in the transaction of the change (`FR-3.16`): the
 * account services emit it with an `id` made for the change. Held by the facade module, so the API and the worker each hear the
 * changes of their own graph; with nobody added a change is told to nobody.
 */
@Injectable()
export class ApprovalRoleChangeListeners extends Listeners<ApprovalRoleChange, DbTx> {
  constructor() {
    super('identity-access.approval-role-change-listeners');
  }
}
