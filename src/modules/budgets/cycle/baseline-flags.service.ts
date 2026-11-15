import { Injectable } from '@nestjs/common';
import { belowCarriedOver, carriedOverShortfall } from '../budget/budget.policy';
import { ProposalRepo } from '../budget/proposal.repo';
import { VersionRepo } from '../budget/version.repo';
import { CarriedOverContributions } from '../public/budgets.extension-points';

/** What the baseline says of a department besides what it runs (`QĐ-111ac`, `QĐ-111bb`). */
export interface BaselineCarried {
  carriedOver: bigint;
  noProposalSubmitted: boolean;
  belowCarriedOver: boolean;
  /** What the base and the reserve of the newest version lack of what is carried over; zero when they cover it, and when there is no version. */
  carriedOverShortfall: bigint;
}

/**
 * What each department of the baseline says of the year it is made for: what its Cost Center carries into the year, whether the deadline
 * passed with no proposal of it, and whether the base and the reserve of the newest version of it are below what is carried over (the red flag), and by how much. Three
 * statements for the whole baseline, whatever the number of departments.
 */
@Injectable()
export class BaselineFlags {
  constructor(
    private readonly carried: CarriedOverContributions,
    private readonly proposals: ProposalRepo,
    private readonly versions: VersionRepo,
  ) {}

  async of(
    costCenterIds: readonly string[],
    year: number,
    locked: boolean,
  ): Promise<(costCenterId: string) => BaselineCarried> {
    const carriedOver = await this.carried.totals(costCenterIds, year);
    const proposed = await this.proposals.proposedCostCenters(costCenterIds, year);
    const latest = await this.versions.latestOfCostCenters(costCenterIds, year);

    return (costCenterId) => {
      const amount = carriedOver.get(costCenterId) ?? 0n;
      const version = latest.get(costCenterId);

      return {
        carriedOver: amount,
        noProposalSubmitted: locked && !proposed.has(costCenterId),
        belowCarriedOver: version !== undefined && belowCarriedOver(version, amount),
        carriedOverShortfall: version === undefined ? 0n : carriedOverShortfall(version, amount),
      };
    };
  }
}
