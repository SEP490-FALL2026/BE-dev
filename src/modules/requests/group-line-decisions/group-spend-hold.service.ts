import { Injectable } from '@nestjs/common';
import { fiscalYearOf } from '../../../core/fiscal-year';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { AccessRequestRepo } from '../access-request/access-request.repo';
import type { AccessRequestRecord } from '../access-request/access-request.types';
import { pricedPeople } from '../access-request/group-request.types';
import { requestAmountOf } from '../access-request/pricing.policy';
import { RequestTermEndsService } from '../repricing/request-term-ends.service';
import { SpendEffectsService } from '../spend-effects/spend-effects.service';
import type { LineVerdict } from '../group-request/group-line-decision.policy';
import { LineAmountRepo, type NewLineAmount } from '../group-request/line-amount.repo';
import { scaledPricing, sharesOf } from '../spend/line-allocation.policy';

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
    const nextYear = await this.nextYearShares(tx, request, approved, held.now);
    await this.amounts.insertMany(tx, [
      ...approved.flatMap((verdict, index) =>
        sharesOf(costs, approved.length, index).map((share) => ({
          requestId: request.id,
          employeeId: verdict.employeeId,
          budgetYear: share.year,
          amountMinor: share.amountMinor,
          currency: check.currency,
        })),
      ),
      ...nextYear,
    ]);

    // What the request costs is now what the people approved cost, in the currency of the price, and the part of the year after is the sum of
    // what each of them has kept (`QĐ-111k`).
    const { pricing } = request;
    const scaled = scaledPricing(pricing, pricedPeople(request.lines.map((line) => line.state)), approved.length);
    const nextYearMinor = nextYear.reduce((sum, share) => sum + share.amountMinor, 0n);
    const nextYearAmount =
      nextYearMinor > 0n && pricing.amount ? { amountMinor: nextYearMinor, currency: pricing.amount.currency } : null;
    if (scaled !== null || nextYearAmount?.amountMinor !== pricing.nextYearAmount?.amountMinor) {
      await this.requests.setPricing(tx, request.id, { ...pricing, ...(scaled ?? {}), nextYearAmount });
    }
  }

  /**
   * What each person approved keeps of the year after the day the spend is approved (`QĐ-111k`, R-46): the months of their own time of use that
   * begin then, cut at the end of their own contract, at the monthly price of the day; twelve months for a right with no end. A row for each, marked
   * as not held: no commitment holds it until the job of 01/01 makes one from the lines that still stand (M-13).
   */
  private async nextYearShares(
    tx: DbTx,
    request: AccessRequestRecord,
    approved: readonly LineVerdict[],
    now: Date,
  ): Promise<NewLineAmount[]> {
    const { pricing } = request;
    if (pricing.kind !== 'RECURRING' || pricing.unitPrice === null || pricing.billingCycle === null) return [];
    const today = await this.organizationReads.businessToday(now, tx);
    const ids = approved.map((verdict) => verdict.employeeId);
    // A request of this release keeps its months and works each end out from today; one of an older release has the day of its line, or none.
    const ends =
      request.termMonths !== null && request.expectedEndDate === null
        ? await this.termEnds.endsOfPeople(tx, request.termMonths, ids, today)
        : ids.map((id) => request.lines.find((line) => line.employeeId === id)?.expectedEndDate ?? null);
    const rows: NewLineAmount[] = [];
    for (const [index, employeeId] of ids.entries()) {
      const priced = requestAmountOf({
        kind: 'RECURRING',
        unitPrice: pricing.unitPrice,
        billingCycle: pricing.billingCycle,
        beneficiaries: 1,
        checkDate: today,
        endDate: ends[index],
      });
      if (priced.status !== 'PRICED' || priced.nextYearAmount === null || priced.nextYearAmount.amountMinor <= 0n)
        continue;
      rows.push({
        requestId: request.id,
        employeeId,
        budgetYear: fiscalYearOf(today) + 1,
        amountMinor: priced.nextYearAmount.amountMinor,
        currency: priced.nextYearAmount.currency,
        held: false,
      });
    }

    return rows;
  }
}
