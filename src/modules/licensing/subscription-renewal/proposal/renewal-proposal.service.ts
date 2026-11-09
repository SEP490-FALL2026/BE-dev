import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../../core/business-date';
import { TransactionRunner, type DbTx } from '../../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../../audit/public/audit.api';
import { SubscriptionPeriodApi } from '../../../catalog/public/subscription-period.api';
import { OrganizationReadApi } from '../../../organization/public/organization-read.api';
import { licensingAuditEvent } from '../../licensing-audit-event.mapper';
import { checkRelease, seatsToRelease } from '../decision/renewal-decision.policy';
import { RenewalNotifier } from '../subscription-renewal-notifier.service';
import { RenewalPartiesService } from '../subscription-renewal-parties.service';
import type { RankedSeat } from '../subscription-renewal-ranking.policy';
import { RenewalRankingService } from '../subscription-renewal-ranking.service';
import { RenewalError } from '../subscription-renewal.errors';
import { SubscriptionRenewalRepo } from '../subscription-renewal.repo';
import type { ReleasedSeat, RenewalChoice, RenewalRecord } from '../subscription-renewal.types';
import { checkProposable, checkProposedQuantity, milestoneOf } from './renewal-proposal.policy';

export interface ProposeRenewalInput {
  subscriptionId: string;
  choice: RenewalChoice;
  proposedQuantity?: number;
  note?: string;
  /** What the Business Owner said, as the IT Admin records it: an input for the decider, never a step (`US-11-05` AC-3). */
  businessOwnerOpinion?: string;
  /** The seats in use to take back when reducing below them (`QĐ-66x`): exactly the excess, none for another choice. */
  releasedAssignmentIds?: string[];
}

const textOf = (value: string | undefined): string | null => value?.trim() || null;

/**
 * The proposal of the IT Admin for a subscription period (`US-11-05` AC-1, AC-3, AC-5, AC-6, AC-15): renew as it is, reduce to a
 * number of seats naming the seats to take back, or cancel, with the opinion of the Business Owner if there is one. One case per
 * period; a period with no milestone waits for its contract data and a perpetual purchase or internal software has none. The
 * proposal is what puts the case in the queue of the head of the owner department, who confirms it and is told; nothing is decided
 * here (`SoD-3`). When the department has no head the case is made all the same and waits, and the Super Admin is told once.
 */
@Injectable()
export class RenewalProposalService {
  constructor(
    private readonly repo: SubscriptionRenewalRepo,
    private readonly periods: SubscriptionPeriodApi,
    private readonly parties: RenewalPartiesService,
    private readonly ranking: RenewalRankingService,
    private readonly organizationReads: OrganizationReadApi,
    private readonly notifier: RenewalNotifier,
    private readonly audit: AuditApi,
    private readonly runner: TransactionRunner,
  ) {}

  /** Throws RenewalError (`NOT_FOUND`, `NOT_RENEWABLE`, `CONTRACT_DATA_INCOMPLETE`, `QUANTITY_INVALID`, `EXCESS_SELECTION_INVALID`, `ALREADY_PROPOSED`, `PROPOSER_IS_OWNER_HEAD`). */
  async propose(actor: AuthenticatedPrincipal, input: ProposeRenewalInput): Promise<RenewalRecord> {
    const [period] = await this.periods.getPeriods([input.subscriptionId]);
    if (!period) throw new RenewalError('NOT_FOUND');
    const problem =
      checkProposable(period) ??
      checkProposedQuantity(input.choice, input.proposedQuantity ?? null, period.purchasedQuantity);
    if (problem) throw new RenewalError(problem);
    const milestone = milestoneOf(period);
    if (!milestone) throw new RenewalError('CONTRACT_DATA_INCOMPLETE');
    const today = await this.organizationReads.businessToday();

    return this.runner.run(async (tx) => {
      // The head of the owner department confirms the case: the IT Admin who is that head cannot also propose it (`SoD-3`).
      if ((await this.parties.ownerHeadOf(period.ownerDepartmentId, today, tx)) === actor.employeeId) {
        throw new RenewalError('PROPOSER_IS_OWNER_HEAD');
      }
      const organization = await this.organizationReads.getOrganization(tx);
      if (!organization) throw new Error('A renewal was proposed before installation');
      const seats = await this.ranking.seatsOf(period.subscriptionId, today, tx);
      const released = this.released(input, seats.held.length, seats.ranked);
      const created = await this.repo.insert(tx, {
        organizationId: organization.id,
        subscriptionId: period.subscriptionId,
        noticeBasis: milestone.basis,
        noticeBaseDate: milestone.baseDate,
        proposedChoice: input.choice,
        proposedQuantity: input.proposedQuantity ?? null,
        proposalNote: textOf(input.note),
        businessOwnerOpinion: textOf(input.businessOwnerOpinion),
        proposedByEmployeeId: actor.employeeId,
        proposedByAppUserId: actor.appUserId,
      });
      if (!created) throw new RenewalError('ALREADY_PROPOSED');
      await this.repo.insertReleased(tx, created.id, released);
      await this.audit.record(
        tx,
        licensingAuditEvent(
          actor,
          organization.id,
          'SUBSCRIPTION_RENEWAL.PROPOSED',
          'SubscriptionRenewal',
          created.id,
          null,
          {
            subscriptionId: created.subscriptionId,
            choice: created.proposedChoice,
            quantity: created.proposedQuantity,
            noticeBasis: created.noticeBasis,
            noticeBaseDate: created.noticeBaseDate,
            businessOwnerOpinionRecorded: created.businessOwnerOpinion !== null,
            releasedAssignmentIds: released.map((seat) => seat.assignmentId),
          },
        ),
      );
      await this.tellProposed(tx, created, period.ownerDepartmentId, today);

      return created;
    });
  }

  /** The seats chosen, checked against the ranking of today: exactly the excess when reducing below the seats in use, none otherwise. */
  private released(input: ProposeRenewalInput, seatsInUse: number, ranked: readonly RankedSeat[]): ReleasedSeat[] {
    const required = seatsToRelease(input.choice, input.proposedQuantity ?? null, seatsInUse);
    const selected = input.releasedAssignmentIds ?? [];
    const problem = checkRelease({ required, selected, offered: new Set(ranked.map((seat) => seat.assignmentId)) });
    if (problem) throw new RenewalError(problem, { required, selected: selected.length });
    const rankOf = new Map(ranked.map((seat) => [seat.assignmentId, seat]));

    return selected.map((assignmentId) => {
      const seat = rankOf.get(assignmentId) as RankedSeat;

      return { assignmentId, rankGroup: seat.group, position: seat.position };
    });
  }

  /**
   * The case is in the queue of the head of the owner department, who is told; when the department has none today it waits instead,
   * and the Super Admin is told once for this stretch of waiting.
   */
  private async tellProposed(tx: DbTx, created: RenewalRecord, ownerDepartmentId: string, today: BusinessDate) {
    const decider = await this.parties.deciderOf(ownerDepartmentId, created.proposedByEmployeeId, today, tx);
    if ((await this.parties.ownerHeadOf(ownerDepartmentId, today, tx)) === null) {
      await this.notifier.waitingForHead(
        tx,
        created,
        await this.parties.superAdminOf(tx),
        `sent:${created.proposedAt.getTime()}`,
      );
    }
    await this.notifier.tell(tx, {
      organizationId: created.organizationId,
      recipients: decider.employeeId ? [decider.employeeId] : [],
      code: 'SUBSCRIPTION_RENEWAL_PROPOSED',
      subject: { type: 'SUBSCRIPTION_RENEWAL', id: created.id },
      params: { renewalId: created.id, subscriptionId: created.subscriptionId, choice: created.proposedChoice },
      eventKey: `subscription-renewal-proposed:${created.id}`,
    });
  }
}
