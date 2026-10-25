import { Injectable } from '@nestjs/common';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditService } from '../../audit/audit.service';
import {
  BudgetLineNotFoundError,
  BudgetProposalIncompleteError,
  BudgetReasonRequiredError,
  BudgetRevisionRequiredError,
  BudgetVersionNotCurrentError,
  BudgetVersionNotEditableError,
  BudgetVersionNotFoundError,
  BudgetWindowBackwardsError,
} from './budget.errors';
import { backwardLines, incompleteLines, isEditable, kindOfChange } from './budget.policy';
import { BudgetChangeListeners } from './budget-change-listeners';
import { budgetAuditEvent, BudgetSupportService } from './budget-support.service';
import { VersionLineRepo, type LinePatch, type VersionLineRecord } from './version-line.repo';
import { VersionRepo, type VersionRecord } from './version.repo';
import { VersionViewService } from './version-view.service';
import type { AddLinesBodyDto, LinePatchDto, VersionLineWire, VersionWire, WindowBodyDto } from './budget.dto';

/**
 * The lines of a version as Finance works them (`US-06-09`): a comment and an adjustment of a line that comes from the
 * proposal, lines of Finance's own, and the move of the purchase window of a line of the current budget. The line of the
 * proposal a line adjusts stays as it was, and an amount of the current budget is changed only by a revision.
 */
@Injectable()
export class VersionLineService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly versions: VersionRepo,
    private readonly lines: VersionLineRepo,
    private readonly views: VersionViewService,
    private readonly support: BudgetSupportService,
    private readonly listeners: BudgetChangeListeners,
    private readonly audit: AuditService,
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
    return this.runner.run(async (tx) => {
      const version = await this.editable(tx, id);
      const line = await this.lines.findLine(id, position, tx);
      if (!line) throw new BudgetLineNotFoundError();

      const { amount, ...rest } = patch;
      const next: LinePatch = { ...rest };
      if (amount) next.amountMinor = await this.support.money(amount, version.currency, tx);
      const merged = { ...line, ...stripUndefined(next) };
      if (merged.windowTo < merged.windowFrom) throw new BudgetWindowBackwardsError([position]);
      const adjusts = line.proposalPosition !== null && changesTheLine(line, next);
      if (adjusts && !merged.adjustmentReason) throw new BudgetReasonRequiredError('ADJUSTMENT');

      await this.lines.patchLine(tx, id, position, next);
      await this.audit.record(
        tx,
        budgetAuditEvent(actor, version.organizationId, 'BUDGET_VERSION.LINE_CHANGED', 'BUDGET_VERSION', id, {
          position,
          fields: Object.keys(patch).join(','),
        }),
      );

      return this.views.lineWire(version, (await this.lines.findLine(id, position, tx)) as VersionLineRecord);
    });
  }

  /** Finance adds lines of their own to a version being built; they must say what every line says. */
  async addLines(actor: AuthenticatedPrincipal, id: string, body: AddLinesBodyDto): Promise<VersionWire> {
    return this.runner.run(async (tx) => {
      const version = await this.editable(tx, id);
      const drafts = body.lines.map((line) => ({
        description: line.description,
        amountMinor: 0n,
        ...pickWindow(line),
      }));
      const incomplete = incompleteLines(drafts);
      if (incomplete.length > 0) throw new BudgetProposalIncompleteError(incomplete);
      const backwards = backwardLines(drafts);
      if (backwards.length > 0) throw new BudgetWindowBackwardsError(backwards);

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
      await this.lines.addLines(tx, id, lines);
      await this.audit.record(
        tx,
        budgetAuditEvent(actor, version.organizationId, 'BUDGET_VERSION.LINES_ADDED', 'BUDGET_VERSION', id, {
          lines: lines.length,
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
    return this.runner.run(async (tx) => {
      const version = await this.versions.lockById(tx, id);
      if (!version) throw new BudgetVersionNotFoundError();
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
        await this.audit.record(
          tx,
          budgetAuditEvent(actor, version.organizationId, 'BUDGET_VERSION.WINDOW_MOVED', 'BUDGET_VERSION', id, {
            position,
            from: `${line.windowFrom}/${line.windowTo}`,
            to: `${after.windowFrom}/${after.windowTo}`,
            reason: body.reason,
          }),
        );
        // A request that waited for the window to move is checked again in this transaction (`US-06-09` AC-17).
        await this.listeners.planLineMoved(tx, actor, {
          costCenterId: version.costCenterId,
          year: version.year,
          position,
          reason: body.reason,
        });
      }

      return this.views.lineWire(version, (await this.lines.findLine(id, position, tx)) as VersionLineRecord);
    });
  }

  /** The version, locked, and only if Finance may still change it. */
  private async editable(tx: Parameters<VersionRepo['lockById']>[0], id: string): Promise<VersionRecord> {
    const version = await this.versions.lockById(tx, id);
    if (!version) throw new BudgetVersionNotFoundError();
    if (!isEditable(version.state)) throw new BudgetVersionNotEditableError(version.state);

    return version;
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
