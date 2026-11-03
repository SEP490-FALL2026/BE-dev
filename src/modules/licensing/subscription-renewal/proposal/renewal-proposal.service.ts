import { Injectable } from '@nestjs/common';
import { TransactionRunner, type DbTx } from '../../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../../audit/public/audit.api';
import { SubscriptionPeriodApi } from '../../../catalog/public/subscription-period.api';
import { OrganizationReadApi } from '../../../organization/public/organization-read.api';
import { licensingAuditEvent } from '../../licensing-audit-event.mapper';
import { RenewalNotifier } from '../subscription-renewal-notifier.service';
import { RenewalPartiesService } from '../subscription-renewal-parties.service';
import { RenewalError } from '../subscription-renewal.errors';
import { SubscriptionRenewalRepo } from '../subscription-renewal.repo';
import type { RenewalChoice, RenewalRecord } from '../subscription-renewal.types';
import { checkProposable, checkProposedQuantity, milestoneOf } from './renewal-proposal.policy';

export interface ProposeRenewalInput {
  subscriptionId: string;
  choice: RenewalChoice;
  proposedQuantity?: number;
  note?: string;
  /** What the Business Owner said, as the IT Admin records it: an input for the decider, never a step (`US-11-05` AC-3). */
  businessOwnerOpinion?: string;
}

const textOf = (value: string | undefined): string | null => value?.trim() || null;

/**
 * The proposal of the IT Admin for a subscription period (`US-11-05` AC-1, AC-3, AC-5, AC-6, AC-15): renew as it is, reduce to a
 * number of seats, or cancel, with the opinion of the Business Owner if there is one. One case per period; a period with no
 * milestone waits for its contract data and a perpetual purchase or internal software has none. The proposal is what puts the
 * case in the queue of the decider, who is told; nothing is decided here (`SoD-3`).
 */
@Injectable()
export class RenewalProposalService {
  constructor(
    private readonly repo: SubscriptionRenewalRepo,
    private readonly periods: SubscriptionPeriodApi,
    private readonly parties: RenewalPartiesService,
    private readonly organizationReads: OrganizationReadApi,
    private readonly notifier: RenewalNotifier,
    private readonly audit: AuditApi,
    private readonly runner: TransactionRunner,
  ) {}

  /** Throws RenewalError (`NOT_FOUND`, `NOT_RENEWABLE`, `CONTRACT_DATA_INCOMPLETE`, `QUANTITY_INVALID`, `ALREADY_PROPOSED`). */
  async propose(actor: AuthenticatedPrincipal, input: ProposeRenewalInput): Promise<RenewalRecord> {
    const [period] = await this.periods.getPeriods([input.subscriptionId]);
    if (!period) throw new RenewalError('NOT_FOUND');
    const problem =
      checkProposable(period) ??
      checkProposedQuantity(input.choice, input.proposedQuantity ?? null, period.purchasedQuantity);
    if (problem) throw new RenewalError(problem);
    const milestone = milestoneOf(period);
    if (!milestone) throw new RenewalError('CONTRACT_DATA_INCOMPLETE');

    return this.runner.run(async (tx) => {
      // The row of the grant of the spending approver first, `FOR SHARE`: a revocation that is being made and this proposal take turns,
      // so the case is told as waiting exactly once (`M6`, `M7`).
      const approver = await this.parties.usableApproverOf(tx, { forShare: true });
      const organization = await this.organizationReads.getOrganization(tx);
      if (!organization) throw new Error('A renewal was proposed before installation');
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
          },
        ),
      );
      await this.tellProposed(tx, created, actor.employeeId, approver);

      return created;
    });
  }

  /**
   * The case is in the queue of the decider, who is told; when nobody who works holds the role (`approver` is null, as read with the row
   * of the grant locked) it waits instead, and the Super Admin is told once for this stretch of waiting (`D-S16`).
   */
  private async tellProposed(
    tx: DbTx,
    created: RenewalRecord,
    proposerEmployeeId: string,
    approver: string | null,
  ): Promise<void> {
    if (approver === null) {
      await this.notifier.waitingForSpendingApprover(
        tx,
        created,
        await this.parties.superAdminOf(tx),
        `sent:${created.proposedAt.getTime()}`,
      );
    }
    const decider = await this.parties.deciderOf(proposerEmployeeId, tx);
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
