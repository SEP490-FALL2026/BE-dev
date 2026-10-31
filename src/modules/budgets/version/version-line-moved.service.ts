import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { VersionRepo, type VersionRecord } from '../budget/version.repo';
import { BudgetChangeListeners } from '../public/budgets.extension-points';

/** Tells the contexts that listen that a plan line of a budget moved (`US-06-09` AC-17): the versions of the year are read only when one listens. */
@Injectable()
export class VersionLineMovedNotifier {
  constructor(
    private readonly versions: VersionRepo,
    private readonly listeners: BudgetChangeListeners,
  ) {}

  async tell(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    version: VersionRecord,
    position: number,
    reason: string,
  ): Promise<void> {
    if (this.listeners.names().length === 0) return;
    const versionIds = await this.versions.idsOf(tx, version.costCenterId, version.year);
    await this.listeners.emit(tx, {
      kind: 'PLAN_LINE_MOVED',
      actor,
      event: { costCenterId: version.costCenterId, year: version.year, position, reason, versionIds },
    });
  }
}
