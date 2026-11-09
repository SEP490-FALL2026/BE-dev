import { Injectable } from '@nestjs/common';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { maxEndDateOf } from '../access-request/pricing.policy';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AccessRequestNotFoundError, AccessRequestNotRequesterError } from '../access-request/access-request.errors';
import { hasSpendStep } from '../access-request/access-request.policy';
import { AccessRequestRepo } from '../access-request/access-request.repo';
import { GroupSupplementService } from '../group-request/group-supplement.service';
import { checkSupplement } from '../spend/spend-submission.policy';
import { SpendSupplementRefusedError } from '../spend/spend.errors';
import type { SupplementBodyDto, SupplementWire } from '../spend/spend-submission.dto';
import { SpendHeadService } from './spend-head.service';
import { SupplementPricing } from './supplement-pricing.service';
import { SupplementQueryService } from './supplement-query.service';
import { SupplementRecorder } from './supplement-recorder.service';

/**
 * The supplementary file of the head (`QĐ-82n`, `US-06-14` AC-13, AC-15, `L2-38`): once a request is sent, its term is shortened (an
 * earlier end date) or people of a group are left out only in a file of its own, with the reason, on a request that is back in the
 * queue (given back by Finance, or stopped by the data). The request is priced again for the day of the file and the budget year
 * follows; the file keeps what it was before and after, who and when, and what was first sent is not touched. Nothing is sent: the
 * head sends it on, and the check runs again as a whole (`US-06-12`).
 */
@Injectable()
export class SupplementService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly requests: AccessRequestRepo,
    private readonly head: SpendHeadService,
    private readonly groups: GroupSupplementService,
    private readonly pricing: SupplementPricing,
    private readonly recorder: SupplementRecorder,
    private readonly queries: SupplementQueryService,
    private readonly organizationReads: OrganizationReadApi,
  ) {}

  /**
   * Throws SpendNotHeadError, AccessRequestNotFoundError, SpendSupplementRefusedError and AccessRequestNotPriceableError.
   */
  async add(actor: AuthenticatedPrincipal, requestId: string, body: SupplementBodyDto): Promise<SupplementWire> {
    const record = await this.runner.run(async (tx) => {
      const request = await this.requests.lockById(tx, requestId);
      if (!request || !hasSpendStep(request.policy)) {
        throw new AccessRequestNotFoundError();
      }
      if (request.routing?.mode === 'ONE_STEP') {
        if (request.requesterEmployeeId !== actor.employeeId) throw new AccessRequestNotRequesterError();
        if (request.state !== 'AWAITING_REQUESTER_REVISION') throw new SpendSupplementRefusedError('NOT_IN_QUEUE');
      } else if (request.departmentId !== (await this.head.departmentOf(actor))) throw new AccessRequestNotFoundError();
      const { pricing } = request;
      // The people of a group the head leaves out are judged first: a request for one person has none to leave out.
      const dropped = this.groups.check(request, body.dropEmployeeIds ?? []);
      const now = new Date();
      const today = await this.organizationReads.businessToday(now, tx);
      const refusal = checkSupplement({
        state: request.state,
        priced: pricing.status === 'PRICED' && pricing.amount !== null,
        leavesPeopleOut: dropped.length > 0,
        term:
          body.expectedEndDate === undefined
            ? undefined
            : {
                requested: body.expectedEndDate,
                current: request.expectedEndDate,
                today,
                maxEndDate: maxEndDateOf(today),
              },
      });
      if (refusal) throw new SpendSupplementRefusedError(refusal);

      const { repriced, change } = await this.pricing.repriceFor(tx, request, {
        dropped,
        expectedEndDate: body.expectedEndDate,
        now,
      });

      return this.recorder.record(tx, actor, request, { reason: body.reason, repriced, change, dropped, now });
    });

    return (await this.queries.wires(requestId, [record]))[0];
  }
}
