import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { VersionPatchDto } from '../budget/budget.dto';
import { BudgetBaseReasonRequiredError } from '../budget/budget.errors';
import { defaultReserveOf } from '../budget/budget.policy';
import { BudgetFactsService } from '../budget/budget-facts.service';
import type { VersionPatch, VersionRecord } from '../budget/version.repo';

type MoneyBody = { amount: string; currency?: string };

/**
 * The figures of a version as Finance gives them (`US-06-09`, `QĐ-111ac`): the base and the reserve, one amount for the whole year (no quarters).
 * Throws the money errors.
 */
@Injectable()
export class VersionFigures {
  constructor(private readonly facts: BudgetFactsService) {}

  /** The figures of a new version: what Finance gave, and the default share of the base for the reserve when none is given. */
  async figures(
    tx: DbTx,
    currency: string,
    input: {
      base: MoneyBody | undefined;
      reserve?: MoneyBody | undefined;
      reserveReason?: string | undefined;
      /** The share of the base the reserve defaults to now. */
      defaultPercent: number;
    },
  ) {
    const baseMinor = input.base ? await this.facts.money(input.base, currency, tx) : 0n;
    const reserveMinor = input.reserve
      ? await this.facts.money(input.reserve, currency, tx)
      : defaultReserveOf(baseMinor, input.defaultPercent);

    return {
      baseMinor,
      reserveMinor,
      reservePercent: input.defaultPercent,
      reserveReason: input.reserveReason?.trim() || null,
    };
  }

  /** What an edit of a version changes, in money. */
  async patchOf(tx: DbTx, version: VersionRecord, patch: VersionPatchDto): Promise<VersionPatch> {
    const next: VersionPatch = {};
    await this.moneyPatch(tx, version, patch, next);
    if (patch.reserveReason !== undefined) next.reserveReason = patch.reserveReason?.trim() || null;

    return next;
  }

  /** The base and the reserve of an edit: the base moves with its reason, and the reserve follows it while it is the default share. */
  private async moneyPatch(
    tx: DbTx,
    version: VersionRecord,
    patch: VersionPatchDto,
    next: VersionPatch,
  ): Promise<void> {
    const reporting = version.currency;
    if (patch.base) next.baseMinor = await this.facts.money(patch.base, reporting, tx);
    // The base moves only with the reason why (`QĐ-100v`): a base the draft already has needs none.
    if (next.baseMinor !== undefined && next.baseMinor !== version.baseMinor) {
      const reason = patch.baseReason?.trim();
      if (!reason) throw new BudgetBaseReasonRequiredError();
      next.baseReason = reason;
    }
    if (patch.reserve) next.reserveMinor = await this.facts.money(patch.reserve, reporting, tx);
    // A reserve that is still the default share of the base follows the base when only the base changes: it stays the default (B-M3).
    if (next.baseMinor !== undefined && next.reserveMinor === undefined && version.reservePercent !== null) {
      const wasDefault = version.reserveMinor === defaultReserveOf(version.baseMinor, version.reservePercent);
      if (wasDefault) next.reserveMinor = defaultReserveOf(next.baseMinor, version.reservePercent);
    }
  }
}
