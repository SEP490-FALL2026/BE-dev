import { Injectable } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { BudgetFactsService } from '../budget/budget-facts.service';
import {
  attachmentAdded,
  attachmentRemoved,
  figureChange,
  type FigureFacts,
  type HistoryChange,
} from './version-history.policy';
import { VersionHistoryRepo } from './version-history.repo';
import type { VersionRecord } from '../budget/version.repo';

/**
 * Writes the history of the edits of a version (`QĐ-91d`): one entry for each edit, in the transaction of the edit,
 * after the row of the version is locked. It returns what the edit changed so that the Audit Trail of the same edit says the same
 * before and after; an edit that changed nothing writes no entry. The Audit Trail is the audit; this is what Finance and the
 * spending approver read.
 */
@Injectable()
export class VersionHistoryService {
  constructor(
    private readonly entries: VersionHistoryRepo,
    private readonly facts: BudgetFactsService,
  ) {}

  /** The figures of the version were edited: `before` was read before the edit and `after` is what it wrote. */
  async figuresEdited(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    version: VersionRecord,
    before: FigureFacts,
    after: FigureFacts,
  ): Promise<HistoryChange | null> {
    const change = figureChange(before, after, await this.money(version.currency));
    if (change === null) return null;
    await this.entries.append(tx, {
      organizationId: version.organizationId,
      versionId: version.id,
      kind: 'FIGURES_UPDATED',
      versionState: version.state,
      before: change.before,
      after: change.after,
      changedByEmployeeId: actor.employeeId,
      now: new Date(),
    });

    return change;
  }

  async attachmentAdded(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    version: VersionRecord,
    facts: { attachmentId: string; fileName: string; contentType: string; sizeBytes: number },
  ): Promise<void> {
    const entry = attachmentAdded(facts);
    await this.entries.append(tx, {
      organizationId: version.organizationId,
      versionId: version.id,
      kind: 'ATTACHMENT_ADDED',
      versionState: version.state,
      before: entry.before,
      after: entry.after,
      changedByEmployeeId: actor.employeeId,
      now: new Date(),
    });
  }

  async attachmentRemoved(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    version: VersionRecord,
    facts: { attachmentId: string; fileName: string; contentType: string; sizeBytes: number },
  ): Promise<void> {
    const entry = attachmentRemoved(facts);
    await this.entries.append(tx, {
      organizationId: version.organizationId,
      versionId: version.id,
      kind: 'ATTACHMENT_REMOVED',
      versionState: version.state,
      before: entry.before,
      after: entry.after,
      changedByEmployeeId: actor.employeeId,
      now: new Date(),
    });
  }

  private async money(currency: string): Promise<(minor: bigint) => string> {
    const format = await this.facts.formatter(currency);

    return (minor) => format(minor).amount;
  }
}
