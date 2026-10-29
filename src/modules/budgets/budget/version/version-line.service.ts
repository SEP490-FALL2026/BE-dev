import { Injectable } from '@nestjs/common';
import { TransactionRunner, type DbTx } from '../../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../../audit/public/audit.api';
import {
  BudgetLineNotFoundError,
  BudgetProposalIncompleteError,
  BudgetReasonRequiredError,
  BudgetRevisionRequiredError,
  BudgetVersionNotCurrentError,
  BudgetVersionNotFoundError,
  BudgetWindowBackwardsError,
} from '../budget.errors';
import { backwardLines, incompleteLines, kindOfChange } from '../budget.policy';
import { BudgetChangeListeners } from '../../public/budgets.extension-points';
import { budgetAuditEvent, BudgetSupportService } from '../budget-support.service';
import { VersionAccessService } from './version-access.service';
import { VersionHistoryService } from './version-history.service';
import { VersionLineRepo, type LinePatch, type VersionLineRecord } from '../version-line.repo';
import { VersionRepo, type VersionRecord } from '../version.repo';
import { VersionViewService } from '../version-view.service';
import type { AddLinesBodyDto, LinePatchDto, VersionLineWire, VersionWire, WindowBodyDto } from '../budget.dto';

/**
 * The lines of a version as Finance works them (`US-06-09`): a comment and an adjustment of a line that comes from the
 * proposal, lines of Finance's own, and the move of the purchase window of a line of the current budget. The line of the
 * proposal a line adjusts stays as it was, and an amount of the current budget is changed only by a revision. Every edit leaves
 * the Audit Trail with what the line was and is, and its entry of the history of the version (F66); a version of a year that has
 * ended is not changed (F62).
 */
@Injectable()
export class VersionLineService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly versions: VersionRepo,
    private readonly lines: VersionLineRepo,
    private readonly views: VersionViewService,
    private readonly support: BudgetSupportService,
    private readonly access: VersionAccessService,
    private readonly history: VersionHistoryService,
    private readonly listeners: BudgetChangeListeners,
    private readonly audit: AuditApi,
  ) {}

  /**
   * Finance comments on a line and adjusts it; a line that comes from the proposal keeps the line of the proposal as it
   * was, and an adjustment of it needs its reason (`US-06-09` AC-14).
   */
  async updateLine(
    actor: AuthenticatedPrincipal,
    id: string,
    position: number,
    patch: LinePatchDto,
  ): Promise<VersionLineWire> {
    this.support.requireFinance(actor);
    const fiscalStart = await this.support.fiscalYearStartMonth();

    return this.runner.run(async (tx) => {
      const version = await this.access.lockEditable(tx, id, fiscalStart);
      const line = await this.lines.findLine(id, position, tx);
      if (!line) throw new BudgetLineNotFoundError();

      const { amount, ...rest } = patch;
      const next: LinePatch = { ...rest };
      if (amount) next.amountMinor = await this.support.money(amount, version.currency, tx);
      const merged = { ...line, ...stripUndefined(next) };
      if (merged.windowTo < merged.windowFrom) throw new BudgetWindowBackwardsError([position]);
      const adjusts = line.proposalPosition !== null && changesTheLine(line, next);
      if (adjusts && !merged.adjustmentReason) throw new BudgetReasonRequiredError('ADJUSTMENT');
      await this.support.requirePlans([next.planId]);

      await this.lines.patchLine(tx, id, position, next);
      const edited = (await this.lines.findLine(id, position, tx)) as VersionLineRecord;
      const change = await this.history.lineEdited(tx, actor, version, {
        kind: 'LINE_UPDATED',
        position,
        before: line,
        after: edited,
      });
      await this.audit.record(
        tx,
        budgetAuditEvent(
          actor,
          version.organizationId,
          'BUDGET_VERSION.LINE_CHANGED',
          'BUDGET_VERSION',
          id,
          { position, ...(change?.after ?? {}) },
          { ...(change?.before ?? {}) },
        ),
      );

      return this.views.lineWire(version, edited);
    });
  }

  /** Finance adds lines of their own to a version being built; they must say what every line says. */
  async addLines(actor: AuthenticatedPrincipal, id: string, body: AddLinesBodyDto): Promise<VersionWire> {
    this.support.requireFinance(actor);
    const fiscalStart = await this.support.fiscalYearStartMonth();

    return this.runner.run(async (tx) => {
      const version = await this.access.lockEditable(tx, id, fiscalStart);
      const drafts = body.lines.map((line) => ({
        description: line.description,
        amountMinor: 0n,
        ...pickWindow(line),
      }));
      const incomplete = incompleteLines(drafts);
      if (incomplete.length > 0) throw new BudgetProposalIncompleteError(incomplete);
      const backwards = backwardLines(drafts);
      if (backwards.length > 0) throw new BudgetWindowBackwardsError(backwards);
      await this.support.requirePlans(body.lines.map((line) => line.planId));

      const lines: Omit<VersionLineRecord, 'position'>[] = [];
      for (const line of body.lines) {
        lines.push({
          proposalId: null,
          proposalPosition: null,
          description: line.description,
          planId: line.planId ?? null,
          seats: line.seats ?? null,
          amountMinor: await this.support.money(line.amount, version.currency, tx),
          windowFrom: line.windowFrom as string,
          windowTo: line.windowTo as string,
          servicePeriodMonths: line.servicePeriodMonths as number,
          repeatCycle: line.repeatCycle as VersionLineRecord['repeatCycle'],
          quoteValidUntil: line.quoteValidUntil ?? null,
          financeComment: line.note ?? null,
          adjustmentReason: null,
        });
      }
      const first = await this.lines.addLines(tx, id, lines);
      await this.history.linesAdded(tx, actor, version, { kind: 'LINES_ADDED', firstPosition: first, lines });
      await this.audit.record(
        tx,
        budgetAuditEvent(actor, version.organizationId, 'BUDGET_VERSION.LINES_ADDED', 'BUDGET_VERSION', id, {
          lines: lines.length,
          fromPosition: first,
          toPosition: first + lines.length - 1,
        }),
      );

      return this.views.wire(await this.requireIn(id, tx));
    });
  }

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
    this.support.requireFinance(actor);
    const fiscalStart = await this.support.fiscalYearStartMonth();

    return this.runner.run(async (tx) => {
      const version = await this.access.lockOfOpenYear(tx, id, fiscalStart);
      if (version.state !== 'APPROVED') throw new BudgetVersionNotCurrentError();
      const line = await this.lines.findLine(id, position, tx);
      if (!line) throw new BudgetLineNotFoundError();

      const amountMinor = body.amount ? await this.support.money(body.amount, version.currency, tx) : undefined;
      const kind = kindOfChange(line, { amountMinor, windowFrom: body.windowFrom, windowTo: body.windowTo });
      if (kind === 'AMOUNT') throw new BudgetRevisionRequiredError();
      if (kind === 'WINDOW') {
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
        await this.tellLineMoved(tx, actor, version, position, body.reason);
      }

      return this.views.lineWire(version, (await this.lines.findLine(id, position, tx)) as VersionLineRecord);
    });
  }

  /** Tells the contexts that listen that a plan line moved; the versions of the year are read only when one listens. */
  private async tellLineMoved(
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

  private async requireIn(id: string, tx: Parameters<VersionRepo['lockById']>[0]): Promise<VersionRecord> {
    const version = await this.versions.findById(id, tx);
    if (!version) throw new BudgetVersionNotFoundError();

    return version;
  }
}

const pickWindow = (line: AddLinesBodyDto['lines'][number]) => ({
  windowFrom: line.windowFrom,
  windowTo: line.windowTo,
  servicePeriodMonths: line.servicePeriodMonths,
  repeatCycle: line.repeatCycle,
});

const stripUndefined = <T extends object>(value: T): Partial<T> =>
  Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as Partial<T>;

/** Whether the patch changes what the line of the proposal said: its words, its money, its window, its service or its cycle. */
function changesTheLine(line: VersionLineRecord, patch: LinePatch): boolean {
  return (
    (patch.description !== undefined && patch.description !== line.description) ||
    (patch.planId !== undefined && patch.planId !== line.planId) ||
    (patch.seats !== undefined && patch.seats !== line.seats) ||
    (patch.amountMinor !== undefined && patch.amountMinor !== line.amountMinor) ||
    (patch.windowFrom !== undefined && patch.windowFrom !== line.windowFrom) ||
    (patch.windowTo !== undefined && patch.windowTo !== line.windowTo) ||
    (patch.servicePeriodMonths !== undefined && patch.servicePeriodMonths !== line.servicePeriodMonths) ||
    (patch.repeatCycle !== undefined && patch.repeatCycle !== line.repeatCycle) ||
    (patch.quoteValidUntil !== undefined && patch.quoteValidUntil !== line.quoteValidUntil)
  );
}
