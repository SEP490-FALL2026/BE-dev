import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { VersionPatchDto } from '../budget/budget.dto';
import { BudgetBaseReasonRequiredError } from '../budget/budget.errors';
import { defaultReserveOf, versionFiguresOf } from '../budget/budget.policy';
import { BudgetFactsService } from '../budget/budget-facts.service';
import { CarriedOverContributions } from '../public/budgets.extension-points';
import type { VersionPatch, VersionRecord } from '../budget/version.repo';

type MoneyBody = { amount: string; currency?: string };

/**
 * The figures of a version as Finance gives them (`US-06-09`, `QĐ-111ac`): the base (filled in with what the Cost Center carries into the
 * year when none is given) and the reserve as an amount or a share, one amount for the whole year (no quarters). Throws the money errors.
 */
@Injectable()
export class VersionFigures {
  constructor(
    private readonly facts: BudgetFactsService,
    private readonly carried: CarriedOverContributions,
  ) {}

  /** The default share of the organization for the reserve, as it is now: a reserve that is not that share asks its reason when it is sent. */
  defaultPercent(): Promise<number> {
    return this.facts.reserveDefaultPercent();
  }

  /** What the Cost Center carries into the year, as the contexts that add it say; zero when none does. */
  async carriedOverOf(costCenterId: string, year: number, tx?: DbTx): Promise<bigint> {
    return (await this.carried.totals([costCenterId], year, tx)).get(costCenterId) ?? 0n;
  }

  /** The figures of a new version: what Finance gave, the base carried over and the default share of the base when it gave none. */
  async figures(
    tx: DbTx,
    currency: string,
    input: {
      base?: MoneyBody | undefined;
      reserve?: MoneyBody | undefined;
      reservePercent?: number | undefined;
      reserveReason?: string | undefined;
      /** The share of the base the reserve defaults to now. */
      defaultPercent: number;
      /** What the Cost Center carries into the year: the base when Finance gives none. */
      carriedOverMinor: bigint;
    },
  ) {
    const figures = versionFiguresOf({
      ...(input.base ? { baseMinor: await this.facts.money(input.base, currency, tx) } : {}),
      ...(input.reserve ? { reserveMinor: await this.facts.money(input.reserve, currency, tx) } : {}),
      ...(input.reservePercent !== undefined ? { reservePercent: input.reservePercent } : {}),
      carriedOverMinor: input.carriedOverMinor,
      defaultPercent: input.defaultPercent,
    });

    return { ...figures, reserveReason: input.reserveReason?.trim() || null };
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
    shareOf(version, patch, next);
    // A reserve that is still the default share of the base follows the base when only the base changes: it stays the default (B-M3).
    if (next.baseMinor !== undefined && next.reserveMinor === undefined && version.reservePercent !== null) {
      const wasDefault = version.reserveMinor === defaultReserveOf(version.baseMinor, version.reservePercent);
      if (wasDefault) next.reserveMinor = defaultReserveOf(next.baseMinor, version.reservePercent);
    }
  }
}

/** A share Finance chooses sets the reserve to that share of the base and is kept as it was given; whether it asks a reason is told at the sending. */
function shareOf(version: VersionRecord, patch: VersionPatchDto, next: VersionPatch): void {
  if (patch.reservePercent === undefined) return;
  next.reservePercent = patch.reservePercent;
  next.reserveMinor = defaultReserveOf(next.baseMinor ?? version.baseMinor, patch.reservePercent);
}
