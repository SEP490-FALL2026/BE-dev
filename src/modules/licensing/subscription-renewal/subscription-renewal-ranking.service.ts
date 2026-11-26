import { Injectable, Optional } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { SeatLedgerApi } from '../../catalog/public/seat-ledger.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { RenewalUsageContributions } from '../public/licensing.extension-points';
import type { RenewalSeatUsage } from '../public/licensing-renewal.types';
import { heldOn, rankSeats, type RankedSeat } from './subscription-renewal-ranking.policy';
import { SubscriptionRenewalSeatRepo } from './subscription-renewal-seat.repo';
import type { HeldSeat } from './subscription-renewal.types';

/** The seats of a period on a day: those held, and the personal ones ranked for a reduction. */
export interface RankedSeats {
  /** False while no source of usage evidence is connected: the ranking then says nothing about use. */
  usageAvailable: boolean;
  held: HeldSeat[];
  ranked: RankedSeat[];
}

/**
 * The seats of a subscription period as a reduction reads them (`QĐ-66x`): held today, whose holder left, what the evidence of use
 * says when a source of it exists, ranked by the pure policy. A fixed number of statements however many seats there are.
 */
@Injectable()
export class RenewalRankingService {
  constructor(
    private readonly seats: SubscriptionRenewalSeatRepo,
    private readonly organizationReads: OrganizationReadApi,
    private readonly usage: RenewalUsageContributions,
    @Optional() private readonly seatLedger?: SeatLedgerApi,
  ) {}

  async seatsOf(
    subscriptionId: string,
    today: BusinessDate,
    tx?: DbTx,
    subscriptionLineId?: string,
  ): Promise<RankedSeats> {
    const all = await this.seats.notEndedBy(subscriptionId, today, tx);
    const targetPlanId =
      subscriptionLineId && this.seatLedger
        ? (await this.seatLedger.linesOfIds([subscriptionLineId], tx))[0]?.planId
        : undefined;
    const scoped = targetPlanId ? all.filter((seat) => seat.planId === targetPlanId) : all;
    const held = scoped.filter((seat) => heldOn(seat, today));
    const people = await this.organizationReads.getEmployees([...new Set(held.map((seat) => seat.employeeId))], tx);
    const left = new Set(people.filter((person) => person.status !== 'ACTIVE').map((person) => person.id));
    const [reader] = this.usage.all();
    const usage: Map<string, RenewalSeatUsage> | null = reader
      ? await reader.seatUsageOf(held.map((seat) => seat.assignmentId))
      : null;

    return {
      usageAvailable: usage !== null,
      held,
      ranked: rankSeats(
        held.map((seat) => ({
          seat,
          holderLeft: left.has(seat.employeeId),
          usage: usage?.get(seat.assignmentId) ?? null,
        })),
      ),
    };
  }
}
