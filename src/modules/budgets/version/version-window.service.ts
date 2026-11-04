import { Injectable } from '@nestjs/common';
import { TransactionRunner, type DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import {
  BudgetLineNotFoundError,
  BudgetReasonRequiredError,
  BudgetRevisionRequiredError,
  BudgetVersionNotCurrentError,
  BudgetWindowBackwardsError,
} from '../budget/budget.errors';
import { kindOfChange } from '../budget/budget.policy';
import { budgetAuditEvent, BudgetFactsService } from '../budget/budget-facts.service';
import { VersionLineRepo, type VersionLineRecord } from '../budget/version-line.repo';
import { VersionViewService } from '../budget/version-view.service';
import type { VersionRecord } from '../budget/version.repo';
import type { VersionLineWire, WindowBodyDto } from '../budget/budget.dto';
import { VersionAccessService } from './version-access.service';
import { VersionHistoryService } from './version-history.service';
import { VersionLineMovedNotifier } from './version-line-moved.service';

/**
 * Finance moves the purchase window of a line of the current budget, with the reason, and the move is kept with what it was before
 * (`US-06-09` AC-17). An amount is not changed here, even only to update a price: that is a revision, which goes the whole way to the
 * spending approver again (`INV-21`).
 */
@Injectable()
export class VersionWindowService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly lines: VersionLineRepo,
    private readonly views: VersionViewService,
    private readonly facts: BudgetFactsService,
    private readonly access: VersionAccessService,
    private readonly history: VersionHistoryService,
    private readonly moved: VersionLineMovedNotifier,
    private readonly audit: AuditApi,
  ) {}

  /**
   * Finance moves the purchase window of a line of the current budget, with the reason, and the move is kept with what it
   * was before (`US-06-09` AC-17). An amount is not changed here, even only to update a price: that is a revision, which
   * goes the whole way to the spending approver again (`INV-21`).
   */
  async changeWindow(
    actor: AuthenticatedPrincipal,
    id: string,
    position: number,
    body: WindowBodyDto,
  ): Promise<VersionLineWire> {
    this.facts.requireFinance(actor);
    const fiscalStart = await this.facts.fiscalYearStartMonth();

    return this.runner.run(async (tx) => {
      const version = await this.access.lockOfOpenYear(tx, id, fiscalStart);
      if (version.state !== 'APPROVED') throw new BudgetVersionNotCurrentError();
      const line = await this.lines.findLine(id, position, tx);
      if (!line) throw new BudgetLineNotFoundError();

      const amountMinor = body.amount ? await this.facts.money(body.amount, version.currency, tx) : undefined;
      const kind = kindOfChange(line, { amountMinor, windowFrom: body.windowFrom, windowTo: body.windowTo });
      if (kind === 'AMOUNT') throw new BudgetRevisionRequiredError();
      if (kind === 'WINDOW') await this.moveWindow(tx, actor, { version, line, position, body });

      return this.views.lineWire(version, (await this.lines.findLine(id, position, tx)) as VersionLineRecord);
    });
  }

  /** The window of the line is moved, with the reason; what it was before is kept, and whoever waited for it is told. */
  private async moveWindow(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    move: { version: VersionRecord; line: VersionLineRecord; position: number; body: WindowBodyDto },
  ): Promise<void> {
    const { version, line, position, body } = move;
    const id = version.id;
    if (!body.reason) throw new BudgetReasonRequiredError('WINDOW');
    const after = { windowFrom: body.windowFrom ?? line.windowFrom, windowTo: body.windowTo ?? line.windowTo };
    if (after.windowTo < after.windowFrom) throw new BudgetWindowBackwardsError([position]);

    await this.lines.patchLine(tx, id, position, after);
    await this.lines.addLineChange(tx, {
      versionId: id,
      position,
      before: { windowFrom: line.windowFrom, windowTo: line.windowTo },
      after,
      reason: body.reason,
      changedByEmployeeId: actor.employeeId,
      now: new Date(),
    });
    const change = await this.history.lineEdited(tx, actor, version, {
      kind: 'WINDOW_MOVED',
      position,
      before: line,
      after: { ...line, ...after },
    });
    await this.audit.record(
      tx,
      budgetAuditEvent(
        actor,
        version.organizationId,
        'BUDGET_VERSION.WINDOW_MOVED',
        'BUDGET_VERSION',
        id,
        { position, ...(change?.after ?? {}), reason: body.reason },
        { ...(change?.before ?? {}) },
      ),
    );
    // A request that waited for the window to move is checked again in this transaction (`US-06-09` AC-17).
    await this.moved.tell(tx, actor, version, position, body.reason);
  }
}
