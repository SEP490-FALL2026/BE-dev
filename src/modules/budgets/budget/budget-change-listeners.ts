import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { BudgetChangeListener, BudgetVersionEvent, PlanLineMovedEvent } from '../budgets.types';
import { VersionRepo } from './version.repo';

/** The contexts that hear when a budget changes, told in the transaction of the change (`BudgetChangeListener`). */
@Injectable()
export class BudgetChangeListeners {
  private readonly listeners: BudgetChangeListener[] = [];

  constructor(private readonly versions: VersionRepo) {}

  register(listener: BudgetChangeListener): void {
    this.listeners.push(listener);
  }

  async versionApproved(tx: DbTx, actor: AuthenticatedPrincipal, event: BudgetVersionEvent): Promise<void> {
    for (const listener of this.listeners) await listener.versionApproved(tx, actor, event);
  }

  async versionRefused(tx: DbTx, actor: AuthenticatedPrincipal, event: BudgetVersionEvent): Promise<void> {
    for (const listener of this.listeners) await listener.versionRefused(tx, actor, event);
  }

  async planLineMoved(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    event: Omit<PlanLineMovedEvent, 'versionIds'>,
  ): Promise<void> {
    if (this.listeners.length === 0) return;
    const versionIds = await this.versions.idsOf(tx, event.costCenterId, event.year);
    for (const listener of this.listeners) await listener.planLineMoved(tx, actor, { ...event, versionIds });
  }
}
