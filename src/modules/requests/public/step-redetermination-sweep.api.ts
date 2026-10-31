import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { BusinessDate } from '../../../core/business-date';
import { OrganizationApi } from '../../organization/public/organization.api';
import { StepReassignmentService, type SweepTrigger } from '../reassignment/step-reassignment.service';

/** What one pass looked at and what it could not finish; a request that failed is tried again by the next pass. */
export interface SweepResult {
  waitingRequests: number;
  holderLeftRequests: number;
  /** Requests looked at by the pass of the day; zero on every other pass. */
  dailyPassRequests: number;
  failedRequests: number;
}

/** How many requests the pass of the day reads at a time. */
const DAILY_PAGE = 200;

/**
 * The safety net of the reassignment of steps, run by the worker (`FR-3.12`, `FR-3.16`, `US-05-11`, `US-05-12`). The events of
 * the organization and of the approval roles move steps in the transaction of the change; this pass does what no event
 * carries: it tries again every step that waits (a role was set around the services, an account was activated, a configuration
 * was completed), it takes the steps held by somebody who has left, and once a day of the organization it runs the routing table
 * over the held need steps, which picks up a change that took effect today whose event was not announced. It writes only when the
 * table names somebody other than the holder, so with no change in the data it writes nothing (`US-05-12` AC-5).
 *
 * Each request has a transaction of its own, so one that fails does not stop the others; running on several workers at once is
 * safe because the requests are locked by id and a second pass finds nothing left to change.
 */
@Injectable()
export class StepRedeterminationSweepApi {
  private readonly logger = new Logger(StepRedeterminationSweepApi.name);
  /** The day of the organization the pass of the day last finished on, in this process; another worker only repeats a harmless pass. */
  private dailyPassOn: BusinessDate | null = null;

  constructor(
    private readonly reassignment: StepReassignmentService,
    private readonly organization: OrganizationApi,
  ) {}

  async sweep(now: Date = new Date()): Promise<SweepResult> {
    const correlationId = randomUUID();
    const result: SweepResult = { waitingRequests: 0, holderLeftRequests: 0, dailyPassRequests: 0, failedRequests: 0 };

    const waiting = await this.reassignment.waitingRequestIds();
    result.waitingRequests = waiting.length;
    result.failedRequests += await this.each(waiting, 'WAITING_RETRY', correlationId, now);

    const heldByLeavers = await this.reassignment.requestIdsHeldByLeavers();
    result.holderLeftRequests = heldByLeavers.length;
    result.failedRequests += await this.each(heldByLeavers, 'HOLDER_LEFT', correlationId, now);

    const today = await this.organization.businessToday(now);
    if (this.dailyPassOn !== today) {
      const outcome = await this.dailyPass(correlationId, now);
      result.dailyPassRequests = outcome.requests;
      result.failedRequests += outcome.failed;
      // A day that could not be finished is repeated by the next pass.
      if (outcome.failed === 0) this.dailyPassOn = today;
    }

    return result;
  }

  /** Every held need step against the table of today, a page of requests at a time. */
  private async dailyPass(correlationId: string, now: Date): Promise<{ requests: number; failed: number }> {
    let after: string | null = null;
    let requests = 0;
    let failed = 0;
    for (;;) {
      const page = await this.reassignment.heldNeedRequestIds(after, DAILY_PAGE);
      if (page.length === 0) return { requests, failed };
      requests += page.length;
      failed += await this.each(page, 'EFFECTIVE_DATE_REACHED', correlationId, now);
      after = page[page.length - 1];
    }
  }

  /** One transaction for each request; returns how many failed. A failure is logged by its kind, never its message. */
  private async each(
    requestIds: readonly string[],
    trigger: SweepTrigger,
    correlationId: string,
    now: Date,
  ): Promise<number> {
    let failed = 0;
    for (const id of requestIds) {
      try {
        await this.reassignment.reconcileInOwnTransaction(id, trigger, correlationId, now);
      } catch (error) {
        failed += 1;
        this.logger.error(`Reassignment of a request failed (${trigger}): ${(error as Error).name}`);
      }
    }

    return failed;
  }
}
