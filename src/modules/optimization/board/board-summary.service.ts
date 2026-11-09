import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { GhostSeatSeatStateRepo } from '../ghost-seat/ghost-seat-seat-state.repo';
import { GhostSeatRepo } from '../ghost-seat/ghost-seat.repo';
import type { GhostSeatGroup } from '../ghost-seat/ghost-seat.types';
import { INTERNAL_SOFTWARE_LIMITATION, confidenceLabelOf } from './board.policy';

/**
 * The four groups side by side (`US-10-05` AC-7, `US-10-01` AC-8): how many recommendations of each are not closed and how many of
 * those have their reclaim under way, the number the dashboard of the IT Admin counts (`G2` not closed plus `G1` open), and the
 * limitation for internal software. Each group is its own line; they are never added into one figure with a percentage.
 */
@Injectable()
export class BoardSummaryService {
  constructor(
    private readonly repo: GhostSeatRepo,
    private readonly seatStates: GhostSeatSeatStateRepo,
    private readonly organizationReads: OrganizationReadApi,
  ) {}

  async summary(tx?: DbTx) {
    const organization = await this.organizationReads.getOrganization(tx);
    const rows = organization ? await this.repo.countUnclosed(organization.id, tx) : [];
    const seatRows = organization ? await this.seatStates.countByStatus(organization.id) : [];
    const seats = (status: string, stale?: boolean) =>
      seatRows
        .filter((row) => row.status === status && (stale === undefined || (row.gate === 'STALE_SOURCE') === stale))
        .reduce((sum, row) => sum + row.count, 0);
    const count = (group: string, state?: string) =>
      rows
        .filter((row) => row.group === group && (state === undefined || row.state === state))
        .reduce((sum, row) => sum + row.count, 0);

    const of = (group: GhostSeatGroup) => ({
      confidenceLabel: confidenceLabelOf(group),
      unclosedCount: count(group),
      reclaimUnderWayCount: count(group, 'RECLAIM_DECIDED'),
    });

    return {
      groups: { G1: of('G1'), G2: of('G2'), G3: of('G3'), G4: of('G4') },
      counted: count('G2') + count('G1', 'OPEN'),
      limitation: INTERNAL_SOFTWARE_LIMITATION,
      usage: {
        noSource: seats('NO_DATA'),
        stale: seats('INSUFFICIENT_EVIDENCE', true),
        insufficientEvidence: seats('INSUFFICIENT_EVIDENCE', false),
        unmatchedIdentities: seats('UNMATCHED_IDENTITY'),
        active: seats('ACTIVE'),
        inactive: seats('INACTIVE'),
        excluded: seats('EXCLUDED'),
      },
    };
  }
}
