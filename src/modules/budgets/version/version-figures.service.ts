import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { VersionBodyDto, VersionPatchDto } from '../budget/budget.dto';
import { BudgetQuartersMismatchError } from '../budget/budget.errors';
import { defaultReserveOf, quartersMatch, quartersMismatchAfter } from '../budget/budget.policy';
import { BudgetFactsService } from '../budget/budget-facts.service';
import type { VersionPatch, VersionRecord } from '../budget/version.repo';

type Quarters = [bigint, bigint, bigint, bigint];
type QuartersBody = NonNullable<VersionBodyDto['quarters']>;
type MoneyBody = { amount: string; currency?: string };

/**
 * The figures of a version as Finance gives them (`US-06-09`): the base and the reserve, and
 * the forecast by quarter, which never limits a payment (`QĐ-82e`) but must add up to the base and the reserve. Throws the money errors and
 * BudgetQuartersMismatchError.
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
      quarters?: QuartersBody | null | undefined;
    },
  ) {
    const baseMinor = input.base ? await this.facts.money(input.base, currency, tx) : 0n;
    const reserveMinor = input.reserve
      ? await this.facts.money(input.reserve, currency, tx)
      : defaultReserveOf(baseMinor, input.defaultPercent);
    const quarters = input.quarters ? await this.quarters(tx, input.quarters, currency) : null;
    if (quarters && !quartersMatch(baseMinor + reserveMinor, quarters)) throw new BudgetQuartersMismatchError();

    return {
      baseMinor,
      reserveMinor,
      reservePercent: input.defaultPercent,
      reserveReason: input.reserveReason?.trim() || null,
      quarters,
    };
  }

  /** What an edit of a version changes, in money. */
  async patchOf(tx: DbTx, version: VersionRecord, patch: VersionPatchDto): Promise<VersionPatch> {
    const reporting = version.currency;
    const next: VersionPatch = {};
    if (patch.base) next.baseMinor = await this.facts.money(patch.base, reporting, tx);
    if (patch.reserve) next.reserveMinor = await this.facts.money(patch.reserve, reporting, tx);
    // A reserve that is still the default share of the base follows the base when only the base changes: it stays the default (B-M3).
    if (next.baseMinor !== undefined && next.reserveMinor === undefined && version.reservePercent !== null) {
      const wasDefault = version.reserveMinor === defaultReserveOf(version.baseMinor, version.reservePercent);
      if (wasDefault) next.reserveMinor = defaultReserveOf(next.baseMinor, version.reservePercent);
    }
    if (patch.reserveReason !== undefined) next.reserveReason = patch.reserveReason?.trim() || null;
    if (patch.quarters !== undefined) next.quarters = await this.quarters(tx, patch.quarters, reporting);
    if (quartersMismatchAfter(version, next)) throw new BudgetQuartersMismatchError();

    return next;
  }

  private async quarters(tx: DbTx, input: QuartersBody | null, currency: string): Promise<Quarters | null> {
    if (input === null) return null;

    return [
      await this.facts.money(input.q1, currency, tx),
      await this.facts.money(input.q2, currency, tx),
      await this.facts.money(input.q3, currency, tx),
      await this.facts.money(input.q4, currency, tx),
    ];
  }
}
