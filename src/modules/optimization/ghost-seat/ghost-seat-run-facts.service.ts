import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { GhostSeatRepo } from './ghost-seat.repo';
import type { GhostSeatRecord } from './ghost-seat.types';

/** What the weekly pass reads of the recommendations that exist, with the days told as the organization counts them. */
@Injectable()
export class GhostSeatRunFacts {
  constructor(
    private readonly repo: GhostSeatRepo,
    private readonly organizationReads: OrganizationReadApi,
  ) {}

  /** The recommendations about seats (not `G1`) that are not closed, one for each seat chain. */
  unclosedOfSeats(organizationId: string): Promise<GhostSeatRecord[]> {
    return this.repo.unclosedOfSeats(organizationId);
  }

  /**
   * For each of these seat chains, the newest recommendation a head kept or exempted, and the day of the organization it was closed on: the instant
   * is told in the zone of the organization, so 01:00 in Vietnam is that day and not the UTC day before it.
   */
  async lastKeptOrExemptedOf(
    seatChainIds: readonly string[],
  ): Promise<Map<string, { id: string; closeReason: 'KEPT' | 'EXEMPTED'; closedOn: BusinessDate }>> {
    const out = new Map<string, { id: string; closeReason: 'KEPT' | 'EXEMPTED'; closedOn: BusinessDate }>();
    for (const [chainId, kept] of await this.repo.lastKeptOrExemptedOf(seatChainIds)) {
      out.set(chainId, {
        id: kept.id,
        closeReason: kept.closeReason,
        closedOn: await this.organizationReads.businessToday(kept.closedAt),
      });
    }

    return out;
  }
}
