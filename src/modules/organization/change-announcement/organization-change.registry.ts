import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { NewOrganizationChange, OrganizationChange, OrganizationChangeListener } from '../organization.types';

/**
 * The modules that act on a change of the organization, told in the transaction of the change (`FR-3.16`). One instance per
 * graph, because `OrganizationModule` is the only provider: the API and the worker each register their own listeners at
 * start, and whoever writes a change announces it here through the facade.
 */
@Injectable()
export class OrganizationChangeRegistry {
  private readonly listeners: OrganizationChangeListener[] = [];

  register(listener: OrganizationChangeListener): void {
    this.listeners.push(listener);
  }

  /**
   * Calls every listener in the order it registered; one that throws ends the announcement and the transaction rolls back.
   * `id` is the identity of the change the listeners see: the announcement row gives it, so it is the same on every path.
   */
  async announce(tx: DbTx, change: NewOrganizationChange, id: string = randomUUID()): Promise<void> {
    const announced: OrganizationChange = { ...change, id };
    for (const listener of this.listeners) await listener.onChange(tx, announced);
  }
}
