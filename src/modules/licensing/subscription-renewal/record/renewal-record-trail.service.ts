import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../../audit/public/audit.api';
import type { PeriodAdjustment, RenewalPeriodFacts } from '../../../catalog/public/subscription-period.types';
import { licensingAuditEvent } from '../../licensing-audit-event.mapper';
import type { SeatsNeededCounts } from '../seats-needed/renewal-seats-needed.policy';
import { RenewalNotifier } from '../subscription-renewal-notifier.service';
import { RenewalPartiesService } from '../subscription-renewal-parties.service';
import type { RenewalOutcomeKind, RenewalRecord } from '../subscription-renewal.types';
import { unintendedRenewalOf } from './renewal-record.policy';

/** Who recorded the result for whom (`QĐ-58b`): a substitute names the IT Admin responsible, who is told. */
export interface RecordedBy {
  substitute: boolean;
  responsibleItAdminEmployeeId: string | null;
}

/**
 * The trail of a result recorded at the point of adjustment: the audit event of the case with the seats counted and who stood in
 * (`QĐ-58b`), and the notices of the result, written in the transaction of what they tell.
 */
@Injectable()
export class RenewalRecordTrail {
  constructor(
    private readonly audit: AuditApi,
    private readonly parties: RenewalPartiesService,
    private readonly notifier: RenewalNotifier,
  ) {}

  async proposed(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    proposed: RenewalRecord,
    counts: SeatsNeededCounts,
    who: RecordedBy,
  ): Promise<void> {
    await this.audit.record(
      tx,
      licensingAuditEvent(
        actor,
        proposed.organizationId,
        'SUBSCRIPTION_RENEWAL.PROPOSED',
        'SubscriptionRenewal',
        proposed.id,
        null,
        {
          subscriptionId: proposed.subscriptionId,
          choice: proposed.proposedChoice,
          quantity: proposed.proposedQuantity,
          noticeBasis: proposed.noticeBasis,
          noticeBaseDate: proposed.noticeBaseDate,
          seatsNeeded: counts.seatsNeeded,
          heldPastRenewal: counts.heldPastRenewal,
          pendingContinuations: counts.pendingContinuations,
          approvedAwaitingGrant: counts.approvedAwaitingGrant,
          vendorMinimumApplied: counts.target > counts.seatsNeeded,
          substitute: who.substitute,
          responsibleItAdminEmployeeId: who.responsibleItAdminEmployeeId,
        },
      ),
    );
  }

  /**
   * Finance is told of the result (with `substitute` recorded in audit/params when another IT Admin recorded for an
   * absent or locked responsible IT Admin); the spending approver is not. A renewal the vendor made that was not chosen
   * is told at once to the spending approver, the IT Admin of the subscription and Finance.
   */
  async told(
    tx: DbTx,
    recorded: RenewalRecord,
    period: RenewalPeriodFacts,
    adjustment: PeriodAdjustment,
    who: RecordedBy,
    input: { outcome: RenewalOutcomeKind; nextQuantity: number | null },
  ): Promise<void> {
    const finance = await this.parties.financeOf(tx);
    await this.notifier.tell(tx, {
      organizationId: recorded.organizationId,
      recipients: finance === null ? [] : [finance],
      code: 'SUBSCRIPTION_RENEWAL_OUTCOME_RECORDED',
      subject: { type: 'SUBSCRIPTION', id: recorded.subscriptionId },
      params: {
        renewalId: recorded.id,
        subscriptionId: recorded.subscriptionId,
        choice: recorded.proposedChoice,
        quantity: recorded.proposedQuantity,
        outcome: recorded.outcome?.kind ?? input.outcome,
        nextSubscriptionId: recorded.outcome?.nextSubscriptionId ?? null,
        substitute: who.substitute,
      },
      eventKey: `subscription-renewal-outcome:${recorded.id}`,
    });
    const unintended = unintendedRenewalOf({
      choice: recorded.proposedChoice,
      quantity: recorded.proposedQuantity,
      outcome: input.outcome,
      nextQuantity: input.nextQuantity,
    });
    if (!unintended) return;
    const approver = await this.parties.approverOf(tx);
    await this.notifier.tell(tx, {
      organizationId: recorded.organizationId,
      recipients: [approver, await this.parties.itAdminOf(period, tx), finance].filter((person) => person !== null),
      code: 'SUBSCRIPTION_AUTO_RENEWAL_INCIDENT',
      subject: { type: 'SUBSCRIPTION', id: recorded.subscriptionId },
      params: { subscriptionId: recorded.subscriptionId, baseDate: adjustment.end, renewalId: recorded.id },
      eventKey: `subscription-incident:${recorded.id}`,
    });
  }
}
