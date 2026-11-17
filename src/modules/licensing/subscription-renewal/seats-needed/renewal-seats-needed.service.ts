import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../../core/business-date';
import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import { RenewalHoldHook } from '../../public/licensing.extension-points';
import { SubscriptionRenewalSeatRepo } from '../subscription-renewal-seat.repo';
import { seatsNeededOf, targetOf, type SeatsNeededCounts } from './renewal-seats-needed.policy';

/** The subscription period whose next period is counted, and the days the count stands on. */
export interface SeatsNeededInput {
  subscriptionId: string;
  planId: string;
  vendorMinimumSeats: number | null;
  /** Only the primary subscription of a plan counts the requests waiting for their grant, so a plan with two subscriptions does not count them twice. */
  isPrimaryForPlan: boolean;
  /** The renewal day: a seat whose last day is this day is not needed after it. */
  renewalOn: BusinessDate;
  today: BusinessDate;
}

/**
 * The seats a subscription needs for its next period (`QĐ-103e`, `QĐ-104d`(1), `QĐ-106i`(2), `SBF-20` §4.3): what the database says of
 * the seats (one statement for the subscription), the renewals waiting for the seats that end by the renewal day, the requests approved
 * and waiting for their grant and the requests open for the plan, all read from the module of requests through its hook, then the pure rule. It only reads, so
 * the caller holds the lock of the period when it needs the count to hold until it writes.
 */
@Injectable()
export class RenewalSeatsNeededService {
  constructor(
    private readonly seats: SubscriptionRenewalSeatRepo,
    private readonly renewalHold: RenewalHoldHook,
  ) {}

  async countFor(input: SeatsNeededInput, tx?: DbTx): Promise<SeatsNeededCounts> {
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
