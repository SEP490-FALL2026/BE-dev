import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { VersionBodyDto, VersionPatchDto } from '../budget/budget.dto';
import { BudgetQuartersMismatchError, BudgetReasonRequiredError } from '../budget/budget.errors';
import { quartersMatch, quartersMismatchAfter } from '../budget/budget.policy';
import { BudgetFactsService } from '../budget/budget-facts.service';
import type { VersionPatch, VersionRecord } from '../budget/version.repo';

type Quarters = [bigint, bigint, bigint, bigint];
type QuartersBody = NonNullable<VersionBodyDto['quarters']>;
type MoneyBody = { amount: string; currency: string };

/**
 * The figures of a version as Finance gives them (`US-06-09`): the base and the reserve, the amount over which a line is high value, and
 * the forecast by quarter, which never limits a payment (`QĐ-82e`) but must add up to the base and the reserve. Throws the money errors and
 * BudgetQuartersMismatchError.
 */
@Injectable()
export class VersionFigures {
  constructor(private readonly facts: BudgetFactsService) {}

  /** The figures of a new version: what Finance gave, or what the version it follows had. */
  async figures(
    tx: DbTx,
    currency: string,
    input: {
      base: MoneyBody | undefined;
      reserve: MoneyBody | undefined;
      highValuePercent: number | undefined;
      highValueAmount?: MoneyBody | null | undefined;
      quarters?: QuartersBody | null | undefined;
    },
    fallback?: VersionRecord,
  ) {
    const baseMinor = await this.amount(tx, input.base, currency, fallback?.baseMinor);
    const reserveMinor = await this.amount(tx, input.reserve, currency, fallback?.reserveMinor);
    const quarters = input.quarters ? await this.quarters(tx, input.quarters, currency) : null;
    if (quarters && !quartersMatch(baseMinor + reserveMinor, quarters)) throw new BudgetQuartersMismatchError();

    return {
      baseMinor,
      reserveMinor,
      highValuePercent: input.highValuePercent ?? fallback?.highValuePercent ?? 0,
      highValueAmountMinor: await this.highValueAmount(tx, input.highValueAmount, currency, fallback),
      quarters,
    };
  }

  /** What an edit of a version changes, in money; the reason of a revision is changed, never taken away. */
  async patchOf(tx: DbTx, version: VersionRecord, patch: VersionPatchDto): Promise<VersionPatch> {
    if (patch.reason === null && version.kind === 'REVISION') throw new BudgetReasonRequiredError('REVISION');
    const reporting = version.currency;
    const next: VersionPatch = {};
    if (patch.base) next.baseMinor = await this.facts.money(patch.base, reporting, tx);
    if (patch.reserve) next.reserveMinor = await this.facts.money(patch.reserve, reporting, tx);
    if (patch.highValuePercent !== undefined) next.highValuePercent = patch.highValuePercent;
    if (patch.highValueAmount !== undefined) {
      next.highValueAmountMinor =
        patch.highValueAmount === null ? null : await this.facts.positiveMoney(patch.highValueAmount, reporting, tx);
    }
    if (patch.quarters !== undefined) next.quarters = await this.quarters(tx, patch.quarters, reporting);
    if (patch.reason !== undefined) next.reason = patch.reason;
    if (quartersMismatchAfter(version, next)) throw new BudgetQuartersMismatchError();

    return next;
  }

  /** The amount Finance gave, or the one of the version this follows, or nothing. */
  private async amount(tx: DbTx, given: MoneyBody | undefined, currency: string, fallback: bigint | undefined) {
    return given ? this.facts.money(given, currency, tx) : (fallback ?? 0n);
  }

  private async highValueAmount(
    tx: DbTx,
    given: MoneyBody | null | undefined,
    currency: string,
    fallback: VersionRecord | undefined,
  ): Promise<bigint | null> {
    if (given === undefined) return fallback?.highValueAmountMinor ?? null;

    return given === null ? null : this.facts.positiveMoney(given, currency, tx);
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
