import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { ApprovalRoleChange, ApprovalRoleChangeListener } from '../identity-access.types';

/**
 * The modules that act when an approval role or the role of Finance changes hands, told in the transaction of the change
 * (`FR-3.16`). The one provider of the facade module, so the API and the worker each hear the changes of their own graph.
 */
@Injectable()
export class ApprovalRoleChangeRegistry {
  private readonly listeners: ApprovalRoleChangeListener[] = [];

  register(listener: ApprovalRoleChangeListener): void {
    this.listeners.push(listener);
  }

  /** Calls every listener in the order it registered; one that throws ends the announcement and the transaction rolls back. */
  async announce(tx: DbTx, change: Omit<ApprovalRoleChange, 'id'>): Promise<ApprovalRoleChange> {
    const announced = { ...change, id: randomUUID() };
    for (const listener of this.listeners) await listener.onChange(tx, announced);

    return announced;
  }
}
