import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AccessRequestRepo } from '../access-request/access-request.repo';
import type { AccessRequestRecord } from '../access-request/access-request.types';
import { pricedPeople } from '../access-request/group-request.types';
import { SpendEffectsService } from '../spend-effects/spend-effects.service';
import type { LineVerdict } from '../group-request/group-line-decision.policy';
import { LineAmountRepo } from '../group-request/line-amount.repo';
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
    await this.amounts.insertMany(
      tx,
      approved.flatMap((verdict, index) =>
        sharesOf(costs, approved.length, index).map((share) => ({
          requestId: request.id,
          employeeId: verdict.employeeId,
          budgetYear: share.year,
          amountMinor: share.amountMinor,
          currency: check.currency,
        })),
      ),
    );

    // What the request costs is now what the people approved cost, in the currency of the price.
    const { pricing } = request;
    const scaled = scaledPricing(pricing, pricedPeople(request.lines.map((line) => line.state)), approved.length);
    if (scaled !== null) await this.requests.setPricing(tx, request.id, { ...pricing, ...scaled });
  }
}
