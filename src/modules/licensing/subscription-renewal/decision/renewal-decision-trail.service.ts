import { Injectable } from '@nestjs/common';
import { TransactionRunner, type DbTx } from '../../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../../audit/public/audit.api';
import type { RenewalPeriodFacts } from '../../../catalog/public/subscription-period.types';
import { licensingAuditEvent } from '../../licensing-audit-event.mapper';
import { RenewalNotifier } from '../subscription-renewal-notifier.service';
import { RenewalPartiesService } from '../subscription-renewal-parties.service';
import type { ReleasedSeat, RenewalRecord } from '../subscription-renewal.types';

/**
 * The transaction and the trail of a decision: the audit event with what was decided and seen, and the notice of the result to the
 * IT Admin who carries it out (the one who proposed it and the one in charge of the owner department) and to Finance (`QĐ-94d`(2)).
 */
@Injectable()
export class RenewalDecisionTrail {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly audit: AuditApi,
    private readonly parties: RenewalPartiesService,
    private readonly notifier: RenewalNotifier,
  ) {}

  run<T>(work: (tx: DbTx) => Promise<T>): Promise<T> {
    return this.runner.run(work);
  }

  /** The proposal was out of date when the head confirmed it and is closed (A-H2): the audit event says what was seen. */
  async closedStale(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    record: RenewalRecord,
    details: Record<string, string | number | boolean | null>,
  ): Promise<void> {
    await this.audit.record(
      tx,
      licensingAuditEvent(
        actor,
        record.organizationId,
        'SUBSCRIPTION_RENEWAL.CLOSED_STALE',
        'SubscriptionRenewal',
        record.id,
        null,
        {
          subscriptionId: record.subscriptionId,
          required: details.required ?? null,
          stillHeld: details.stillHeld ?? null,
        },
      ),
    );
  }

  async told(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    decided: RenewalRecord,
    period: RenewalPeriodFacts,
    released: readonly ReleasedSeat[],
  ): Promise<void> {
    const decision = decided.decision;
    if (!decision) return;
    await this.audit.record(
      tx,
      licensingAuditEvent(
        actor,
        decided.organizationId,
        'SUBSCRIPTION_RENEWAL.DECIDED',
        'SubscriptionRenewal',
        decided.id,
        null,
        {
          subscriptionId: decided.subscriptionId,
          choice: decision.choice,
          quantity: decision.quantity,
          reason: decision.reason,
          deciderRole: decision.deciderRole,
          decidedOn: decision.decidedOn,
          decidedAfterDeadline: decision.decidedAfterDeadline,
          executionPoint: decision.executionPoint,
          seatsInUse: decision.activeSeatsAtDecision,
          releasedAssignmentIds: released.map((seat) => seat.assignmentId),
          snapshot: JSON.parse(JSON.stringify(decision.snapshot)) as { [key: string]: string },
          budgetCommitment: null,
        },
      ),
    );
    const itAdmin = await this.parties.itAdminOf(period, tx);
    const finance = await this.parties.financeOf(tx);
    await this.notifier.tell(tx, {
      organizationId: decided.organizationId,
      recipients: [decided.proposedByEmployeeId, ...(itAdmin ? [itAdmin] : []), ...(finance ? [finance] : [])],
      code: 'SUBSCRIPTION_RENEWAL_DECIDED',
      subject: { type: 'SUBSCRIPTION_RENEWAL', id: decided.id },
      params: {
        renewalId: decided.id,
        subscriptionId: decided.subscriptionId,
        choice: decision.choice,
        executionPoint: decision.executionPoint,
      },
      eventKey: `subscription-renewal-decided:${decided.id}`,
    });
  }
}
