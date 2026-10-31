import { Injectable } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { BudgetSupportService } from '../budget/budget-support.service';
import {
  chunkSnapshots,
  figureChange,
  lineChange,
  lineSnapshot,
  type FigureFacts,
  type HistoryChange,
  type LineFacts,
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
    private readonly support: BudgetSupportService,
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

  /** A line was edited, or its purchase window was moved (the move keeps its own record of the reason beside this one). */
  async lineEdited(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    version: VersionRecord,
    input: { kind: 'LINE_UPDATED' | 'WINDOW_MOVED'; position: number; before: LineFacts; after: LineFacts },
  ): Promise<HistoryChange | null> {
    const change = lineChange(input.before, input.after, await this.money(version.currency));
    if (change === null) return null;
    await this.entries.append(tx, {
      organizationId: version.organizationId,
      versionId: version.id,
      kind: input.kind,
      versionState: version.state,
      position: input.position,
      before: change.before,
      after: change.after,
      changedByEmployeeId: actor.employeeId,
      now: new Date(),
    });

    return change;
  }

  /**
   * Lines were added or imported, from `firstPosition` in order. An entry holds at most 200 lines and about 240 000 bytes of their
   * text (the table refuses more of either), so a larger file, or lines with long texts, are kept as several entries one after the
   * other, each with its range of positions.
   */
  async linesAdded(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    version: VersionRecord,
    input: { kind: 'LINES_ADDED' | 'LINES_IMPORTED'; firstPosition: number; lines: readonly LineFacts[] },
  ): Promise<void> {
    const money = await this.money(version.currency);
    let position = input.firstPosition;
    const snapshots = input.lines.map((line, index) => lineSnapshot(input.firstPosition + index, line, money));
    for (const chunk of chunkSnapshots(snapshots)) {
      await this.entries.append(tx, {
        organizationId: version.organizationId,
        versionId: version.id,
        kind: input.kind,
        versionState: version.state,
        fromPosition: position,
        toPosition: position + chunk.length - 1,
        lineCount: chunk.length,
        before: null,
        after: chunk,
        changedByEmployeeId: actor.employeeId,
        now: new Date(),
      });
      position += chunk.length;
    }
  }

  private async money(currency: string): Promise<(minor: bigint) => string> {
    const format = await this.support.formatter(currency);

    return (minor) => format(minor).amount;
  }
}
