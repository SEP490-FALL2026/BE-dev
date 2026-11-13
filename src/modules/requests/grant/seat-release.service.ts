import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import { fiscalYearOf } from '../../../core/fiscal-year';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { BudgetsApi } from '../../budgets/public/budgets.api';
import type { CommitmentReleaseReason, SeatCommitment } from '../../budgets/public/budgets.types';
import { LicensingApi } from '../../licensing/public/licensing.api';
import type { GrantOutcomeFacts, ProvisioningKind, RevocationTaskFacts } from '../../licensing/public/licensing.types';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import type { TransferReleaseInput, TransferReleaseResult } from '../public/requests.types';
import {
  givenAtTransfer,
  lateGrantShare,
  releasesBeforeGrant,
  revocationEndsOn,
  revocationShare,
  transferReleaseEndsOn,
  transferReleaseReference,
  type SeatCoverage,
} from './seat-release.policy';
import { SeatReleaseRepo } from './seat-release.repo';

/** Where the reference of the release of a transfer has its id, the release of a right given again (R-49) says `regrant`. */
const REGRANT_REFERENCE = 'regrant';

/**
 * Gives back by the day what a request holds for one seat (`RV-07`, `M-06`, `M-10`), in the transaction of the event: when the revocation of
 * the right is completed, the days after its end; when a K2 right is granted after its commitment began, the days before the grant; when the
 * transfer of the person who holds it takes effect, the days from that day (`QĐ-111bg`). The commitments are those of the request that made
 * the right and of every request to go on using of its chain, each for the months it covers, so the request that holds the right on the day
 * it ends gives back the rest and a later one gives back all of it. Business cases that give nothing back (no request, no commitment, a closed
 * year, a one-time price) do nothing and never throw; the budgets write the release and its audit (`BUDGET_COMMITMENT.RELEASED`, actor the
 * system), once for each task, whatever repeats it.
 */
@Injectable()
export class SeatReleaseService {
  constructor(
    private readonly budgets: BudgetsApi,
    private readonly organizationReads: OrganizationReadApi,
    private readonly repo: SeatReleaseRepo,
    private readonly licensing: LicensingApi,
  ) {}

  /**
   * The revocation `task` was completed: what the right would have cost after its end goes back. Anything else is ignored. A commitment that
   * gave back for this right the day a transfer took effect (its ledger says so) gives nothing back again, whoever asked for the revocation: the
   * rule is the ledger of each commitment, not the source of the task, so a right taken away by a departure in the grace gives nothing twice, a
   * transfer from before the release (no such release) gives at the revocation, and so does the commitment of a year that began in the grace (BLK-3, D-86).
   */
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
      shareOf: (commitment, coverage, currentYear) =>
        givenAtTransfer(commitment, completed.chainAssignmentIds)
          ? 0n
          : revocationShare({ commitment, coverage, endsOn, currentYear }),
    });
  }

  /**
   * The transfer of a person takes effect (`QĐ-111bg`): for each old right the money the department they leave still holds goes back from the
   * day of the transfer, by the same share as a revocation on that day, once (the reference names the transfer and the right). A right whose
   * kind is not priced by the month, or that no request made, gives nothing. Returns what went back, by currency.
   */
  async afterTransferEffective(tx: DbTx, input: TransferReleaseInput, now: Date): Promise<TransferReleaseResult> {
    const byRequest = new Map<string, bigint>();
    const priced = input.rights.filter(
      (right) => transferReleaseEndsOn(right.provisioningType, input.effectiveOn) !== null,
    );
    const chains = await this.licensing.listRightChainsOf(
      tx,
      priced.map((right) => right.assignmentId),
    );
    for (const chain of chains) {
      const kind = priced.find((right) => right.assignmentId === chain.assignmentId)?.provisioningType;
      const endsOn = kind === undefined ? null : transferReleaseEndsOn(kind, input.effectiveOn);
      if (endsOn === null) continue;
      const coverages = await this.repo.coverageOf(tx, {
        requestIds: chain.grantRequestId === null ? [] : [chain.grantRequestId],
        assignmentIds: chain.chainAssignmentIds,
      });
      const released = await this.give(tx, coverages, now, {
        reason: 'TRANSFER_EFFECTIVE',
        reference: transferReleaseReference(input.transferId, chain.assignmentId),
        shareOf: (commitment, coverage, currentYear) => revocationShare({ commitment, coverage, endsOn, currentYear }),
      });
      for (const [requestId, amountMinor] of released)
        byRequest.set(requestId, (byRequest.get(requestId) ?? 0n) + amountMinor);
    }

    return { released: await this.byCurrency(tx, byRequest) };
  }

  /**
   * The grant of a request ended the old right of the person the day it was given (R-49): the money the department they came from still holds for
   * that right goes back from that day, once (the reference names the right), by the share a revocation on that day would give. A commitment that
   * gave back the day the transfer took effect (its ledger says so) gives nothing again; one that did not (a transfer from before the release) or
   * that was held after it (the pass of 01/01) gives now. The reason is that of the transfer and the reference carries `regrant` where a transfer
   * has its id, which the rule of the ledger (`givenAtTransfer`) reads the same. A right whose kind is not priced by the month gives nothing.
   */
  async afterRightReplaced(
    tx: DbTx,
    input: { assignmentId: string; provisioningType: ProvisioningKind; endedOn: BusinessDate; now: Date },
  ): Promise<void> {
    const endsOn = transferReleaseEndsOn(input.provisioningType, input.endedOn);
    if (endsOn === null) return;
    const [chain] = await this.licensing.listRightChainsOf(tx, [input.assignmentId]);
    if (chain === undefined) return;
    const coverages = await this.repo.coverageOf(tx, {
      requestIds: chain.grantRequestId === null ? [] : [chain.grantRequestId],
      assignmentIds: chain.chainAssignmentIds,
    });
    await this.give(tx, coverages, input.now, {
      reason: 'TRANSFER_EFFECTIVE',
      reference: transferReleaseReference(REGRANT_REFERENCE, input.assignmentId),
      shareOf: (commitment, coverage, currentYear) =>
        givenAtTransfer(commitment, chain.chainAssignmentIds)
          ? 0n
          : revocationShare({ commitment, coverage, endsOn, currentYear }),
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

  /** The amounts that went back, added up by the currency their request is committed in. */
  private async byCurrency(
    tx: DbTx,
    byRequest: ReadonlyMap<string, bigint>,
  ): Promise<TransferReleaseResult['released']> {
    if (byRequest.size === 0) return [];
    const currencies = new Map(
      (await this.budgets.committedByRequests([...byRequest.keys()], tx)).map((item) => [
        item.requestId,
        item.currency,
      ]),
    );
    const totals = new Map<string, bigint>();
    for (const [requestId, amountMinor] of byRequest) {
      const currency = currencies.get(requestId);
      if (currency !== undefined && amountMinor > 0n) totals.set(currency, (totals.get(currency) ?? 0n) + amountMinor);
    }

    return [...totals]
      .map(([currency, amountMinor]) => ({ currency, amountMinor }))
      .sort((a, b) => a.currency.localeCompare(b.currency));
  }

  /** Releases what `shareOf` says for each commitment and returns, by request, what really went back. */
  private async give(
    tx: DbTx,
    coverages: Map<string, SeatCoverage>,
    now: Date,
    by: {
      reason: Extract<CommitmentReleaseReason, 'REVOKED' | 'LATE_GRANT' | 'TRANSFER_EFFECTIVE'>;
      reference: string;
      shareOf: (commitment: SeatCommitment, coverage: SeatCoverage, currentYear: number) => bigint;
    },
  ): Promise<Map<string, bigint>> {
    const given = new Map<string, bigint>();
    if (coverages.size === 0) return given;
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
      const released = await this.budgets.releaseForRequest(tx, {
        requestId,
        reason: by.reason,
        reference: by.reference,
        amounts: items,
        now,
      });
      given.set(
        requestId,
        released.reduce((sum, commitment) => sum + commitment.releasedMinor, 0n),
      );
    }

    return given;
  }
}
