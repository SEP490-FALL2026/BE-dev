import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import { fiscalYearOf } from '../../../core/fiscal-year';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { BudgetsApi } from '../../budgets/public/budgets.api';
import type { CommitmentReleaseReason, SeatCommitment } from '../../budgets/public/budgets.types';
import type { GrantOutcomeFacts, RevocationTaskFacts } from '../../licensing/public/licensing.types';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import {
  lateGrantShare,
  releasesBeforeGrant,
  revocationEndsOn,
  revocationShare,
  type SeatCoverage,
} from './seat-release.policy';
import { SeatReleaseRepo } from './seat-release.repo';

/**
 * Gives back by the day what a request holds for one seat (`RV-07`, `M-06`, `M-10`), in the transaction of the event: when the revocation of
 * the right is completed, the days after its end; when a K2 right is granted after its commitment began, the days before the grant. The
 * commitments are those of the request that made the right and of every request to go on using of its chain, each for the months it covers,
 * so the request that holds the right on the day it ends gives back the rest and a later one gives back all of it. Business cases that
 * give nothing back (no request, no commitment, a closed year, a one-time price) do nothing and never throw; the budgets write the release
 * and its audit (`BUDGET_COMMITMENT.RELEASED`, actor the system), once for each task, whatever repeats it.
 */
@Injectable()
export class SeatReleaseService {
  constructor(
    private readonly budgets: BudgetsApi,
    private readonly organizationReads: OrganizationReadApi,
    private readonly repo: SeatReleaseRepo,
  ) {}

  /** The revocation `task` was completed: what the right would have cost after its end goes back. Anything else is ignored. */
  async afterRevocation(tx: DbTx, task: RevocationTaskFacts, now: Date): Promise<void> {
    const completed = task.completed;
    if (task.status !== 'COMPLETED' || completed === undefined) return;
    const endsOn = revocationEndsOn(completed);
    if (endsOn === null) return;
    const coverages = await this.repo.coverageOf(tx, {
      requestIds: completed.grantRequestId === null ? [] : [completed.grantRequestId],
      assignmentIds: completed.chainAssignmentIds,
    });
    await this.give(tx, coverages, now, {
      reason: 'REVOKED',
      reference: `revocationTask:${task.id}`,
      shareOf: (commitment, coverage, currentYear) => revocationShare({ commitment, coverage, endsOn, currentYear }),
    });
  }

  /** The grant of `requestId` was completed: a K2 right granted after its commitment began gives back the days before it. */
  async afterGrant(tx: DbTx, requestId: string, facts: GrantOutcomeFacts, now: Date): Promise<void> {
    if (!releasesBeforeGrant(facts.provisioningType)) return;
    const grantedOn: BusinessDate = facts.grantedOn;
    const coverages = await this.repo.coverageOf(tx, { requestIds: [requestId], assignmentIds: [] });
    await this.give(tx, coverages, now, {
      reason: 'LATE_GRANT',
      reference: `grantAssignment:${facts.assignmentId}`,
      shareOf: (commitment, coverage, currentYear) => lateGrantShare({ commitment, coverage, grantedOn, currentYear }),
    });
  }

  private async give(
    tx: DbTx,
    coverages: Map<string, SeatCoverage>,
    now: Date,
    by: {
      reason: Extract<CommitmentReleaseReason, 'REVOKED' | 'LATE_GRANT'>;
      reference: string;
      shareOf: (commitment: SeatCommitment, coverage: SeatCoverage, currentYear: number) => bigint;
    },
  ): Promise<void> {
    if (coverages.size === 0) return;
    // The years before the year of today are closed: their commitments are left as they are.
    const currentYear = fiscalYearOf(await this.organizationReads.businessToday(now, tx));
    const commitments = await this.budgets.lockSeatCommitments(tx, [...coverages.keys()], currentYear);
    const amounts = new Map<string, { year: number; amountMinor: bigint }[]>();
    for (const commitment of commitments) {
      const coverage = coverages.get(commitment.requestId);
      if (coverage === undefined) continue;
      const amountMinor = by.shareOf(commitment, coverage, currentYear);
      if (amountMinor <= 0n) continue;
      amounts.set(commitment.requestId, [
        ...(amounts.get(commitment.requestId) ?? []),
        { year: commitment.year, amountMinor },
      ]);
    }
    for (const [requestId, items] of amounts) {
      await this.budgets.releaseForRequest(tx, {
        requestId,
        reason: by.reason,
        reference: by.reference,
        amounts: items,
        now,
      });
    }
  }
}
