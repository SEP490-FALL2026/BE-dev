import { Injectable } from '@nestjs/common';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import {
  BudgetLineNotFoundError,
  BudgetProposalIncompleteError,
  BudgetReasonRequiredError,
  BudgetVersionNotFoundError,
  BudgetWindowBackwardsError,
} from '../budget/budget.errors';
import { backwardLines, incompleteLines, patchChangesLine } from '../budget/budget.policy';
import { budgetAuditEvent, BudgetFactsService } from '../budget/budget-facts.service';
import { VersionAccessService } from './version-access.service';
import { VersionHistoryService } from './version-history.service';
import { VersionLineRepo, type LinePatch, type VersionLineRecord } from '../budget/version-line.repo';
import { VersionRepo, type VersionRecord } from '../budget/version.repo';
import { VersionViewService } from '../budget/version-view.service';
import type { AddLinesBodyDto, LinePatchDto, VersionLineWire, VersionWire } from '../budget/budget.dto';

/**
 * The lines of a version as Finance works them (`US-06-09`): a comment and an adjustment of a line that comes from the
 * proposal, lines of Finance's own, and the move of the purchase window of a line of the current budget. The line of the
 * proposal a line adjusts stays as it was, and an amount of the current budget is changed only by a revision. Every edit leaves
 * the Audit Trail with what the line was and is, and its entry of the history of the version; a version of a year that has
 * ended is not changed.
 */
@Injectable()
export class VersionLineService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly versions: VersionRepo,
    private readonly lines: VersionLineRepo,
    private readonly views: VersionViewService,
    private readonly facts: BudgetFactsService,
    private readonly access: VersionAccessService,
    private readonly history: VersionHistoryService,
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
    this.facts.requireFinance(actor);
    const fiscalStart = await this.facts.fiscalYearStartMonth();

    return this.runner.run(async (tx) => {
      const version = await this.access.lockEditable(tx, id, fiscalStart);
      const line = await this.lines.findLine(id, position, tx);
      if (!line) throw new BudgetLineNotFoundError();

      const { amount, ...rest } = patch;
      const next: LinePatch = { ...rest };
      if (amount) next.amountMinor = await this.facts.money(amount, version.currency, tx);
      const merged = { ...line, ...stripUndefined(next) };
      if (merged.windowTo < merged.windowFrom) throw new BudgetWindowBackwardsError([position]);
      const adjusts = line.proposalPosition !== null && patchChangesLine(line, next);
      if (adjusts && !merged.adjustmentReason) throw new BudgetReasonRequiredError('ADJUSTMENT');
      await this.facts.requirePlans([next.planId]);

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
    this.facts.requireFinance(actor);
    const fiscalStart = await this.facts.fiscalYearStartMonth();

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
      await this.facts.requirePlans(body.lines.map((line) => line.planId));

      const lines: Omit<VersionLineRecord, 'position'>[] = [];
      for (const line of body.lines) {
        lines.push({
          proposalId: null,
          proposalPosition: null,
          description: line.description,
          planId: line.planId ?? null,
          seats: line.seats ?? null,
          amountMinor: await this.facts.money(line.amount, version.currency, tx),
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
