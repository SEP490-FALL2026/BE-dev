import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { CatalogApi } from '../../catalog/public/catalog.api';
import { OperatingParametersApi } from '../../operating-parameters/public/operating-parameters.api';
import { BudgetCycleNotPublishedError, BudgetProposalLinesInvalidError } from '../budget/budget.errors';
import { BudgetFactsService } from '../budget/budget-facts.service';
import type { ProposalLineRecord } from '../budget/proposal.repo';
import { monthlyUnitPrice } from '../cycle/baseline.policy';
import { cycleAcceptsWork } from '../cycle/cycle.policy';
import { CycleRepo, type CycleRecord } from '../cycle/cycle.repo';
import {
  duplicateRankPositions,
  overCeilingNoteMissing,
  overCeilingParts,
  zbbMissingPositions,
  type RuledLine,
  type ZbbContext,
} from './proposal-line-rules.policy';

/** A line as the head sent it, before the server flags it. */
export type ProposalLineDraft = Omit<ProposalLineRecord, 'position'>;

/**
 * The rules of the lines of `BM-10` that need more than the line (`QT 4.4`, `QT 4.5`, `R-I05`): each priority rank is given once, the
 * zero-based-budget explanation is there where the rules ask for it, and the lines that carry the proposal over the department's ceiling
 * are flagged with the part that goes over and say why. The ceiling is the one that was published (`S4-01`); a `CANCEL` line is neither
 * added nor flagged (`QĐ-109c`). Being over the ceiling never refuses a proposal. Pure decisions live in `proposal-line-rules.policy`.
 */
@Injectable()
export class ProposalLineJudge {
  constructor(
    private readonly parameters: OperatingParametersApi,
    private readonly catalog: CatalogApi,
    private readonly cycles: CycleRepo,
    private readonly facts: BudgetFactsService,
  ) {}

  /**
   * A head proposes only once the cycle of the year was published, and may go on while it is changed (`Q-02`). The cycle is read
   * `FOR SHARE`, so a change of it waits for the sending. It is taken first, before the proposal and the year (the order of the
   * module: cycle, proposal, version, year). Returns the cycle, whose published ceilings the lines are judged against (`S4-01`).
   * Throws BudgetCycleNotPublishedError.
   */
  async requirePublishedCycle(tx: DbTx, year: number): Promise<CycleRecord> {
    const cycle = await this.cycles.lockByYear(tx, await this.facts.organizationId(tx), year, 'SHARE');
    if (!cycle || !cycleAcceptsWork(cycle)) throw new BudgetCycleNotPublishedError(year);

    return cycle;
  }

  /**
   * Returns the lines with `overCeilingMinor` set. Throws BudgetProposalLinesInvalidError with `PRIORITY_RANK_INVALID`, `ZBB_REQUIRED` or
   * `OVER_CEILING_NOTE_REQUIRED`, naming the positions (from 1, as sent).
   */
  async judge(
    tx: DbTx,
    input: { lines: readonly ProposalLineDraft[]; ceilingMinor: bigint | null; currency: string; now: Date },
  ): Promise<ProposalLineDraft[]> {
    const ruled: RuledLine[] = input.lines.map((line, index) => ({ ...line, position: index + 1 }));
    const duplicates = duplicateRankPositions(ruled);
    if (duplicates.length > 0) throw new BudgetProposalLinesInvalidError('PRIORITY_RANK_INVALID', duplicates);

    const missing = zbbMissingPositions(ruled, await this.zbbContext(tx, ruled, input.currency, input.now));
    if (missing.length > 0) throw new BudgetProposalLinesInvalidError('ZBB_REQUIRED', missing);

    const flagged = overCeilingParts(ruled, input.ceilingMinor);
    const noNote = overCeilingNoteMissing(ruled, flagged);
    if (noNote.length > 0) throw new BudgetProposalLinesInvalidError('OVER_CEILING_NOTE_REQUIRED', noNote);

    return input.lines.map((line, index) => ({ ...line, overCeilingMinor: flagged.get(index + 1) ?? null }));
  }

  private async zbbContext(tx: DbTx, lines: readonly RuledLine[], currency: string, now: Date): Promise<ZbbContext> {
    const kpi3Below = await this.parameters.getValueAt('BUDGET_ZBB_KPI3_BELOW_PERCENT', now, tx);
    const priceIncrease = await this.parameters.getValueAt('BUDGET_ZBB_PRICE_INCREASE_PERCENT', now, tx);

    return {
      // TẠM CHỌN: usage is not collected yet (W6), so no plan has a KPI-3 figure and the rule waits for one.
      kpi3ByPlan: new Map<string, number>(),
      kpi3BelowPercent: Number(kpi3Below),
      priceIncreasePercent: Number(priceIncrease),
      monthlyPriceByPlan: await this.monthlyPrices(tx, lines, currency),
    };
  }

  /**
   * The monthly price of a seat of each plan the lines name, as the main subscription of the plan has it now converted to the reporting
   * currency (`M-17`): the converted price it recorded, or its own price when that is already in the reporting currency; a plan with
   * neither, or one bought once, has none.
   */
  private async monthlyPrices(tx: DbTx, lines: readonly RuledLine[], currency: string): Promise<Map<string, bigint>> {
    const planIds = [
      ...new Set(
        lines.flatMap((line) => (line.planId !== null && line.seats !== null && line.seats > 0 ? [line.planId] : [])),
      ),
    ];
    const prices = new Map<string, bigint>();
    for (const planId of planIds) {
      const price = await this.catalog.getPlanPrice(planId, tx);
      if (price?.kind !== 'RECURRING') continue;
      const converted = [price.reportingUnitPrice, price.unitPrice].find((unit) => unit?.currency === currency);
      if (converted === undefined || converted === null) continue;
      const monthly = monthlyUnitPrice(converted.amountMinor, price.billingCycle);
      if (monthly !== null) prices.set(planId, monthly);
    }

    return prices;
  }
}
