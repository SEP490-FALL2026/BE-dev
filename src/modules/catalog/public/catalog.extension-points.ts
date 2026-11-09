import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import { Hook } from '../../../core/extension/hook';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { OpenSeatHoldings } from './catalog.types';

// The points the catalog opens for the modules above it (`core/extension`): they bind them from a `*.listener.ts` when their
// module starts, so the catalog never imports them. One instance of each per application.

/**
 * What the catalog needs to know of the seats that licensing holds, without importing it (ADR-0013 item 4). An assignment holds
 * a seat from the day it is made until it ends or fails; one that has not ended counts, a future start included.
 */
export interface SeatOccupancyReader {
  /** The assignments of the subscription that have not ended and have not failed as of `day`. */
  occupiedBySubscription(subscriptionId: string, day: BusinessDate, tx?: DbTx): Promise<number>;
  /** How many different people hold an assignment on these plans that has not ended and has not failed. */
  openHolderCount(planIds: readonly string[], day: BusinessDate): Promise<number>;
  /**
   * The first `limit` assignments on these plans that have not ended and have not failed, how many there are in all and
   * how many per plan (never every seat); with `tx`, read in the caller's transaction.
   */
  openAssignmentsOfPlans(
    planIds: readonly string[],
    day: BusinessDate,
    limit: number,
    tx?: DbTx,
  ): Promise<OpenSeatHoldings>;
  /** Which of these subscriptions have an assignment that has not ended and has not failed as of `day`: one read for any number of them. */
  subscriptionsWithOpenSeats(
    subscriptionIds: readonly string[],
    day: BusinessDate,
    tx?: DbTx,
  ): Promise<ReadonlySet<string>>;
}

/**
 * The reader of occupied seats, bound by `licensing`. A rule that needs the seats (a quantity that cannot go under them, a
 * software that cannot be retired while they are held, a department kept in use by a perpetual purchase) asks it; unbound, it
 * fails loudly instead of letting the rule pass.
 */
@Injectable()
export class SeatOccupancyHook extends Hook<SeatOccupancyReader> {
  constructor() {
    super('catalog.seat-occupancy');
  }
}

/** Where the installation of the organization stands, as far as the rules of the catalog that only bind after it need to know. */
export interface SeatBaselinePhase {
  /** True once the seat baseline of the organization is closed: from then on a second subscription of a K2 or K4 plan is refused (`QĐ-104k`(3)). */
  isClosed(tx: DbTx, organizationId: string): Promise<boolean>;
}

/**
 * The phase of the seat baseline, bound by `licensing`. While it is open a duplicate subscription of a shared-pool plan is only warned
 * about; once closed it is refused. Unbound, the catalog takes the baseline as closed, so nothing is let through by accident.
 */
@Injectable()
export class SeatBaselinePhaseHook extends Hook<SeatBaselinePhase> {
  constructor() {
    super('catalog.seat-baseline-phase');
  }
}
