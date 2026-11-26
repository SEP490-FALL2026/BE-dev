import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../../core/business-date';
import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import { SeatLedgerApi, type SubscriptionLineRecord } from '../../../catalog/public/seat-ledger.api';
import { RenewalHoldHook } from '../../public/licensing.extension-points';
import { SharedPoolService } from '../../shared-pool/shared-pool.service';
import { SubscriptionRenewalSeatRepo } from '../subscription-renewal-seat.repo';
import type { SeatsNeededFacts } from '../subscription-renewal.types';
import {
  aggregateLineCountsToPeriod,
  seatsNeededOf,
  targetOf,
  type SeatsNeededCounts,
} from './renewal-seats-needed.policy';

/** The subscription period whose next period is counted, and the days the count stands on. */
export interface SeatsNeededInput {
  subscriptionId: string;
  planId: string;
  vendorMinimumSeats: number | null;
  minimumSeatsTotal?: number | null;
  /** Only the primary subscription of a plan counts the requests waiting for their grant, so a plan with two subscriptions does not count them twice. */
  isPrimaryForPlan: boolean;
  /** The renewal day: a seat whose last day is this day is not needed after it. */
  renewalOn: BusinessDate;
  today: BusinessDate;
}

/**
 * The seats a subscription needs for its next period (`QĐ-103e`, `QĐ-104d`(1), `QĐ-106i`(2), `SBF-20` §4.3): reads period lines when
 * available (`B2-R7`, routing awaiting grants via `chooseLine`) or falls back to the period plan for pre-line periods.
 */
@Injectable()
export class RenewalSeatsNeededService {
  constructor(
    private readonly seats: SubscriptionRenewalSeatRepo,
    private readonly renewalHold: RenewalHoldHook,
    private readonly seatLedger: SeatLedgerApi,
    private readonly sharedPool: SharedPoolService,
  ) {}

  async countFor(input: SeatsNeededInput, tx?: DbTx): Promise<SeatsNeededCounts> {
    const lines = await this.seatLedger.linesOfSubscription(input.subscriptionId, tx);
    if (lines.length === 0) return this.countLegacy(input, tx);
    return this.countByLines(lines, input, tx);
  }

  private async countByLines(
    lines: readonly SubscriptionLineRecord[],
    input: SeatsNeededInput,
    tx?: DbTx,
  ): Promise<SeatsNeededCounts> {
    const { today, renewalOn } = input;
    const factsByPlan = await this.seats.seatsNeededFactsByPlan(input.subscriptionId, { today, renewalOn }, tx);
    const hold = this.renewalHold.get();
    const allEndingIds = [...factsByPlan.values()].flatMap((facts) => facts.endingAssignmentIds);
    const emptyWaiting: ReadonlyMap<string, unknown> = new Map();
    const waiting = allEndingIds.length === 0 ? emptyWaiting : await hold.pendingRenewalsOf(allEndingIds, tx);
    const planIds = [...new Set(lines.map((line) => line.planId))];
    const chosen = await this.sharedPool.chosenLinesOfPlans(planIds, today, tx);

    let openRequests = 0;
    for (const planId of planIds) openRequests += await hold.openRequestsOfPlan(planId, tx);

    const perLine = await this.collectPerLineCounts(lines, input, { factsByPlan, waiting, chosen }, tx);
    return aggregateLineCountsToPeriod(perLine, {
      vendorMinimumSeats: input.vendorMinimumSeats,
      minimumSeatsTotal: input.minimumSeatsTotal ?? null,
      openRequests,
    });
  }

  private async collectPerLineCounts(
    lines: readonly SubscriptionLineRecord[],
    input: SeatsNeededInput,
    ctx: {
      factsByPlan: ReadonlyMap<string, SeatsNeededFacts>;
      waiting: ReadonlyMap<string, unknown>;
      chosen: ReadonlyMap<string, { subscriptionId: string; subscriptionLineId: string | null }>;
    },
    tx?: DbTx,
  ) {
    const hold = this.renewalHold.get();
    const awaitingByPlan = new Map<string, number>();
    const perLine = [];
    for (const line of lines) {
      const facts = ctx.factsByPlan.get(line.planId);
      const pending = facts ? facts.endingAssignmentIds.filter((id) => ctx.waiting.has(id)).length : 0;
      const pointsToLine = ctx.chosen.get(line.planId)?.subscriptionLineId === line.id;
      const awaiting = await this.takePlanAwaiting(line.planId, pointsToLine, awaitingByPlan, hold, tx);
      perLine.push({
        heldPastRenewal: facts?.heldPastRenewal ?? 0,
        pendingContinuations: pending,
        approvedAwaitingGrant: awaiting,
        minimumSeats: line.minimumSeats ?? (lines.length === 1 ? input.vendorMinimumSeats : null),
        activeSeatsToday: facts?.activeSeatsToday ?? 0,
      });
    }
    return perLine;
  }

  private async takePlanAwaiting(
    planId: string,
    pointsToLine: boolean,
    awaitingByPlan: Map<string, number>,
    hold: ReturnType<RenewalHoldHook['get']>,
    tx?: DbTx,
  ): Promise<number> {
    if (!pointsToLine || awaitingByPlan.has(planId)) return 0;
    const awaiting = await hold.approvedAwaitingGrantOfPlan(planId, tx);
    awaitingByPlan.set(planId, awaiting);
    return awaiting;
  }

  private async countLegacy(input: SeatsNeededInput, tx?: DbTx): Promise<SeatsNeededCounts> {
    const { today, renewalOn } = input;
    const facts = await this.seats.seatsNeededFacts(input.subscriptionId, { today, renewalOn }, tx);
    const hold = this.renewalHold.get();
    const waiting =
      facts.endingAssignmentIds.length === 0 ? new Map() : await hold.pendingRenewalsOf(facts.endingAssignmentIds, tx);
    const parts = {
      heldPastRenewal: facts.heldPastRenewal,
      pendingContinuations: waiting.size,
      approvedAwaitingGrant: input.isPrimaryForPlan ? await hold.approvedAwaitingGrantOfPlan(input.planId, tx) : 0,
    };
    const seatsNeeded = seatsNeededOf(parts);

    return {
      ...parts,
      seatsNeeded,
      vendorMinimumSeats: input.vendorMinimumSeats,
      target: targetOf(seatsNeeded, input.vendorMinimumSeats),
      activeSeatsToday: facts.activeSeatsToday,
      openRequests: await hold.openRequestsOfPlan(input.planId, tx),
    };
  }
}
