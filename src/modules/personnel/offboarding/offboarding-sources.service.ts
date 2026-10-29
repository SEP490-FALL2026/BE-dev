import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import {
  OffboardingBlockerContributions,
  OffboardingWarningContributions,
  type OffboardingSource,
} from '../public/personnel.extension-points';

/**
 * Counts what the flows that come after the record of a departure added (`OffboardingBlockerContributions`,
 * `OffboardingWarningContributions`): one count for each code, read in the order the sources were added.
 */
@Injectable()
export class OffboardingSources {
  constructor(
    private readonly blockers: OffboardingBlockerContributions,
    private readonly warnings: OffboardingWarningContributions,
  ) {}

  blockersOf(employeeId: string, tx?: DbTx): Promise<Record<string, number>> {
    return this.countAll(this.blockers.all(), employeeId, tx);
  }

  warningsOf(employeeId: string, tx?: DbTx): Promise<Record<string, number>> {
    return this.countAll(this.warnings.all(), employeeId, tx);
  }

  private async countAll(
    sources: readonly OffboardingSource[],
    employeeId: string,
    tx?: DbTx,
  ): Promise<Record<string, number>> {
    const counted: Record<string, number> = {};
    for (const source of sources) counted[source.code] = await source.countFor(employeeId, tx);

    return counted;
  }
}
