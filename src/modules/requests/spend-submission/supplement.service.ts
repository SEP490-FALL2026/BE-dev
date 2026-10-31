import { Injectable } from '@nestjs/common';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AccessRequestNotFoundError } from '../access-request/access-request.errors';
import { hasSpendStep } from '../access-request/access-request.policy';
import { AccessRequestRepo } from '../access-request/access-request.repo';
import { RequestFactsService } from '../access-request/request-facts.service';
import { GroupSupplementService } from '../group-request/group-supplement.service';
import { checkSupplement } from '../spend/spend-submission.policy';
import { SpendSupplementRefusedError } from '../spend/spend.errors';
import type { SupplementBodyDto, SupplementWire } from '../spend/spend-submission.dto';
import { SpendHeadService } from './spend-head.service';
import { SupplementPricing } from './supplement-pricing.service';
import { SupplementQueryService } from './supplement-query.service';
import { SupplementRecorder } from './supplement-recorder.service';

/**
 * The supplementary file of the head (`QĐ-82n`, `US-06-14` AC-13, AC-15; `US-05-04` AC-16): once a request is sent, the day the
 * money is expected to go out is changed only in a file of its own, with the reason, on a request that is back in the queue
 * (given back by Finance, or stopped by the data). The request is priced again for the new day and the budget year follows;
 * the file keeps what it was before and after, who and when, and what was first sent is not touched. A line of another year's
 * plan no longer fits, so the head attaches the request again before sending it. Nothing is sent: the head sends it on, and
 * the check runs again as a whole (`US-06-12`).
 */
@Injectable()
export class SupplementService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly requests: AccessRequestRepo,
    private readonly settings: RequestFactsService,
    private readonly head: SpendHeadService,
    private readonly groups: GroupSupplementService,
    private readonly pricing: SupplementPricing,
    private readonly recorder: SupplementRecorder,
    private readonly queries: SupplementQueryService,
  ) {}

  /**
   * Throws SpendNotHeadError, AccessRequestNotFoundError, SpendSupplementRefusedError and AccessRequestNotPriceableError.
   */
  async add(actor: AuthenticatedPrincipal, requestId: string, body: SupplementBodyDto): Promise<SupplementWire> {
    const departmentId = await this.head.departmentOf(actor);
    const { fiscalYearStartMonth } = await this.settings.settings();

    const record = await this.runner.run(async (tx) => {
      const request = await this.requests.lockById(tx, requestId);
      if (!request || request.departmentId !== departmentId || !hasSpendStep(request.policy)) {
        throw new AccessRequestNotFoundError();
      }
      const { pricing } = request;
      // The people of a group the head leaves out are judged first: a request for one person has none to leave out.
      const dropped = this.groups.check(request, body.dropEmployeeIds ?? []);
      const refusal = checkSupplement({
        state: request.state,
        priced: pricing.status === 'PRICED' && pricing.amount !== null,
        currentExpectedSpendOn: pricing.expectedSpendOn,
        newExpectedSpendOn: body.expectedSpendOn,
        leavesPeopleOut: dropped.length > 0,
      });
      if (refusal) throw new SpendSupplementRefusedError(refusal);

      const now = new Date();
      const { repriced, change } = await this.pricing.repriceFor(tx, request, {
        expectedSpendOn: body.expectedSpendOn,
        dropped,
        fiscalYearStartMonth,
        now,
      });

      return this.recorder.record(tx, actor, request, { reason: body.reason, repriced, change, dropped, now });
    });

    return (await this.queries.wires(requestId, [record]))[0];
  }
}
