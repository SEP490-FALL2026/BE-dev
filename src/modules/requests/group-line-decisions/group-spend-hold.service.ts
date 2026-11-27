import { Injectable } from '@nestjs/common';
import { fiscalYearOf } from '../../../core/fiscal-year';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { CatalogApi } from '../../catalog/public/catalog.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { AccessRequestNotPriceableError } from '../access-request/access-request.errors';
import { AccessRequestRepo } from '../access-request/access-request.repo';
import type { AccessRequestRecord } from '../access-request/access-request.types';
import { pricedPeople } from '../access-request/group-request.types';
import { RequestTermEndsService } from '../repricing/request-term-ends.service';
import { SpendEffectsService } from '../spend-effects/spend-effects.service';
import type { LineVerdict } from '../group-request/group-line-decision.policy';
import { LineAmountRepo, type NewLineAmount } from '../group-request/line-amount.repo';
import { lineAmountsOf, scaledPricing, sharesOf, type LineAmounts } from '../spend/line-allocation.policy';

/**
 * What an approved spend decision holds for the people approved (`US-05-17` AC-9, `US-06-01` AC-15): one commitment for each year, the
 * sum of the part of the people approved, and what each of them stands for in it. The request is then made again for them, so that
 * what it says it costs is what is held.
 */
@Injectable()
export class GroupSpendHold {
  constructor(
    private readonly requests: AccessRequestRepo,
    private readonly amounts: LineAmountRepo,
    private readonly effects: SpendEffectsService,
    private readonly organizationReads: OrganizationReadApi,
    private readonly termEnds: RequestTermEndsService,
    private readonly catalog: CatalogApi,
  ) {}

  async hold(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    request: AccessRequestRecord,
    approved: readonly LineVerdict[],
    held: { checkId: string | null; now: Date },
  ): Promise<void> {
    // The check was made for the people approved, so one seat is the cost over them.
    const check = await this.effects.hold(tx, actor, request, held.checkId, held.now, approved.length);
    // One commitment for the one year of the check (`BR-MF1-07d`): a cost of nothing holds nothing, so no person stands for a part of it.
    const costs = check.years
      .filter((year) => year.code !== null && year.costMinor > 0n)
      .map((year) => ({ year: year.year, amountMinor: year.costMinor }));
    const shares = await this.sharesOf(tx, { request, approved, costs, currency: check.currency, now: held.now });
    await this.amounts.insertMany(tx, shares.rows);

    // What the request costs is now what the people approved cost, in the currency of the price, and the part of the year after is the sum of
    // what each of them has kept (`QĐ-111k`).
    const { pricing } = request;
    const scaled =
      shares.heldTotal !== null
        ? { amount: { amountMinor: shares.heldTotal, currency: check.currency } }
        : scaledPricing(pricing, pricedPeople(request.lines.map((line) => line.state)), approved.length);
    const nextYearAmount =
      shares.nextYearTotal > 0n ? { amountMinor: shares.nextYearTotal, currency: check.currency } : null;
    if (
      scaled?.amount.amountMinor !== pricing.amount?.amountMinor ||
      nextYearAmount?.amountMinor !== pricing.nextYearAmount?.amountMinor
    ) {
      await this.requests.setPricing(tx, request.id, { ...pricing, ...(scaled ?? {}), nextYearAmount });
    }
  }

  /**
   * The rows of the shares of the people approved: what each stands for in the commitment of the year of the check, each for their own months
   * (R-38) when that adds up to what is held (an even share otherwise), and what each keeps of the year after, a row that no commitment holds
   * (`QĐ-111k`, M-13). `heldTotal` is what the people cost together when the shares are theirs, null when they are even shares.
   */
  private async sharesOf(
    tx: DbTx,
    input: {
      request: AccessRequestRecord;
      approved: readonly LineVerdict[];
      costs: { year: number; amountMinor: bigint }[];
      currency: string;
      now: Date;
    },
  ): Promise<{ rows: NewLineAmount[]; heldTotal: bigint | null; nextYearTotal: bigint }> {
    const { request, approved, costs, currency } = input;
    const exact = await this.exactAmounts(tx, request, approved, input.now);
    const exactTotal = exact?.lines.reduce((sum, line) => sum + line.current, 0n) ?? 0n;
    const own = exact !== null && costs.length === 1 && costs[0].amountMinor === exactTotal ? exact : null;
    const row = (employeeId: string, budgetYear: number, amountMinor: bigint, isHeld: boolean): NewLineAmount => ({
      requestId: request.id,
      employeeId,
      budgetYear,
      amountMinor,
      currency,
      held: isHeld,
    });
    const rows: NewLineAmount[] = approved.flatMap((verdict, index) =>
      (own ? [{ year: costs[0].year, amountMinor: own.lines[index].current }] : sharesOf(costs, approved.length, index))
        .filter((share) => share.amountMinor > 0n)
        .map((share) => row(verdict.employeeId, share.year, share.amountMinor, true)),
    );
    let nextYearTotal = 0n;
    for (const [index, line] of (exact?.lines ?? []).entries()) {
      if (line.next <= 0n || exact === null) continue;
      rows.push(row(approved[index].employeeId, exact.year + 1, line.next, false));
      nextYearTotal += line.next;
    }

    return { rows, heldTotal: own === null ? null : exactTotal, nextYearTotal };
  }

  /**
   * What each person approved costs this year and the year after, each for their own end on the day the spend is approved (`QĐ-111j`, `QĐ-111k`,
   * R-46, R-38): the months of their own time of use that begin, cut at the end of their own contract, at the monthly price of the day; twelve
   * months of the year after for a right with no end. Null for a price that is not by the month.
   */
  private async exactAmounts(
    tx: DbTx,
    request: AccessRequestRecord,
    approved: readonly LineVerdict[],
    now: Date,
  ): Promise<ExactAmounts | null> {
    const { pricing } = request;
    if (pricing.kind !== 'RECURRING' || pricing.unitPrice === null) return null;
    if (pricing.billingCycle === null || pricing.billingCycle === 'OTHER') return null;
    const today = await this.organizationReads.businessToday(now, tx);
    const ids = approved.map((verdict) => verdict.employeeId);
    // A request of this release keeps its months and works each end out from today; one of an older release has the day of its line, or none.
    const ends =
      request.termMonths !== null && request.expectedEndDate === null
        ? await this.termEnds.endsOfPeople(tx, request.termMonths, ids, today)
        : ids.map((id) => request.lines.find((line) => line.employeeId === id)?.expectedEndDate ?? null);
    const monthlyPriceMinor = this.savedMonthlyPriceOf(pricing);
    if (monthlyPriceMinor === undefined) throw new AccessRequestNotPriceableError();
    const planPrice = await this.planPricingFacts(tx, request);
    const lines = lineAmountsOf({
      provisioningType: planPrice?.provisioningType,
      unitPrice: pricing.unitPrice,
      monthlyPriceMinor,
      billingCycle: pricing.billingCycle,
      checkDate: today,
      ends,
    });

    return lines === null ? null : { year: fiscalYearOf(today), lines };
  }

  private savedMonthlyPriceOf(pricing: AccessRequestRecord['pricing']): bigint | undefined {
    return pricing.monthlyPriceMinor ?? undefined;
  }

  private planPricingFacts(tx: DbTx, request: AccessRequestRecord) {
    if (request.branch !== 'PAID_IN_CATALOG' || request.planId === null) return Promise.resolve(null);

    return this.catalog.getPlanPrice(request.planId, tx);
  }
}

/** The amounts of the people approved, in the order of their verdicts, and the year of the day they were worked out on. */
interface ExactAmounts {
  year: number;
  lines: LineAmounts[];
}
